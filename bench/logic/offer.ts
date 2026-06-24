import { Db, withTx } from "./db.ts";
import { BusinessLogicError, handleBenchmarkError } from "./error.ts";
import { benchmarkMetricsContext } from "./metrics.ts";

export function registerItemOffer(
  db: Db,
  creatorId: number,
  itemId: number,
  price: string,
  description: string,
): number {
  return withTx(db, () => {
    try {
      const items = db.query(
        `SELECT creator_id, ledger_head FROM core.items WHERE id = $1 FOR UPDATE NOWAIT`,
        itemId,
      );
      if (!items.length)
        throw new BusinessLogicError(`Item ${itemId} does not exist`);
      if (items[0].creator_id !== creatorId) {
        throw new BusinessLogicError(
          `User ${creatorId} does not own item ${itemId}`,
        );
      }
      const { ledger_head } = items[0];

      const existing = db.query(
        `SELECT id, status FROM data.offers WHERE item_id = $1`,
        itemId,
      );

      let offerId: number;
      let ts: string;

      if (existing.length > 0) {
        if (existing[0].status !== "CLOSED") {
          throw new BusinessLogicError(
            `Active or reserved offer already exists for item ${itemId}`,
          );
        }
        const updated = db.query(
          `UPDATE data.offers
         SET status = 'ACTIVE', price = $1::money, description = $2, stamp = (now(), now())
         WHERE id = $3 RETURNING id, (stamp).created_at AS ts`,
          price,
          description,
          existing[0].id,
        )[0];
        offerId = updated.id as number;
        ts = updated.ts as string;
      } else {
        const inserted = db.query(
          `INSERT INTO data.offers(status, price, description, item_id, creator_id)
         VALUES('ACTIVE', $1::money, $2, $3, $4)
         RETURNING id, (stamp).created_at AS ts`,
          price,
          description,
          itemId,
          creatorId,
        )[0];
        offerId = inserted.id as number;
        ts = inserted.ts as string;
      }

      const { hash } = db.query(
        `SELECT encode(data._offer_hash($1, $2, $3, $4::money, $5, $6::timestamptz), 'hex') AS hash`,
        offerId,
        itemId,
        creatorId,
        price,
        description,
        ts,
      )[0];

      db.query(
        `SELECT audit.append_item_event($1, $2, $3, 'REGISTER_OFFER'::audit.e_item_event_type, decode($4, 'hex'))`,
        ledger_head,
        itemId,
        creatorId,
        hash,
      );

      benchmarkMetricsContext.serverFailureRate.add(false);
      return offerId;
    } catch (exc: unknown) {
      handleBenchmarkError(exc, benchmarkMetricsContext);
    }
  });
}

export function cancelItemOffer(db: Db, userId: number, offerId: number): void {
  withTx(db, () => {
    try {
      const rows = db.query(
        `SELECT o.status, o.item_id, o.price::text AS price, o.description, i.creator_id, i.ledger_head
       FROM data.offers o JOIN core.items i ON o.item_id = i.id WHERE o.id = $1`,
        offerId,
      );
      if (!rows.length)
        throw new BusinessLogicError(`Offer ${offerId} does not exist`);
      const offer = rows[0];

      if (offer.creator_id !== userId)
        throw new BusinessLogicError(
          `User ${userId} does not own offer ${offerId}`,
        );
      if (offer.status !== "ACTIVE" && offer.status !== "RESERVED") {
        throw new BusinessLogicError(
          `Offer ${offerId} cannot be cancelled (status=${offer.status})`,
        );
      }

      const { ts } = db.query(
        `UPDATE data.offers SET status = 'CLOSED', stamp = ((stamp).created_at, now())
       WHERE id = $1 RETURNING (stamp).updated_at AS ts`,
        offerId,
      )[0];

      db.exec(
        `UPDATE data.bids SET status = 'CANCELLED' WHERE offer_id = $1 AND status = 'PENDING'`,
        offerId,
      );

      const { hash } = db.query(
        `SELECT encode(data._offer_hash($1, $2, $3, $4::money, $5, $6::timestamptz), 'hex') AS hash`,
        offerId,
        offer.item_id,
        userId,
        offer.price,
        offer.description,
        ts,
      )[0];

      db.query(
        `SELECT audit.append_item_event($1, $2, $3, 'CANCEL_OFFER'::audit.e_item_event_type, decode($4, 'hex'))`,
        offer.ledger_head,
        offer.item_id,
        userId,
        hash,
      );
      benchmarkMetricsContext.serverFailureRate.add(false);
    } catch (exc: unknown) {
      handleBenchmarkError(exc, benchmarkMetricsContext);
    }
  });
}
