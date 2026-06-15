import { Db, withTx } from './db.ts';

// No SQL equivalent — implements WIN_OFFER audit event (seller accepts a bid)
export function winItemBid(db: Db, sellerId: number, bidId: number): void {
  withTx(db, () => {
    const rows = db.query(
      `SELECT b.status, b.offer_id,
              o.status AS offer_status, o.item_id, o.price::text AS price, o.description,
              i.creator_id, i.ledger_head
       FROM data.bids b
       JOIN data.offers o ON b.offer_id = o.id
       JOIN core.items i ON o.item_id = i.id
       WHERE b.id = $1 AND i.creator_id = $2
       FOR UPDATE OF o`,
      bidId, sellerId
    );
    if (!rows.length) throw new Error(`Bid ${bidId} not found or seller ${sellerId} is not item owner`);
    const r = rows[0];

    if (r.offer_status !== 'ACTIVE' && r.offer_status !== 'RESERVED') {
      throw new Error(`Offer is not in a winnable state (status=${r.offer_status})`);
    }
    if (r.status !== 'PENDING') {
      throw new Error(`Bid ${bidId} is not pending (status=${r.status})`);
    }

    const { ts } = db.query(
      `UPDATE data.offers SET status = 'CLOSED', stamp = ((stamp).created_at, now())
       WHERE id = $1 RETURNING (stamp).updated_at AS ts`,
      r.offer_id
    )[0];

    db.exec(`UPDATE data.bids SET status = 'FINISHED' WHERE id = $1`, bidId);
    db.exec(
      `UPDATE data.bids SET status = 'CANCELLED'
       WHERE offer_id = $1 AND status = 'PENDING' AND id <> $2`,
      r.offer_id, bidId
    );

    const { hash } = db.query(
      `SELECT encode(data._offer_hash($1, $2, $3, $4::money, $5, $6::timestamptz), 'hex') AS hash`,
      r.offer_id, r.item_id, sellerId, r.price, r.description, ts
    )[0];

    db.query(
      `SELECT audit.append_item_event($1, $2, $3, 'WIN_OFFER'::audit.e_item_event_type, decode($4, 'hex'))`,
      r.ledger_head, r.item_id, sellerId, hash
    );
  });
}
