import { Db, withTx } from './db.ts';

export function createUser(
  db: Db,
  login: string,
  password: string,
  name: string,
  surname: string,
  email: string
): number {
  return withTx(db, () => {
    // 1. Check if email already exists before doing anything to prevent unexpected aborts
    const existing = db.query(`SELECT user_id FROM data.user_details WHERE email = $1`, email);
    if (existing.length > 0) {
      return existing[0].user_id as number; // Safe fallback: return existing user ID
    }

    const { hash } = db.query(
      `SELECT encode(core._user_data_hash($1, $2), 'hex') AS hash`,
      login, email
    )[0];

    const { id } = db.query(
      `INSERT INTO core.users(login, password, status, data_hash)
       VALUES($1, $2, 'ACTIVE', decode($3, 'hex')) 
       ON CONFLICT (login) DO UPDATE SET status = 'ACTIVE' -- Prevents login conflict crashes
       RETURNING id`,
      login, password, hash
    )[0];

    // 2. Handle conflicts on BOTH user_id and email cleanly
    db.exec(
      `INSERT INTO data.user_details(user_id, name, surname, email)
       VALUES($1, $2, $3, $4) 
       ON CONFLICT(user_id) DO NOTHING`,
      id, name, surname, email
    );

    return id as number;
  });
}

export function changeUserPassword(db: Db, userId: number, newPassword: string): void {
  withTx(db, () => {
    db.exec(
      `UPDATE core.users SET password = $1 WHERE id = $2`,
      newPassword, userId
    );
  });
}

export function changeUserEmail(db: Db, userId: number, newEmail: string): void {
  withTx(db, () => {
    const row = db.query(`SELECT login FROM core.users WHERE id = $1`, userId);
    if (!row.length) throw new Error(`User ${userId} does not exist`);

    const { hash } = db.query(
      `SELECT encode(core._user_data_hash($1, $2), 'hex') AS hash`,
      row[0].login, newEmail
    )[0];

    db.exec(
      `UPDATE core.users SET data_hash = decode($1, 'hex') WHERE id = $2`,
      hash, userId
    );
    db.exec(
      `UPDATE data.user_details SET email = $1 WHERE user_id = $2`,
      newEmail, userId
    );
  });
}

export function changeUserDetails(db: Db, userId: number, name: string, surname: string): void {
  withTx(db, () => {
    db.exec(
      `UPDATE data.user_details SET name = $1, surname = $2 WHERE user_id = $3`,
      name, surname, userId
    );
  });
}

export function deactivateUser(db: Db, userId: number): void {
  withTx(db, () => {
    db.exec(
      `UPDATE core.users
       SET status = 'DELETED', password = encode(sha384(audit.gen_random_bytes(32)), 'hex')
       WHERE id = $1`,
      userId
    );
    db.exec(`DELETE FROM data.user_details WHERE user_id = $1`, userId);
  });
}
