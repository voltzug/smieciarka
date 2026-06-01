from __future__ import annotations

from db.funcs import data as data_funcs
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from util import TestContext, elapsed_ms, now_ns


async def comment_offer(
    session: AsyncSession,
    commenter_id: int,
    offer_id: int,
    subject: str,
    contents: str,
) -> int:
    return await data_funcs.comment_item_offer(
        session, commenter_id, offer_id, subject, contents
    )


async def comment_bid(
    session: AsyncSession,
    commenter_id: int,
    bid_id: int,
    subject: str,
    contents: str,
) -> int:
    bid_row = (
        (
            await session.execute(
                text(
                    """
                SELECT id, offer_id, bidder_id, status
                FROM data.bids
                WHERE id = :bid_id
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
    if bid_row["bidder_id"] != commenter_id:
        raise ValueError(f"User {commenter_id} does not own the bid {bid_id}")
    if bid_row["status"] != "PENDING":
        raise ValueError(
            f"Bid {bid_id} cannot be commented (status={bid_row['status']})"
        )

    return await data_funcs.comment_item_offer(
        session, commenter_id, int(bid_row["offer_id"]), subject, contents
    )


async def _count_open_offers(session: AsyncSession) -> int:
    result = await session.scalar(
        text("SELECT COUNT(*) FROM data.offers WHERE status <> 'CLOSED'")
    )
    return int(result or 0)


async def _pick_open_offer(session: AsyncSession, offset: int) -> int | None:
    return await session.scalar(
        text(
            """
            SELECT id
            FROM data.offers
            WHERE status <> 'CLOSED'
            OFFSET :offset LIMIT 1
            """
        ),
        {"offset": offset},
    )


async def _count_users(session: AsyncSession) -> int:
    result = await session.scalar(text("SELECT COUNT(*) FROM core.users"))
    return int(result or 0)


async def _pick_user(session: AsyncSession, offset: int) -> int | None:
    return await session.scalar(
        text("SELECT id FROM core.users OFFSET :offset LIMIT 1"),
        {"offset": offset},
    )


async def test(
    iterations: int, ctx: TestContext, metrics, session: AsyncSession
) -> None:
    rng = ctx.rng
    client_id = ctx.client_id

    for i in range(iterations):
        start = now_ns()
        ok = 1
        error = ""
        try:
            async with session.begin():
                open_count = await _count_open_offers(session)
                users_count = await _count_users(session)
                if open_count == 0 or users_count == 0:
                    raise RuntimeError("no_open_offers_or_users")
                offer_offset = rng.randint(0, open_count - 1)
                offer_id = await _pick_open_offer(session, offer_offset)
                if offer_id is None:
                    raise RuntimeError("no_open_offers")
                commenter_offset = rng.randint(0, users_count - 1)
                commenter_id = await _pick_user(session, commenter_offset)
                if commenter_id is None:
                    raise RuntimeError("no_users")
                await comment_offer(
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
