const express = require("express");
const { pool, timedQuery } = require("./db");

const router = express.Router();

const parseId = (value, fieldName) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return id;
};

const sendError = (res, error, status = 400) => {
  res.status(status).json({
    ok: false,
    error: error.message || String(error),
  });
};

router.post("/users", async (req, res) => {
  const { login, password, name, surname, email } = req.body || {};
  if (!login || !password || !name || !surname || !email) {
    return sendError(res, new Error("Missing required fields"));
  }

  try {
    const { result, durationMs } = await timedQuery(
      "SELECT core.create_user($1, $2, $3, $4, $5) AS user_id",
      [login, password, name, surname, email]
    );

    res.json({
      ok: true,
      durationMs,
      user_id: result.rows[0]?.user_id,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post("/users/:id/details", async (req, res) => {
  const { name, surname, email } = req.body || {};
  if (!name || !surname) {
    return sendError(res, new Error("name and surname are required"));
  }

  let userId;
  try {
    userId = parseId(req.params.id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const client = await pool.connect();
  const start = process.hrtime.bigint();

  try {
    await client.query("BEGIN");
    await client.query("SELECT data.change_user_details($1, $2, $3)", [
      userId,
      name,
      surname,
    ]);

    if (email) {
      await client.query("SELECT core.change_user_email($1, $2)", [
        userId,
        email,
      ]);
    }

    await client.query("COMMIT");
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    res.json({
      ok: true,
      durationMs,
      user_id: userId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, error, 500);
  } finally {
    client.release();
  }
});

router.get("/offers", async (req, res) => {
  const { title, sn, creator_id } = req.query || {};
  const conditions = [];
  const values = [];

  if (title) {
    values.push(`%${title}%`);
    conditions.push(`i.title ILIKE $${values.length}`);
  }

  if (sn) {
    values.push(`%${sn}%`);
    conditions.push(`i.sn ILIKE $${values.length}`);
  }

  if (creator_id) {
    try {
      const creatorId = parseId(creator_id, "creator_id");
      values.push(creatorId);
      conditions.push(`o.creator_id = $${values.length}`);
    } catch (error) {
      return sendError(res, error);
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT
      o.id AS offer_id,
      o.status,
      o.price::text AS price,
      o.description,
      o.item_id,
      i.title AS item_title,
      i.sn AS item_sn,
      o.creator_id,
      u.login AS creator_login,
      (o.stamp).created_at AS created_at,
      (o.stamp).updated_at AS updated_at
    FROM data.offers o
    JOIN core.items i ON i.id = o.item_id
    JOIN core.users u ON u.id = o.creator_id
    ${whereClause}
    ORDER BY o.id DESC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, values);
    res.json({
      ok: true,
      durationMs,
      count: result.rowCount,
      rows: result.rows,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/items/:id/history", async (req, res) => {
  let itemId;
  try {
    itemId = parseId(req.params.id, "item_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    WITH RECURSIVE chain AS (
      SELECT
        il.id,
        il.prev_id,
        il.created_at,
        il.event_type,
        il.creator_id,
        il.item_id,
        encode(il.hash, 'hex') AS chain_hash,
        encode(il.event_hash, 'hex') AS event_hash
      FROM audit.item_ledger il
      WHERE il.item_id = $1 AND il.prev_id IS NULL
      UNION ALL
      SELECT
        next_il.id,
        next_il.prev_id,
        next_il.created_at,
        next_il.event_type,
        next_il.creator_id,
        next_il.item_id,
        encode(next_il.hash, 'hex') AS chain_hash,
        encode(next_il.event_hash, 'hex') AS event_hash
      FROM audit.item_ledger next_il
      JOIN chain c ON next_il.prev_id = c.id
    )
    SELECT
      id,
      prev_id,
      created_at,
      event_type,
      creator_id,
      item_id,
      chain_hash,
      event_hash
    FROM chain
    ORDER BY created_at ASC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, [itemId]);
    res.json({
      ok: true,
      durationMs,
      count: result.rowCount,
      rows: result.rows,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/items/:id/verify", async (req, res) => {
  let itemId;
  try {
    itemId = parseId(req.params.id, "item_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = "SELECT audit.mi_verify_item_chain($1) AS is_valid";

  try {
    const { result, durationMs } = await timedQuery(sql, [itemId]);
    res.json({
      ok: true,
      durationMs,
      is_valid: result.rows[0]?.is_valid ?? null,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/users/:id/items", async (req, res) => {
  let userId;
  try {
    userId = parseId(req.params.id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    SELECT
      i.id AS item_id,
      i.sn,
      i.status,
      i.title,
      i.creator_id,
      i.ledger_head,
      (i.stamp).created_at AS created_at,
      (i.stamp).updated_at AS updated_at
    FROM core.items i
    WHERE i.creator_id = $1
    ORDER BY i.id DESC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, [userId]);
    res.json({
      ok: true,
      durationMs,
      count: result.rowCount,
      rows: result.rows,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/users", async (req, res) => {
  const sql = `
    SELECT
      id,
      login,
      status,
      (stamp).created_at AS created_at,
      (stamp).updated_at AS updated_at
    FROM core.users
    ORDER BY id DESC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql);
    res.json({
      ok: true,
      durationMs,
      count: result.rowCount,
      rows: result.rows,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/items", async (req, res) => {
  const sql = `
    SELECT
      i.id AS item_id,
      i.sn,
      i.status,
      i.title,
      i.creator_id,
      i.ledger_head,
      (i.stamp).created_at AS created_at,
      (i.stamp).updated_at AS updated_at
    FROM core.items i
    ORDER BY i.id DESC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql);
    res.json({
      ok: true,
      durationMs,
      count: result.rowCount,
      rows: result.rows,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/bids", async (req, res) => {
  const sql = `
    SELECT
      b.id AS bid_id,
      b.status AS bid_status,
      b.value::text AS bid_value,
      b.offer_id,
      b.bidder_id
    FROM data.bids b
    ORDER BY b.id DESC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql);
    res.json({
      ok: true,
      durationMs,
      count: result.rowCount,
      rows: result.rows,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/stats", async (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM core.users) AS users,
      (SELECT COUNT(*) FROM core.items) AS items,
      (SELECT COUNT(*) FROM data.offers) AS offers,
      (SELECT COUNT(*) FROM data.bids) AS bids,
      (SELECT COUNT(*) FROM audit.item_ledger) AS item_ledger
  `;

  try {
    const { result, durationMs } = await timedQuery(sql);
    res.json({
      ok: true,
      durationMs,
      counts: result.rows[0],
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});
module.exports = router;