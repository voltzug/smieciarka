from __future__ import annotations

import asyncio
from decimal import Decimal

from db.funcs import core as core_funcs
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from util import TestContext, elapsed_ms, now_ns

from tests.core import items as core_items
from tests.data import bids as bids_api
from tests.data import comments as comments_api
from tests.data import offers as offers_api


async def _find_item_without_active_offer(session: AsyncSession) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT i.id, i.creator_id
            FROM core.items i
            LEFT JOIN data.offers o
              ON o.item_id = i.id AND o.status IN ('ACTIVE','RESERVED')
            WHERE o.id IS NULL
            ORDER BY i.id
            LIMIT 1
            """
        )
    )
    return result.mappings().first()


async def _create_user_and_item(
    session: AsyncSession, client_id: int, idx: int
) -> dict:
    login = f"scenario_u_{client_id}_{idx}"
    email = f"scenario_u_{client_id}_{idx}@example.com"
    user_id = await core_items.create_user(
        session, login, "pass", "Name", "Surname", email
    )
    sn = f"SN-{user_id}-{idx}"
    title = f"Scenario Item {idx}"
    item_id = await core_funcs.create_item(session, user_id, sn, title)
    return {"id": item_id, "creator_id": user_id}


async def _ensure_bidder(
    session: AsyncSession, creator_id: int, client_id: int, idx: int
) -> int:
    bidder_id = await session.scalar(
        text("SELECT id FROM core.users WHERE id <> :creator_id LIMIT 1"),
        {"creator_id": creator_id},
    )
    if bidder_id is not None:
        return int(bidder_id)

    login = f"scenario_b_{client_id}_{idx}"
    email = f"scenario_b_{client_id}_{idx}@example.com"
    return await core_items.create_user(
        session, login, "pass", "Name", "Surname", email
    )


async def _search_flow(
    ctx: TestContext, metrics, offer_id: int, iteration: int
) -> None:
    async with ctx.db.sessionmaker() as session:
        start = now_ns()
        ok = 1
        error = ""
        try:
            await offers_api.search_offer_by_id(session, offer_id)
        except Exception as exc:  # noqa: BLE001
            ok = 0
            error = str(exc)
        await metrics.log(
            "scenario.offers.search",
            iteration,
            client_id=ctx.client_id,
            ok=ok,
            latency_ms=elapsed_ms(start),
            error=error,
        )


async def _bid_flow(
    ctx: TestContext,
    metrics,
    offer_id: int,
    creator_id: int,
    iteration: int,
) -> None:
    async with ctx.db.sessionmaker() as session:
        start = now_ns()
        ok = 1
        error = ""
        bid_id = None
        try:
            async with session.begin():
                bidder_id = await _ensure_bidder(
                    session, creator_id, ctx.client_id, iteration
                )
                value = Decimal(1000) + Decimal(0.01) + Decimal(iteration) / Decimal(100)
                bid_id = await bids_api.place_bid(session, bidder_id, offer_id, value)
            await metrics.log(
                "scenario.bids.place",
                iteration,
                client_id=ctx.client_id,
                ok=1,
                latency_ms=elapsed_ms(start),
                error="",
            )
        except Exception as exc:  # noqa: BLE001
            ok = 0
            error = str(exc)
            await metrics.log(
                "scenario.bids.place",
                iteration,
                client_id=ctx.client_id,
                ok=0,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            return

        start = now_ns()
        try:
            async with session.begin():
                await comments_api.comment_offer(
                    session,
                    bidder_id,
                    offer_id,
                    f"question for offer {offer_id}",
                    f"comment from user {bidder_id}",
                )
            await metrics.log(
                "scenario.comments.offer",
                iteration,
                client_id=ctx.client_id,
                ok=1,
                latency_ms=elapsed_ms(start),
                error="",
            )
        except Exception as exc:  # noqa: BLE001
            await metrics.log(
                "scenario.comments.offer",
                iteration,
                client_id=ctx.client_id,
                ok=0,
                latency_ms=elapsed_ms(start),
                error=str(exc),
            )

        if bid_id is None:
            return

        start = now_ns()
        try:
            async with session.begin():
                await bids_api.cancel_bid(session, bidder_id, bid_id)
            await metrics.log(
                "scenario.bids.cancel",
                iteration,
                client_id=ctx.client_id,
                ok=1,
                latency_ms=elapsed_ms(start),
                error="",
            )
        except Exception as exc:  # noqa: BLE001
            await metrics.log(
                "scenario.bids.cancel",
                iteration,
                client_id=ctx.client_id,
                ok=0,
                latency_ms=elapsed_ms(start),
                error=str(exc),
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
        offer_id = None
        creator_id = None
        item_id = None

        try:
            async with session.begin():
                item = await _find_item_without_active_offer(session)
                if item is None:
                    item = await _create_user_and_item(session, client_id, i)
                item_id = int(item["id"])
                creator_id = int(item["creator_id"])
                price = Decimal(100) + Decimal(rng.randint(0, 10000)) / Decimal(100)
                offer_id = await offers_api.register_offer(
                    session,
                    creator_id,
                    item_id,
                    price,
                    f"scenario offer for item {item_id}",
                )
            await metrics.log(
                "scenario.offers.register",
                i,
                client_id=client_id,
                ok=1,
                latency_ms=elapsed_ms(start),
                error="",
            )
        except Exception as exc:  # noqa: BLE001
            ok = 0
            error = str(exc)
            await metrics.log(
                "scenario.offers.register",
                i,
                client_id=client_id,
                ok=0,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            continue

        if offer_id is None or creator_id is None or item_id is None:
            continue

        start = now_ns()
        try:
            async with session.begin():
                await offers_api.cancel_offer(session, creator_id, offer_id)
            await metrics.log(
                "scenario.offers.cancel",
                i,
                client_id=client_id,
                ok=1,
                latency_ms=elapsed_ms(start),
                error="",
            )
        except Exception as exc:  # noqa: BLE001
            await metrics.log(
                "scenario.offers.cancel",
                i,
                client_id=client_id,
                ok=0,
                latency_ms=elapsed_ms(start),
                error=str(exc),
            )
            continue

        start = now_ns()
        try:
            async with session.begin():
                price = Decimal(150) + Decimal(rng.randint(0, 10000)) / Decimal(100)
                offer_id = await offers_api.register_offer(
                    session,
                    creator_id,
                    item_id,
                    price,
                    f"scenario updated offer for item {item_id}",
                )
            await metrics.log(
                "scenario.offers.reregister",
                i,
                client_id=client_id,
                ok=1,
                latency_ms=elapsed_ms(start),
                error="",
            )
        except Exception as exc:  # noqa: BLE001
            await metrics.log(
                "scenario.offers.reregister",
                i,
                client_id=client_id,
                ok=0,
                latency_ms=elapsed_ms(start),
                error=str(exc),
            )
            continue

        await asyncio.gather(
            _search_flow(ctx, metrics, offer_id, i),
            _bid_flow(ctx, metrics, offer_id, creator_id, i),
        )
