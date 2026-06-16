import { db } from '../logic/db.ts';
import { placeItemBid, cancelItemBid, commentItemOffer } from '../logic/bid.ts';
import { cancelItemOffer } from '../logic/offer.ts';
import { winItemBid } from '../logic/bid_win.ts';

const BUYER_COUNT = 100_000;
const SELLER_COUNT = 100_000;

function randStr(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function randPrice(): string {
  return (100 + Math.floor(Math.random() * 9000)).toString();
}

function randomActiveOffer(): { offerId: number; sellerId: number } | null {
  const rows = db.query(
    `SELECT o.id AS offer_id, i.creator_id AS seller_id
     FROM data.offers o JOIN core.items i ON o.item_id = i.id
     WHERE o.status = 'ACTIVE'
     OFFSET floor(random() * (SELECT COUNT(*) FROM data.offers WHERE status = 'ACTIVE'))
     LIMIT 1`
  );
  if (!rows.length) return null;
  return { offerId: rows[0].offer_id as number, sellerId: rows[0].seller_id as number };
}

export const options = {
  stages: [
    { duration: '5s', target: 5 },
    { duration: '30s', target: 20 },
    { duration: '40s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
};

export default function bidFlow(): void {
  const offer = randomActiveOffer();
  if (!offer) return;

  // pick a buyer that is not the seller
  let buyerId: number;
  do {
    buyerId = Math.floor(Math.random() * BUYER_COUNT) + SELLER_COUNT + 1;
  } while (buyerId === offer.sellerId);

  let bidId: number;
  try {
    bidId = placeItemBid(db, buyerId, offer.offerId, randPrice());
  } catch (_) {
    return; // offer may have changed state concurrently
  }

  try {
    commentItemOffer(db, buyerId, offer.offerId, randStr('subj'), randStr('body'));
  } catch (_) { /* ignore comment errors */ }

  if (Math.random() < 0.5) {
    try { cancelItemBid(db, buyerId, bidId); } catch (_) { /* ignore */ }
  } else {
    try {
      winItemBid(db, offer.sellerId, bidId);
    } catch (_) {
      // offer may already be closed; try cancel instead
      try { cancelItemOffer(db, offer.sellerId, offer.offerId); } catch (_) { /* ignore */ }
    }
  }
}
