from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def create_item(
    session: AsyncSession, creator_id: int, sn: str, title: str
) -> int:
    hash_genesis = await session.scalar(text("SELECT audit.gen_random_bytes(32)"))
    if hash_genesis is None:
        raise RuntimeError("Failed to generate hash_genesis")

    result = await session.execute(
        text(
            """
            INSERT INTO core.items (hash_genesis, sn, status, title, creator_id)
            VALUES (:hash_genesis, :sn, 'CREATED', :title, :creator_id)
            RETURNING id, (stamp).created_at AS created_at
            """
        ),
        {
            "hash_genesis": hash_genesis,
            "sn": sn,
            "title": title,
            "creator_id": creator_id,
        },
    )
    row = result.mappings().first()
    if row is None:
        raise RuntimeError("Failed to insert item")

    item_id = row["id"]
    created_at = row["created_at"]

    item_hash = await session.scalar(
        text("SELECT core._item_hash(:item_id, :creator_id, :sn, :title, :stamp)"),
        {
            "item_id": item_id,
            "creator_id": creator_id,
            "sn": sn,
            "title": title,
            "stamp": created_at,
        },
    )
    if item_hash is None:
        raise RuntimeError("Failed to compute item hash")

    await session.execute(
        text(
            "SELECT audit._init_item_chain(:item_id, :creator_id, :hash_genesis, :event_hash)"
        ),
        {
            "item_id": item_id,
            "creator_id": creator_id,
            "hash_genesis": hash_genesis,
            "event_hash": item_hash,
        },
    )

    return int(item_id)


async def change_item_sn(
    session: AsyncSession,
    item_id: int,
    new_sn: str,
    user_id: int,
) -> None:
    result = await session.execute(
        text(
            """
            SELECT id, creator_id, sn, title, ledger_head
            FROM core.items
            WHERE id = :item_id AND creator_id = :user_id
            """
        ),
        {"item_id": item_id, "user_id": user_id},
    )
    row = result.mappings().first()
    if row is None:
        raise ValueError(f"Item with id {item_id} does not exist")

    v_stamp = await session.scalar(text("SELECT now()"))

    await session.execute(
        text(
            """
            UPDATE core.items
            SET sn = :new_sn,
                stamp = ((stamp).created_at, :v_stamp)
            WHERE id = :item_id
            """
        ),
        {"new_sn": new_sn, "v_stamp": v_stamp, "item_id": item_id},
    )

    item_hash = await session.scalar(
        text("SELECT core._item_hash(:item_id, :creator_id, :new_sn, :title, :stamp)"),
        {
            "item_id": row["id"],
            "creator_id": row["creator_id"],
            "new_sn": new_sn,
            "title": row["title"],
            "stamp": v_stamp,
        },
    )
    if item_hash is None:
        raise RuntimeError("Failed to compute item hash")

    await session.execute(
        text(
            """
            SELECT audit.append_item_event(
                :ledger_head,
                :item_id,
                :user_id,
                'MOD_ITEM_SN',
                :event_hash
            )
            """
        ),
        {
            "ledger_head": row["ledger_head"],
            "item_id": row["id"],
            "user_id": user_id,
            "event_hash": item_hash,
        },
    )


async def change_item_details(
    session: AsyncSession,
    item_id: int,
    new_title: str,
    user_id: int,
) -> None:
    result = await session.execute(
        text(
            """
            SELECT id, creator_id, sn, title, ledger_head
            FROM core.items
            WHERE id = :item_id AND creator_id = :user_id
            """
        ),
        {"item_id": item_id, "user_id": user_id},
    )
    row = result.mappings().first()
    if row is None:
        raise ValueError(f"Item with id {item_id} does not exist")

    v_stamp = await session.scalar(text("SELECT now()"))

    await session.execute(
        text(
            """
            UPDATE core.items
            SET title = :new_title,
                stamp = ((stamp).created_at, :v_stamp)
            WHERE id = :item_id
            """
        ),
        {"new_title": new_title, "v_stamp": v_stamp, "item_id": item_id},
    )

    item_hash = await session.scalar(
        text("SELECT core._item_hash(:item_id, :creator_id, :sn, :new_title, :stamp)"),
        {
            "item_id": row["id"],
            "creator_id": row["creator_id"],
            "sn": row["sn"],
            "new_title": new_title,
            "stamp": v_stamp,
        },
    )
    if item_hash is None:
        raise RuntimeError("Failed to compute item hash")

    await session.execute(
        text(
            """
            SELECT audit.append_item_event(
                :ledger_head,
                :item_id,
                :user_id,
                'MOD_ITEM_DETAILS',
                :event_hash
            )
            """
        ),
        {
            "ledger_head": row["ledger_head"],
            "item_id": row["id"],
            "user_id": user_id,
            "event_hash": item_hash,
        },
    )
