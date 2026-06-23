import { Db, withTx } from "./db.ts";
import { benchmarkMetricsContext } from "./metrics.ts";
import { BusinessLogicError, handleBenchmarkError } from "./error.ts";

export function placeItemBid(
  db: Db,
  bidderId: number,
  offerId: number,
  value: string,
): number {
  return withTx(db, () => {
    try {
      const rows = db.query(
        `SELECT o.status, i.creator_id FROM data.offers o
         JOIN core.items i ON o.item_id = i.id
         WHERE o.id = $1`,
        offerId,
      );

      // Precise runtime assertions that bypass the database driver
      if (!rows.length) {
        throw new BusinessLogicError("offer_not_found");
      }
      if (rows[0].creator_id === bidderId) {
        throw new BusinessLogicError("bidder_is_item_creator");
      }

      const [inserted] = db.query(
        `INSERT INTO data.bids(offer_id, bidder_id, value, status)
         VALUES($1, $2, $3::money, 'PENDING') RETURNING id`,
        offerId,
        bidderId,
        value,
      );

      benchmarkMetricsContext.serverFailureRate.add(false);
      return inserted.id as number;
    } catch (exc: unknown) {
      handleBenchmarkError(exc, benchmarkMetricsContext);
    }
  });
}
export function cancelItemBid(db: Db, bidderId: number, bidId: number): void {
  withTx(db, () => {
    try {
      const rows = db.query(
        `SELECT b.status, b.bidder_id, o.status AS offer_status
         FROM data.bids b JOIN data.offers o ON b.offer_id = o.id WHERE b.id = $1
         FOR UPDATE NOWAIT`,
        bidId,
      );
      if (!rows.length) {
        throw new BusinessLogicError(`Bid ${bidId} does not exist`);
      }
      const bid = rows[0];

      if (bid.bidder_id !== bidderId) {
        throw new BusinessLogicError(
          `User ${bidderId} does not own bid ${bidId}`,
        );
      }
      if (bid.status === "CANCELLED") return true;
      if (bid.status !== "PENDING") {
        throw new BusinessLogicError(
          `Bid ${bidId} cannot be cancelled (status=${bid.status})`,
        );
      }
      if (bid.offer_status !== "ACTIVE" && bid.offer_status !== "RESERVED") {
        throw new BusinessLogicError(
          `Offer is not in a state to cancel bids (offer_status=${bid.offer_status})`,
        );
      }

      db.exec(`UPDATE data.bids SET status = 'CANCELLED' WHERE id = $1`, bidId);
      benchmarkMetricsContext.serverFailureRate.add(false);
      return true;
    } catch (exc: unknown) {
      handleBenchmarkError(exc, benchmarkMetricsContext);
    }
  });
}

export function commentItemOffer(
  db: Db,
  commenterId: number,
  offerId: number,
  subject: string,
  contents: string,
): number {
  return withTx(db, () => {
    try {
      const offers = db.query(
        `SELECT status FROM data.offers WHERE id = $1`,
        offerId,
      );
      if (!offers.length) {
        throw new BusinessLogicError(`Offer ${offerId} does not exist`);
      }
      if (offers[0].status === "CLOSED") {
        throw new BusinessLogicError(
          `Cannot comment on closed offer ${offerId}`,
        );
      }

      const bids = db.query(
        `SELECT id FROM data.bids WHERE status = 'PENDING' AND offer_id = $1 AND bidder_id = $2 LIMIT 1`,
        offerId,
        commenterId,
      );
      const bidId = bids.length ? bids[0].id : null;

      const inserted =
        bidId !== null
          ? db.query(
              `INSERT INTO data.conversations(subject, contents, commenter_id, offer_id, bid_id)
             VALUES($1, $2, $3, $4, $5) RETURNING id`,
              subject,
              contents,
              commenterId,
              offerId,
              bidId,
            )
          : db.query(
              `INSERT INTO data.conversations(subject, contents, commenter_id, offer_id)
             VALUES($1, $2, $3, $4) RETURNING id`,
              subject,
              contents,
              commenterId,
              offerId,
            );

      benchmarkMetricsContext.serverFailureRate.add(false);
      return inserted[0].id as number;
    } catch (exc: unknown) {
      handleBenchmarkError(exc, benchmarkMetricsContext);
    }
  });
}
