from __future__ import annotations

from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from util import TestContext, elapsed_ms, now_ns

from tests.data import bids as bids_api
from tests.data import comments as comments_api
from tests.data import offers as offers_api


async def _cap_count(session: AsyncSession, table: str, cap: int) -> int:
    result = await session.scalar(
        text(f"SELECT LEAST(count(*), :cap) FROM {table}"), {"cap": cap}
    )
    return int(result or 0)


async def test(
    iterations: int, ctx: TestContext, metrics, session: AsyncSession
) -> None:
    rng = ctx.rng
    client_id = ctx.client_id
    scale = ctx.scale

    users_n = 1000 * scale
    items_n = 1000 * scale
    offers_n = 1000 * scale
    bids_n = 1000 * scale

    for i in range(iterations):
        chance = rng.randint(0, 99)

        if chance < 20:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    candidate_rows = (
                        (
                            await session.execute(
                                text(
                                    """
                                            SELECT i.id, i.creator_id
                                            FROM core.items i
                                            LEFT JOIN data.offers o
                                            ON o.item_id = i.id AND o.status IN ('ACTIVE','RESERVED')
                                            WHERE o.id IS NULL
                                            LIMIT :limit
                                            """
                                ),
                                {"limit": items_n % 29},
                            )
                        )
                        .mappings()
                        .all()
                    )

                    if not candidate_rows:
                        raise RuntimeError("no_items_without_offer")

                    # 2. Pick a random item candidate completely in-memory inside Python
                    item = rng.choice(candidate_rows)

                    price_cents = rng.randint(100, 100000)
                    price = Decimal(price_cents) / Decimal(100)

                    # 3. Call your API function directly using the preselected IDs
                    await offers_api.register_offer(
                        session,
                        int(item["creator_id"]),
                        int(item["id"]),
                        price,
                        f"offer for item {item['id']}",
                    )
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "data.offers.register",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            continue

        if chance < 35:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    cancellable_count = await session.scalar(
                        text(
                            """
                            SELECT COUNT(*)
                            FROM data.offers
                            WHERE status IN ('ACTIVE','RESERVED')
                            """
                        )
                    )
                    if not cancellable_count or int(cancellable_count) == 0:
                        raise RuntimeError("no_cancellable_offers")
                    offer_offset = rng.randint(0, int(cancellable_count) - 1)
                    offer = (
                        (
                            await session.execute(
                                text(
                                    """
                                SELECT id, creator_id
                                FROM data.offers
                                WHERE status IN ('ACTIVE','RESERVED')
                                OFFSET :offset LIMIT 1
                                """
                                ),
                                {"offset": offer_offset},
                            )
                        )
                        .mappings()
                        .first()
                    )
                    if offer is None:
                        raise RuntimeError("no_cancellable_offers")
                    await offers_api.cancel_offer(
                        session, int(offer["creator_id"]), int(offer["id"])
                    )
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "data.offers.cancel",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            continue

        if chance < 55:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    active_offers = await session.scalar(
                        text("SELECT COUNT(*) FROM data.offers WHERE status = 'ACTIVE'")
                    )
                    if not active_offers or int(active_offers) == 0:
                        raise RuntimeError("no_active_offers")
                    offer_offset = rng.randint(0, int(active_offers) - 1)
                    offer = (
                        (
                            await session.execute(
                                text(
                                    """
                                SELECT id, creator_id, price::numeric AS offer_price_num
                                FROM data.offers
                                WHERE status = 'ACTIVE'
                                OFFSET :offset LIMIT 1
                                """
                                ),
                                {"offset": offer_offset},
                            )
                        )
                        .mappings()
                        .first()
                    )
                    if offer is None:
                        raise RuntimeError("no_active_offers")
                    other_users = await session.scalar(
                        text("SELECT COUNT(*) FROM core.users WHERE id <> :creator_id"),
                        {"creator_id": offer["creator_id"]},
                    )
                    if not other_users or int(other_users) == 0:
                        raise RuntimeError("no_other_users")
                    bidder_offset = rng.randint(0, int(other_users) - 1)
                    bidder_id = await session.scalar(
                        text(
                            """
                            SELECT id
                            FROM core.users
                            WHERE id <> :creator_id
                            OFFSET :offset LIMIT 1
                            """
                        ),
                        {"creator_id": offer["creator_id"], "offset": bidder_offset},
                    )
                    if bidder_id is None:
                        raise RuntimeError("no_other_users")
                    bid_bump_cents = rng.randint(0, 5000)
                    offer_price = Decimal(str(offer["offer_price_num"]))
                    value = offer_price + (Decimal(bid_bump_cents) / Decimal(100))
                    await bids_api.place_bid(
                        session, int(bidder_id), int(offer["id"]), value
                    )
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "data.bids.place",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            continue

        if chance < 65:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    pending_count = await session.scalar(
                        text("SELECT COUNT(*) FROM data.bids WHERE status = 'PENDING'")
                    )
                    if not pending_count or int(pending_count) == 0:
                        raise RuntimeError("no_pending_bids")
                    bid_offset = rng.randint(0, int(pending_count) - 1)
                    bid = (
                        (
                            await session.execute(
                                text(
                                    """
                                SELECT id, bidder_id
                                FROM data.bids
                                WHERE status = 'PENDING'
                                OFFSET :offset LIMIT 1
                                """
                                ),
                                {"offset": bid_offset},
                            )
                        )
                        .mappings()
                        .first()
                    )
                    if bid is None:
                        raise RuntimeError("no_pending_bids")
                    await bids_api.cancel_bid(
                        session, int(bid["bidder_id"]), int(bid["id"])
                    )
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "data.bids.cancel",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            continue

        if chance >= 85:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    users_count = await _cap_count(session, "core.users", users_n)
                    open_offers = await session.scalar(
                        text(
                            "SELECT COUNT(*) FROM data.offers WHERE status <> 'CLOSED'"
                        )
                    )
                    if users_count == 0 or not open_offers or int(open_offers) == 0:
                        raise RuntimeError("no_open_offers_or_users")
                    offer_offset = rng.randint(0, int(open_offers) - 1)
                    offer_id = await session.scalar(
                        text(
                            """
                            SELECT id
                            FROM data.offers
                            WHERE status <> 'CLOSED'
                            OFFSET :offset LIMIT 1
                            """
                        ),
                        {"offset": offer_offset},
                    )
                    if offer_id is None:
                        raise RuntimeError("no_open_offers")
                    commenter_offset = rng.randint(0, users_count - 1)
                    commenter_id = await session.scalar(
                        text("SELECT id FROM core.users OFFSET :offset LIMIT 1"),
                        {"offset": commenter_offset},
                    )
                    if commenter_id is None:
                        raise RuntimeError("no_users")
                    await comments_api.comment_offer(
                        session,
                        int(commenter_id),
                        int(offer_id),
                        f"question for offer {offer_id}",
                        f"comment from user {commenter_id}",
                    )
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "data.comments.offer",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
