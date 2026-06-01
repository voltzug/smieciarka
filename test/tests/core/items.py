from __future__ import annotations

from db.funcs import core as core_funcs
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from util import TestContext, elapsed_ms, now_ns


async def create_user(
    session: AsyncSession,
    login: str,
    password: str,
    name: str,
    surname: str,
    email: str,
) -> int:
    user_id = await session.scalar(
        text(
            """
            SELECT core.create_user(
                :login,
                :password,
                :name,
                :surname,
                :email
            )
            """
        ),
        {
            "login": login,
            "password": password,
            "name": name,
            "surname": surname,
            "email": email,
        },
    )
    if user_id is None:
        raise RuntimeError("Failed to create user")
    return int(user_id)


async def create_item(
    session: AsyncSession,
    creator_id: int,
    sn: str,
    title: str,
) -> int:
    return await core_funcs.create_item(session, creator_id, sn, title)


async def change_sn(
    session: AsyncSession,
    item_id: int,
    new_sn: str,
    user_id: int,
) -> None:
    await core_funcs.change_item_sn(session, item_id, new_sn, user_id)


async def change_details(
    session: AsyncSession,
    item_id: int,
    new_title: str,
    user_id: int,
) -> None:
    await core_funcs.change_item_details(session, item_id, new_title, user_id)


async def _random_user_id(session: AsyncSession) -> int | None:
    return await session.scalar(
        text("SELECT id FROM core.users ORDER BY random() LIMIT 1")
    )


async def _random_item(session: AsyncSession) -> dict | None:
    result = await session.execute(
        text("SELECT id, sn, title FROM core.items ORDER BY random() LIMIT 1")
    )
    return result.mappings().first()


async def _search_offers_by_item(session: AsyncSession, sn: str, title: str) -> None:
    await session.execute(
        text(
            """
            SELECT o.id, o.status, o.price, o.item_id,
                   i.sn, i.title, i.creator_id
            FROM data.offers o
            JOIN core.items i ON i.id = o.item_id
            WHERE i.sn = :sn OR i.title = :title
            ORDER BY (o.stamp).created_at DESC
            LIMIT 20
            """
        ),
        {"sn": sn, "title": title},
    )


async def _search_bids_by_user(session: AsyncSession, user_id: int) -> None:
    await session.execute(
        text(
            """
            SELECT b.id, b.value, b.status, b.offer_id, b.created_at
            FROM data.bids b
            WHERE b.bidder_id = :user_id
            ORDER BY b.created_at DESC
            LIMIT 20
            """
        ),
        {"user_id": user_id},
    )


async def _search_offers_by_creator(session: AsyncSession, user_id: int) -> None:
    await session.execute(
        text(
            """
            SELECT o.id, o.status, o.price, o.item_id, (o.stamp).created_at AS created_at
            FROM data.offers o
            WHERE o.creator_id = :user_id
            ORDER BY (o.stamp).created_at DESC
            LIMIT 20
            """
        ),
        {"user_id": user_id},
    )


async def test(
    iterations: int, ctx: TestContext, metrics, session: AsyncSession
) -> None:
    rng = ctx.rng
    client_id = ctx.client_id

    for i in range(iterations):
        action = rng.randint(1, 100)

        if action <= 30:
            start = now_ns()
            ok = 1
            error = ""
            try:
                rnd = rng.randint(0, 100000000)
                login = f"u_{client_id}_{rnd}"
                email = f"u_{client_id}_{rnd}@example.com"
                async with session.begin():
                    await create_user(session, login, "pass", "Name", "Surname", email)
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "core.users.create",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            continue

        if action <= 60:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    creator_id = await _random_user_id(session)
                    if creator_id is None:
                        raise RuntimeError("no_users")
                    sn = f"SN-{creator_id}-{rng.randint(0, 100000000)}"
                    title = f"Item {rng.randint(0, 100000000)}"
                    await create_item(session, int(creator_id), sn, title)
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "core.items.create",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
            continue

        search_action = rng.randint(1, 3)
        if search_action == 1:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    item = await _random_item(session)
                    if item is None:
                        raise RuntimeError("no_items")
                    await _search_offers_by_item(session, item["sn"], item["title"])
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "core.search.offers_by_item",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
        elif search_action == 2:
            start = now_ns()
            ok = 1
            error = ""
            try:
                async with session.begin():
                    user_id = await _random_user_id(session)
                    if user_id is None:
                        raise RuntimeError("no_users")
                    await _search_bids_by_user(session, int(user_id))
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "core.search.bids_by_user",
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
                    user_id = await _random_user_id(session)
                    if user_id is None:
                        raise RuntimeError("no_users")
                    await _search_offers_by_creator(session, int(user_id))
            except Exception as exc:  # noqa: BLE001
                ok = 0
                error = str(exc)
            await metrics.log(
                "core.search.offers_by_creator",
                i,
                client_id=client_id,
                ok=ok,
                latency_ms=elapsed_ms(start),
                error=error,
            )
