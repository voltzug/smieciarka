from __future__ import annotations

from db.funcs import core as core_funcs
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from util import TestContext, elapsed_ms, now_ns


async def _pick_item_with_ledger(session: AsyncSession, item_id: int) -> dict | None:
    result = await session.execute(
        text(
            """
            SELECT i.id, i.creator_id, i.ledger_head
            FROM core.items i
            WHERE i.id >= :item_id
              AND i.ledger_head IS NOT NULL
            ORDER BY i.id
            LIMIT 1
            """
        ),
        {"item_id": item_id},
    )
    row = result.mappings().first()
    if row is not None:
        return row

    result = await session.execute(
        text(
            """
            SELECT i.id, i.creator_id, i.ledger_head
            FROM core.items i
            WHERE i.id < :item_id
              AND i.ledger_head IS NOT NULL
            ORDER BY i.id DESC
            LIMIT 1
            """
        ),
        {"item_id": item_id},
    )
    return result.mappings().first()


async def test(
    iterations: int, ctx: TestContext, metrics, session: AsyncSession
) -> None:
    rng = ctx.rng
    client_id = ctx.client_id
    items_max = max(1, 100000 * ctx.scale)

    for i in range(iterations):
        start = now_ns()
        ok = 1
        error = ""
        try:
            item_id = rng.randint(1, items_max)

            async with session.begin():
                item = await _pick_item_with_ledger(session, item_id)
                if item is None:
                    raise RuntimeError("no_item_with_ledger")

                chain_ok = await session.scalar(
                    text(
                        "SELECT CASE WHEN audit.mi_verify_item_chain(:item_id) THEN 1 ELSE 0 END"
                    ),
                    {"item_id": item["id"]},
                )
                if chain_ok != 1:
                    raise RuntimeError("chain_verify_failed")

                new_title = f"Bench {client_id}-{rng.randint(1, 1000000000)}"
                await core_funcs.change_item_details(
                    session, int(item["id"]), new_title, int(item["creator_id"])
                )

                chain_ok2 = await session.scalar(
                    text(
                        "SELECT CASE WHEN audit.mi_verify_item_chain(:item_id) THEN 1 ELSE 0 END"
                    ),
                    {"item_id": item["id"]},
                )
                if chain_ok2 != 1:
                    raise RuntimeError("chain_verify_failed_after")
        except Exception as exc:  # noqa: BLE001
            ok = 0
            error = str(exc)

        await metrics.log(
            "audit.chain.verify_append",
            i,
            client_id=client_id,
            ok=ok,
            latency_ms=elapsed_ms(start),
            error=error,
        )
