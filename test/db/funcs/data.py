from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def register_item_offer(
    session: AsyncSession,
    creator_id: int,
    item_id: int,
    price: float,
    description: str | None,
) -> int:
    item_row = (
        (
            await session.execute(
                text(
                    """
                SELECT id, creator_id, ledger_head
                FROM core.items
                WHERE id = :item_id
                FOR UPDATE
                """
                ),
                {"item_id": item_id},
            )
        )
        .mappings()
        .first()
    )
    if item_row is None:
        raise ValueError(f"Item {item_id} does not exists")

    if item_row["creator_id"] != creator_id:
        raise ValueError(f"User {creator_id} does not own item {item_id}")

    existing_offer = (
        (
            await session.execute(
                text(
                    """
                SELECT id, status
                FROM data.offers
                WHERE item_id = :item_id
                LIMIT 1
                """
                ),
                {"item_id": item_id},
            )
        )
        .mappings()
        .first()
    )

    if existing_offer is not None:
        if existing_offer["status"] == "CLOSED":
            result = await session.execute(
                text(
                    """
                    UPDATE data.offers
                    SET status = 'ACTIVE',
                        price = (:price)::numeric::money,
                        description = :description,
                        stamp = (now(), now())
                    WHERE id = :offer_id
                    RETURNING id, (stamp).created_at AS created_at
                    """
                ),
                {
                    "price": price,
                    "description": description,
                    "offer_id": existing_offer["id"],
                },
            )
            row = result.mappings().first()
            offer_id = row["id"]
            stamp = row["created_at"]
        else:
            raise ValueError(
                f"An active or reserved offer already exists for item {item_id}"
            )
    else:
        result = await session.execute(
            text(
                """
                INSERT INTO data.offers (status, price, description, item_id, creator_id)
                VALUES ('ACTIVE', (:price)::numeric::money, :description, :item_id, :creator_id)
                RETURNING id, (stamp).created_at AS created_at
                """
            ),
            {
                "price": price,
                "description": description,
                "item_id": item_id,
                "creator_id": creator_id,
            },
        )
        row = result.mappings().first()
        if row is None:
            raise RuntimeError("Failed to insert offer")
        offer_id = row["id"]
        stamp = row["created_at"]

    offer_hash = await session.scalar(
        text(
            """
            SELECT data._offer_hash(
                :offer_id,
                :item_id,
                :creator_id,
                (:price)::numeric::money,
                :description,
                :stamp
            )
            """
        ),
        {
            "offer_id": offer_id,
            "item_id": item_id,
            "creator_id": creator_id,
            "price": price,
            "description": description,
            "stamp": stamp,
        },
    )
    if offer_hash is None:
        raise RuntimeError("Failed to compute offer hash")

    await session.execute(
        text(
            """
            SELECT audit.append_item_event(
                :ledger_head,
                :item_id,
                :creator_id,
                'REGISTER_OFFER',
                :event_hash
            )
            """
        ),
        {
            "ledger_head": item_row["ledger_head"],
            "item_id": item_id,
            "creator_id": creator_id,
            "event_hash": offer_hash,
        },
    )

    return int(offer_id)


async def cancel_item_offer(
    session: AsyncSession,
    user_id: int,
    offer_id: int,
) -> None:
    offer_row = (
        (
            await session.execute(
                text(
                    """
                SELECT o.id, o.status, o.item_id, o.price, o.description,
                       i.creator_id, i.ledger_head
                FROM data.offers o
                JOIN core.items i ON o.item_id = i.id
                WHERE o.id = :offer_id
                """
                ),
                {"offer_id": offer_id},
            )
        )
        .mappings()
        .first()
    )

    if offer_row is None:
        raise ValueError(f"Offer with id {offer_id} does not exist")

    if offer_row["creator_id"] != user_id:
        raise ValueError(f"User {user_id} does not own the offer {offer_id}")

    if offer_row["status"] not in ("ACTIVE", "RESERVED"):
        raise ValueError(
            f"Offer {offer_id} cannot be cancelled (status={offer_row['status']})"
        )

    v_stamp = await session.scalar(text("SELECT now()"))

    await session.execute(
        text(
            """
            UPDATE data.offers
            SET status = 'CLOSED',
                stamp = ((stamp).created_at, :v_stamp)
            WHERE id = :offer_id
            """
        ),
        {"v_stamp": v_stamp, "offer_id": offer_id},
    )

    await session.execute(
        text(
            """
            UPDATE data.bids
            SET status = 'CANCELLED'
            WHERE offer_id = :offer_id AND status = 'PENDING'
            """
        ),
        {"offer_id": offer_id},
    )

    offer_hash = await session.scalar(
        text(
            """
            SELECT data._offer_hash(
                :offer_id,
                o.item_id,
                :user_id,
                o.price,
                o.description,
                :stamp
            )
            FROM data.offers o
            WHERE o.id = :offer_id
            """
        ),
        {
            "offer_id": offer_id,
            "user_id": user_id,
            "stamp": v_stamp,
        },
    )
    if offer_hash is None:
        raise RuntimeError("Failed to compute offer hash")

    await session.execute(
        text(
            """
            SELECT audit.append_item_event(
                :ledger_head,
                :item_id,
                :user_id,
                'CANCEL_OFFER',
                :event_hash
            )
            """
        ),
        {
            "ledger_head": offer_row["ledger_head"],
            "item_id": offer_row["item_id"],
            "user_id": user_id,
            "event_hash": offer_hash,
        },
    )


async def place_item_bid(
    session: AsyncSession,
    bidder_id: int,
    offer_id: int,
    value: float,
) -> int:
    offer_row = (
        (
            await session.execute(
                text(
                    """
                SELECT o.status, o.item_id, i.creator_id, i.ledger_head
                FROM data.offers o
                JOIN core.items i ON o.item_id = i.id
                WHERE o.id = :offer_id AND i.creator_id <> :bidder_id
                """
                ),
                {"offer_id": offer_id, "bidder_id": bidder_id},
            )
        )
        .mappings()
        .first()
    )

    if offer_row is None or offer_row["status"] != "ACTIVE":
        raise ValueError(f"Offer {offer_id} is not active")

    result = await session.execute(
        text(
            """
            INSERT INTO data.bids (offer_id, bidder_id, value, status)
            VALUES (:offer_id, :bidder_id, (:value)::numeric::money, 'PENDING')
            RETURNING id
            """
        ),
        {"offer_id": offer_id, "bidder_id": bidder_id, "value": value},
    )
    row = result.mappings().first()
    if row is None:
        raise RuntimeError("Failed to insert bid")

    return int(row["id"])


async def cancel_item_bid(
    session: AsyncSession,
    bidder_id: int,
    bid_id: int,
) -> None:
    bid_row = (
        (
            await session.execute(
                text(
                    """
                SELECT b.id, b.status, b.offer_id, b.bidder_id, b.value, b.created_at,
                       o.status AS offer_status, o.item_id, i.creator_id, i.ledger_head
                FROM data.bids b
                JOIN data.offers o ON b.offer_id = o.id
                JOIN core.items i ON o.item_id = i.id
                WHERE b.id = :bid_id
                """
                ),
                {"bid_id": bid_id},
            )
        )
        .mappings()
        .first()
    )

    if bid_row is None:
        raise ValueError(f"Bid with id {bid_id} does not exist")

    if bid_row["bidder_id"] != bidder_id:
        raise ValueError(f"User {bidder_id} does not own the bid {bid_id}")

    if bid_row["status"] != "PENDING":
        raise ValueError(
            f"Bid {bid_id} cannot be cancelled (status={bid_row['status']})"
        )

    if bid_row["offer_status"] not in ("ACTIVE", "RESERVED"):
        raise ValueError(
            f"Offer {bid_row['offer_id']} is not in a state to cancel bids (status={bid_row['offer_status']})"
        )

    await session.execute(
        text(
            """
            UPDATE data.bids
            SET status = 'CANCELLED'
            WHERE id = :bid_id
            """
        ),
        {"bid_id": bid_id},
    )


async def comment_item_offer(
    session: AsyncSession,
    commenter_id: int,
    offer_id: int,
    subject: str,
    contents: str,
) -> int:
    offer_row = (
        (
            await session.execute(
                text(
                    """
                SELECT id, creator_id, status
                FROM data.offers
                WHERE id = :offer_id
                """
                ),
                {"offer_id": offer_id},
            )
        )
        .mappings()
        .first()
    )

    if offer_row is None:
        raise ValueError(f"Offer {offer_id} does not exist")

    if offer_row["status"] == "CLOSED":
        raise ValueError(f"Cannot comment on a closed offer (offer_id={offer_id})")

    bid_row = (
        (
            await session.execute(
                text(
                    """
                SELECT id
                FROM data.bids
                WHERE status = 'PENDING'
                  AND offer_id = :offer_id
                  AND bidder_id = :commenter_id
                LIMIT 1
                """
                ),
                {"offer_id": offer_id, "commenter_id": commenter_id},
            )
        )
        .mappings()
        .first()
    )

    if bid_row is not None:
        result = await session.execute(
            text(
                """
                INSERT INTO data.conversations (subject, contents, commenter_id, offer_id, bid_id)
                VALUES (:subject, :contents, :commenter_id, :offer_id, :bid_id)
                RETURNING id
                """
            ),
            {
                "subject": subject,
                "contents": contents,
                "commenter_id": commenter_id,
                "offer_id": offer_id,
                "bid_id": bid_row["id"],
            },
        )
    else:
        result = await session.execute(
            text(
                """
                INSERT INTO data.conversations (subject, contents, commenter_id, offer_id)
                VALUES (:subject, :contents, :commenter_id, :offer_id)
                RETURNING id
                """
            ),
            {
                "subject": subject,
                "contents": contents,
                "commenter_id": commenter_id,
                "offer_id": offer_id,
            },
        )

    row = result.mappings().first()
    if row is None:
        raise RuntimeError("Failed to insert conversation")

    return int(row["id"])
