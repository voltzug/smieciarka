import { db } from "../logic/db.ts";
import { createItem, changeItemDetails } from "../logic/item.ts";
import { registerItemOffer } from "../logic/offer.ts";
import { sharedSellers } from "./context.ts";

const totalSellers = sharedSellers.length;

function randStr(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function randPrice(): string {
  return (100 + Math.floor(Math.random() * 9000)).toString();
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

export default function itemFlow(): void {
  // 1. O(1) Local lookup out of the frozen shared memory space
  const randomSellerIdx = Math.floor(Math.random() * totalSellers);
  const sellerId = sharedSellers[randomSellerIdx].id;

  // 2. Compute runtime item metadata variations deterministically
  const sn = randStr("SN");
  const title = randStr("Item");

  let itemId: number;

  // 3. TARGET TRANSACTION WRITING LAYER
  try {
    // Write and lock a clean new item entry
    itemId = createItem(db, sellerId, sn, title);
  } catch (exc) {
    throw exc;
  }

  try {
    changeItemDetails(db, itemId, randStr("Title"), sellerId);
    registerItemOffer(db, sellerId, itemId, randPrice(), randStr("desc"));
  } catch (exc) {
    return;
  }
}
