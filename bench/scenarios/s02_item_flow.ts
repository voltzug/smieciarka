import { db } from '../logic/db.ts';
import { createItem, changeItemDetails } from '../logic/item.ts';
import { registerItemOffer } from '../logic/offer.ts';

const SELLER_COUNT = 100_000;

function randStr(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function randPrice(): string {
  return (100 + Math.floor(Math.random() * 9000)).toString();
}

export const options = {
  stages: [
    { duration: '30s', target: 5   },
    { duration: '1m',  target: 20  },
    { duration: '2m',  target: 50  },
    { duration: '2m',  target: 100 },
    { duration: '3m',  target: 200 },
    { duration: '2m',  target: 500 },
    { duration: '2m',  target: 0   },
  ],
};

export default function itemFlow(): void {
  const sellerId = Math.floor(Math.random() * SELLER_COUNT) + 1;
  const sn       = randStr('SN');
  const title    = randStr('Item');

  const itemId = createItem(db, sellerId, sn, title);
  changeItemDetails(db, itemId, randStr('Title'), sellerId);
  registerItemOffer(db, sellerId, itemId, randPrice(), randStr('desc'));
}
