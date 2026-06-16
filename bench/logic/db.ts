import sql from 'k6/x/sql';
import driver from 'k6/x/sql/driver/postgres';

declare const __ENV: { [key: string]: string };

export interface Db {
  query(query: string, ...args: any[]): any[];
  exec(query: string, ...args: any[]): any;
  close(): void;
}

export const db: Db = sql.open(driver, __ENV.PGCONN, {
  max_open_conns: 60,
  max_idle_conns: 9,
});

export function withTx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
