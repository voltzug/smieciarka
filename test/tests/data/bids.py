from __future__ import annotations

from decimal import Decimal

from db.funcs import data as data_funcs
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from util import TestContext, elapsed_ms, now_ns


async def place_bid(
    session: AsyncSession,
    bidder_id: int,
    offer_id: int,
    value: Decimal,
) -> int:
    return await data_funcs.place_item_bid(session, bidder_id, offer_id, float(value))


async def cancel_bid(session: AsyncSession, bidder_id: int, bid_id: int) -> None:
    await data_funcs.cancel_item_bid(session, bidder_id, bid_id)


async def _count_active_offers(session: AsyncSession) -> int:
    result = await session.scalar(
        text("SELECT COUNT(*) FROM data.offers WHERE status = 'ACTIVE'")
    )
    return int(result or 0)


async def _pick_active_offer(session: AsyncSession, offset: int) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT id, creator_id, price::numeric AS offer_price_num
            FROM data.offers
            WHERE status = 'ACTIVE'
            OFFSET :offset LIMIT 1
            """
        ),
        {"offset": offset},
    )
    return result.mappings().first()


async def _count_other_users(session: AsyncSession, creator_id: int) -> int:
    result = await session.scalar(
        text("SELECT COUNT(*) FROM core.users WHERE id <> :creator_id"),
        {"creator_id": creator_id},
    )
    return int(result or 0)


async def _pick_other_user(
    session: AsyncSession, creator_id: int, offset: int
) -> int | None:
    return await session.scalar(
        text(
            """
            SELECT id
            FROM core.users
            WHERE id <> :creator_id
            OFFSET :offset LIMIT 1
            """
        ),
        {"creator_id": creator_id, "offset": offset},
    )


async def _count_pending_bids(session: AsyncSession) -> int:
    result = await session.scalar(
        text("SELECT COUNT(*) FROM data.bids WHERE status = 'PENDING'")
    )
    return int(result or 0)


async def _pick_pending_bid(session: AsyncSession, offset: int) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT id, bidder_id
            FROM data.bids
            WHERE status = 'PENDING'
            OFFSET :offset LIMIT 1
            """
        ),
        {"offset": offset},
    )
    return result.mappings().first()


async def test(
    iterations: int, ctx: TestContext, metrics, session: AsyncSession
) -> None:
    rng = ctx.rng
    client_id = ctx.client_id

    for i in range(iterations):
        chance = rng.randint(0, 99)

        if chance < 50:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    count = await _count_active_offers(session)
                    if count == 0:
                        raise RuntimeError("no_active_offers")
                    offset = rng.randint(0, count - 1)
                    offer = await _pick_active_offer(session, offset)
                    if offer is None:
                        raise RuntimeError("no_active_offers")
                    other_count = await _count_other_users(
                        session, int(offer["creator_id"])
                    )
                    if other_count == 0:
                        raise RuntimeError("no_other_users")
                    bidder_offset = rng.randint(0, other_count - 1)
                    bidder_id = await _pick_other_user(
                        session, int(offer["creator_id"]), bidder_offset
                    )
                    if bidder_id is None:
                        raise RuntimeError("no_other_users")
                    bid_bump_cents = rng.randint(0, 5000)
                    offer_price = Decimal(str(offer["offer_price_num"]))
                    value = offer_price + Decimal(0.01) + (Decimal(bid_bump_cents) / Decimal(100))
                    await place_bid(session, int(bidder_id), int(offer["id"]), value)
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
        else:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    count = await _count_pending_bids(session)
                    if count == 0:
                        raise RuntimeError("no_pending_bids")
                    offset = rng.randint(0, count - 1)
                    bid = await _pick_pending_bid(session, offset)
                    if bid is None:
                        raise RuntimeError("no_pending_bids")
                    await cancel_bid(session, int(bid["bidder_id"]), int(bid["id"]))
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
