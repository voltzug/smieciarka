import { Db, withTx } from './db.ts';

export function createItem(db: Db, creatorId: number, sn: string, title: string): number {
  return withTx(db, () => {
    const row = db.query(
      `INSERT INTO core.items(hash_genesis, sn, status, title, creator_id)
       VALUES(audit.gen_random_bytes(32), $1, 'CREATED', $2, $3)
       RETURNING id, (stamp).created_at AS ts, encode(hash_genesis, 'hex') AS genesis_hex`,
      sn, title, creatorId
    )[0];

    const { hash } = db.query(
      `SELECT encode(core._item_hash($1, $2, $3, $4, $5::timestamptz), 'hex') AS hash`,
      row.id, creatorId, sn, title, row.ts
    )[0];

    db.query(
      `SELECT audit._init_item_chain($1, $2, decode($3, 'hex'), decode($4, 'hex'))`,
      row.id, creatorId, row.genesis_hex, hash
    );

    return row.id as number;
  });
}

export function changeItemSn(db: Db, itemId: number, newSn: string, userId: number): void {
  withTx(db, () => {
    const items = db.query(
      `SELECT title, ledger_head FROM core.items WHERE id = $1 AND creator_id = $2 FOR UPDATE`,
      itemId, userId
    );
    if (!items.length) throw new Error(`Item ${itemId} not found or not owned by user ${userId}`);
    const { title, ledger_head } = items[0];

    const { ts } = db.query(
      `UPDATE core.items SET sn = $1, stamp = ((stamp).created_at, now())
       WHERE id = $2 RETURNING (stamp).updated_at AS ts`,
      newSn, itemId
    )[0];

    const { hash } = db.query(
      `SELECT encode(core._item_hash($1, $2, $3, $4, $5::timestamptz), 'hex') AS hash`,
      itemId, userId, newSn, title, ts
    )[0];

    db.query(
      `SELECT audit.append_item_event($1, $2, $3, 'MOD_ITEM_SN'::audit.e_item_event_type, decode($4, 'hex'))`,
      ledger_head, itemId, userId, hash
    );
  });
}

export function changeItemDetails(db: Db, itemId: number, newTitle: string, userId: number): void {
  withTx(db, () => {
    const items = db.query(
      `SELECT sn, ledger_head FROM core.items WHERE id = $1 AND creator_id = $2 FOR UPDATE`,
      itemId, userId
    );
    if (!items.length) throw new Error(`Item ${itemId} not found or not owned by user ${userId}`);
    const { sn, ledger_head } = items[0];

    const { ts } = db.query(
      `UPDATE core.items SET title = $1, stamp = ((stamp).created_at, now())
       WHERE id = $2 RETURNING (stamp).updated_at AS ts`,
      newTitle, itemId
    )[0];

    const { hash } = db.query(
      `SELECT encode(core._item_hash($1, $2, $3, $4, $5::timestamptz), 'hex') AS hash`,
      itemId, userId, sn, newTitle, ts
    )[0];

    db.query(
      `SELECT audit.append_item_event($1, $2, $3, 'MOD_ITEM_DETAILS'::audit.e_item_event_type, decode($4, 'hex'))`,
      ledger_head, itemId, userId, hash
    );
  });
}
