import { Db, withTx } from './db.ts';

export function placeItemBid(db: Db, bidderId: number, offerId: number, value: string): number {
  return withTx(db, () => {
    const rows = db.query(
      `SELECT o.status FROM data.offers o
       JOIN core.items i ON o.item_id = i.id
       WHERE o.id = $1 AND i.creator_id <> $2`,
      offerId, bidderId
    );
    if (!rows.length) throw new Error(`Offer ${offerId} not found or bidder is item creator`);
    if (rows[0].status !== 'ACTIVE') throw new Error(`Offer ${offerId} is not active`);

    const { id } = db.query(
      `INSERT INTO data.bids(offer_id, bidder_id, value, status)
       VALUES($1, $2, $3::money, 'PENDING') RETURNING id`,
      offerId, bidderId, value
    )[0];

    return id as number;
  });
}

export function cancelItemBid(db: Db, bidderId: number, bidId: number): void {
  withTx(db, () => {
    const rows = db.query(
      `SELECT b.status, b.bidder_id, o.status AS offer_status
       FROM data.bids b JOIN data.offers o ON b.offer_id = o.id WHERE b.id = $1`,
      bidId
    );
    if (!rows.length) throw new Error(`Bid ${bidId} does not exist`);
    const bid = rows[0];

    if (bid.bidder_id !== bidderId) throw new Error(`User ${bidderId} does not own bid ${bidId}`);
    if (bid.status !== 'PENDING') throw new Error(`Bid ${bidId} cannot be cancelled (status=${bid.status})`);
    if (bid.offer_status !== 'ACTIVE' && bid.offer_status !== 'RESERVED') {
      throw new Error(`Offer is not in a state to cancel bids (offer_status=${bid.offer_status})`);
    }

    db.exec(`UPDATE data.bids SET status = 'CANCELLED' WHERE id = $1`, bidId);
  });
}

export function commentItemOffer(
  db: Db,
  commenterId: number,
  offerId: number,
  subject: string,
  contents: string
): number {
  return withTx(db, () => {
    const offers = db.query(`SELECT status FROM data.offers WHERE id = $1`, offerId);
    if (!offers.length) throw new Error(`Offer ${offerId} does not exist`);
    if (offers[0].status === 'CLOSED') throw new Error(`Cannot comment on closed offer ${offerId}`);

    const bids = db.query(
      `SELECT id FROM data.bids WHERE status = 'PENDING' AND offer_id = $1 AND bidder_id = $2 LIMIT 1`,
      offerId, commenterId
    );
    const bidId = bids.length ? bids[0].id : null;

    const inserted = bidId !== null
      ? db.query(
          `INSERT INTO data.conversations(subject, contents, commenter_id, offer_id, bid_id)
           VALUES($1, $2, $3, $4, $5) RETURNING id`,
          subject, contents, commenterId, offerId, bidId
        )
      : db.query(
          `INSERT INTO data.conversations(subject, contents, commenter_id, offer_id)
           VALUES($1, $2, $3, $4) RETURNING id`,
          subject, contents, commenterId, offerId
        );

    return inserted[0].id as number;
  });
}
