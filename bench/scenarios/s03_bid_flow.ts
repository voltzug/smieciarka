import { sleep } from "k6";
import { db } from "../logic/db.ts";
import { placeItemBid, cancelItemBid, commentItemOffer } from "../logic/bid.ts";
import { winItemBid } from "../logic/bid_win.ts";
import { benchmarkMetricsContext } from "../logic/metrics.ts";
import { sharedOffers, sharedBuyers } from "./context.ts";

const totalOffers = sharedOffers.length;
const totalBuyers = sharedBuyers.length;

function randStr(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function randPrice(): string {
  return (0.01 + Math.floor(Math.random() * 9)).toString();
}

export const options = {
  stages: [
    { duration: "5s", target: 5 },
    { duration: "30s", target: 20 },
    { duration: "40s", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "2m", target: 200 },
    { duration: "1m", target: 500 },
    { duration: "30s", target: 0 },
  ],
};

export default function bidFlow(): void {
  // 1. Instantaneous Memory-Layer Lookups (O(1) Local Speed)
  const randomOfferIdx = Math.floor(Math.random() * totalOffers);
  const offer = sharedOffers[randomOfferIdx];

  let buyerId: number = 0;
  let attempts = 0;

  // 2. Select a valid buyer from the verified data vector
  while (attempts < 10) {
    const randomBuyerIdx = Math.floor(Math.random() * totalBuyers);
    buyerId = sharedBuyers[randomBuyerIdx].id;

    if (buyerId !== offer.seller_id) break;
    attempts++;
  }

  // Fallback protection to prevent lock loops if vectors intersect tightly
  if (buyerId === offer.seller_id || !buyerId) return;

  let bidId: number;
  try {
    bidId = placeItemBid(
      db,
      buyerId,
      offer.offer_id,
      randPrice(),
    );
  } catch (exc) {
    sleep(Math.random() * 0.1 + 0.05); // jittered sleep
    throw exc;
  }

  try {
    commentItemOffer(
      db,
      buyerId,
      offer.offer_id,
      randStr("subj"),
      randStr("body"),
    );
  } catch (_) {
    /* ignore comment errors */
  }

  try {
    if (Math.random() < 0.5) {
      cancelItemBid(db, buyerId, bidId);
    } else {
      winItemBid(db, offer.seller_id, bidId);
    }
  } catch (exc) {
    benchmarkMetricsContext.raceErrorCounter.add(1, {
      reason: "probable race condition during offer-bid win",
    });
    sleep(Math.random() * 0.1 + 0.05); // jittered sleep
  }
}
