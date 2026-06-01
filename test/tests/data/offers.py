from __future__ import annotations

from decimal import Decimal

from db.funcs import data as data_funcs
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from util import TestContext, elapsed_ms, now_ns


async def register_offer(
    session: AsyncSession,
    creator_id: int,
    item_id: int,
    price: Decimal,
    description: str,
) -> int:
    return await data_funcs.register_item_offer(
        session, creator_id, item_id, float(price), description
    )


async def cancel_offer(session: AsyncSession, user_id: int, offer_id: int) -> None:
    await data_funcs.cancel_item_offer(session, user_id, offer_id)


async def search_offer_by_id(session: AsyncSession, offer_id: int) -> None:
    await session.execute(
        text("SELECT id, status, price, item_id FROM data.offers WHERE id = :offer_id"),
        {"offer_id": offer_id},
    )


async def _count_items_without_active_offer(session: AsyncSession) -> int:
    result = await session.scalar(
        text(
            """
            SELECT COUNT(*)
            FROM core.items i
            LEFT JOIN data.offers o
              ON o.item_id = i.id AND o.status IN ('ACTIVE','RESERVED')
            WHERE o.id IS NULL
            """
        )
    )
    return int(result or 0)


async def _pick_item_without_active_offer(
    session: AsyncSession, offset: int
) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT i.id, i.creator_id
            FROM core.items i
            LEFT JOIN data.offers o
              ON o.item_id = i.id AND o.status IN ('ACTIVE','RESERVED')
            WHERE o.id IS NULL
            OFFSET :offset LIMIT 1
            """
        ),
        {"offset": offset},
    )
    return result.mappings().first()


async def _count_cancellable_offers(session: AsyncSession) -> int:
    result = await session.scalar(
        text("SELECT COUNT(*) FROM data.offers WHERE status IN ('ACTIVE','RESERVED')")
    )
    return int(result or 0)


async def _pick_cancellable_offer(session: AsyncSession, offset: int) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT id, creator_id
            FROM data.offers
            WHERE status IN ('ACTIVE','RESERVED')
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
                    count = await _count_items_without_active_offer(session)
                    if count == 0:
                        raise RuntimeError("no_items_without_offer")
                    offset = rng.randint(0, count - 1)
                    item = await _pick_item_without_active_offer(session, offset)
                    if item is None:
                        raise RuntimeError("no_items_without_offer")
                    price_cents = rng.randint(100, 100000)
                    price = Decimal(price_cents) / Decimal(100)
                    await register_offer(
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
        else:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    count = await _count_cancellable_offers(session)
                    if count == 0:
                        raise RuntimeError("no_cancellable_offers")
                    offset = rng.randint(0, count - 1)
                    offer = await _pick_cancellable_offer(session, offset)
                    if offer is None:
                        raise RuntimeError("no_cancellable_offers")
                    await cancel_offer(
                            session,
                            int(offer["creator_id"]),
                            int(offer["id"]),
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
