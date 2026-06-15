import { db } from '../logic/db.ts';

const OFFER_COUNT = 400_000;

const PREFIXES = ['a', 'b', 'c', 's', 'bu', 'it'];

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

export default function selectFlow(): void {
  const kind   = Math.floor(Math.random() * 5);
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];

  switch (kind) {
    case 0:
      db.query(`SELECT id, login FROM core.users WHERE login ILIKE $1 LIMIT 20`, `${prefix}%`);
      break;
    case 1:
      db.query(`SELECT id, sn, title FROM core.items WHERE title ILIKE $1 LIMIT 20`, `${prefix}%`);
      break;
    case 2:
      db.query(
        `SELECT o.id, o.price, o.status, COUNT(b.id) AS bid_count
         FROM data.offers o LEFT JOIN data.bids b ON b.offer_id = o.id
         WHERE o.status = 'ACTIVE'
         GROUP BY o.id LIMIT 50`
      );
      break;
    case 3: {
      const offerId = Math.floor(Math.random() * OFFER_COUNT) + 1;
      db.query(`SELECT id, value, status FROM data.bids WHERE offer_id = $1`, offerId);
      break;
    }
    case 4: {
      const offerId = Math.floor(Math.random() * OFFER_COUNT) + 1;
      db.query(
        `SELECT id, subject, contents FROM data.conversations
         WHERE offer_id = $1 ORDER BY created_at DESC LIMIT 20`,
        offerId
      );
      break;
    }
  }
}
