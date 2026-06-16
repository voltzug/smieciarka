import { db } from '../logic/db.ts';
import { changeUserDetails } from '../logic/user.ts';

const USER_COUNT = 100_000;
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank'];
const SURNAMES = ['Smith', 'Jones', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson'];

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

export default function userFlow(): void {
  const userId = Math.floor(Math.random() * USER_COUNT) + 1;

  // simulate login lookup
  db.query(`SELECT id, login FROM core.users WHERE id = $1`, userId);

  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  changeUserDetails(db, userId, name, surname);
}
