const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on("error", (err) => {
  console.error("Unexpected pg pool error", err);
});

const timedQuery = async (text, params) => {
  const start = process.hrtime.bigint();
  const result = await pool.query(text, params);
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { result, durationMs };
};

module.exports = { pool, timedQuery };
