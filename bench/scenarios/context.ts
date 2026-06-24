import { SharedArray } from "k6/data";
import { db } from "../logic/db.ts";

interface OfferPointer {
  offer_id: number;
  seller_id: number;
}

interface SellerPointer {
  id: number;
}
interface BuyerPointer {
  id: number;
}

export const sharedOffers = new SharedArray<OfferPointer>(
  "active_offers_pool",
  function () {
    const rows = db.query(`
    SELECT o.id AS offer_id, i.creator_id AS seller_id
    FROM data.offers o
    JOIN core.items i ON o.item_id = i.id
    WHERE o.status = 'ACTIVE'
  `);

    if (!rows.length)
      throw new Error("Pre-flight data check failed: Offers pool is empty.");
    return rows as OfferPointer[];
  },
);

export const sharedSellers = new SharedArray<SellerPointer>(
  "active_sellers_pool",
  function () {
    const rows = db.query(`
    SELECT id FROM core.users WHERE login LIKE 'seller-%'
  `);

    if (!rows.length) {
      throw new Error(
        "Pre-flight data check failed: Sellers pool is completely empty.",
      );
    }
    return rows as SellerPointer[];
  },
);

export const sharedBuyers = new SharedArray<BuyerPointer>(
  "active_buyers_pool",
  function () {
    const rows = db.query(`
    SELECT id FROM core.users WHERE login LIKE 'buyer-%'
  `);

    if (!rows.length)
      throw new Error("Pre-flight data check failed: Buyers pool is empty.");
    return rows as BuyerPointer[];
  },
);
