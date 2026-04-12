const express = require("express");
const { timedQuery } = require("./db");

const router = express.Router();

const parseId = (value, fieldName) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return id;
};

const parseMoney = (value, fieldName) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return amount;
};

const sendError = (res, error, status = 400) => {
  res.status(status).json({
    ok: false,
    error: error.message || String(error),
  });
};

router.post("/items", async (req, res) => {
  let creatorId;
  const sn = req.body?.sn;
  const title = req.body?.title;

  try {
    creatorId = parseId(req.body?.creator_id, "creator_id");
    if (!sn || !title) {
      throw new Error("sn and title are required");
    }
  } catch (error) {
    return sendError(res, error);
  }

  const sql = "SELECT core.create_item($1, $2, $3) AS item_id";

  try {
    const { result, durationMs } = await timedQuery(sql, [creatorId, sn, title]);
    res.json({
      ok: true,
      durationMs,
      item_id: result.rows[0]?.item_id,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post("/offers", async (req, res) => {
  let creatorId;
  let itemId;
  let price;
  const description = req.body?.description || null;

  try {
    creatorId = parseId(req.body?.creator_id, "creator_id");
    itemId = parseId(req.body?.item_id, "item_id");
    price = parseMoney(req.body?.price, "price");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = "SELECT data.register_item_offer($1, $2, $3::money, $4) AS offer_id";

  try {
    const { result, durationMs } = await timedQuery(sql, [creatorId, itemId, price, description]);
    res.json({
      ok: true,
      durationMs,
      offer_id: result.rows[0]?.offer_id,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/offers", async (req, res) => {
  const { user_id } = req.query || {};
  let userId;

  try {
    userId = parseId(user_id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

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
      (o.stamp).created_at AS created_at,
      (o.stamp).updated_at AS updated_at,
      (
        SELECT count(*)
        FROM data.bids b
        WHERE b.offer_id = o.id
      ) AS bid_count
    FROM data.offers o
    JOIN core.items i ON i.id = o.item_id
    WHERE o.creator_id = $1
    ORDER BY o.id DESC
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

router.post("/offers/:id/cancel", async (req, res) => {
  let offerId;
  let userId;

  try {
    offerId = parseId(req.params.id, "offer_id");
    userId = parseId(req.body?.user_id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = "SELECT data.cancel_item_offer($1, $2)";

  try {
    const { result, durationMs } = await timedQuery(sql, [userId, offerId]);
    res.json({
      ok: true,
      durationMs,
      updated: result.rowCount,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post("/offers/:id/transfer", async (req, res) => {
  let offerId;
  let userId;

  try {
    offerId = parseId(req.params.id, "offer_id");
    userId = parseId(req.body?.user_id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    UPDATE data.offers
    SET status = 'PENDING_TRANSACTION'
    WHERE id = $1
      AND creator_id = $2
      AND status = 'RESERVED'
    RETURNING id
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, [offerId, userId]);
    res.json({
      ok: true,
      durationMs,
      updated: result.rowCount,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/conversations", async (req, res) => {
  const { offer_id, bid_id } = req.query || {};
  let offerId;
  let bidId;

  try {
    offerId = parseId(offer_id, "offer_id");
    if (bid_id !== undefined && bid_id !== null && bid_id !== "") {
      bidId = parseId(bid_id, "bid_id");
    }
  } catch (error) {
    return sendError(res, error);
  }

  const params = [offerId];
  const bidFilter = bidId ? `AND c.bid_id = $2` : "";
  if (bidId) params.push(bidId);

  const sql = `
    SELECT
      c.id AS conversation_id,
      c.subject,
      c.contents,
      c.commenter_id,
      c.offer_id,
      c.bid_id,
      c.created_at,
      u.login AS commenter_login
    FROM data.conversations c
    JOIN core.users u ON u.id = c.commenter_id
    WHERE c.offer_id = $1
    ${bidFilter}
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, params);
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

router.post("/conversations", async (req, res) => {
  let commenterId;
  let offerId;
  const { bid_id, subject, contents } = req.body || {};
  let bidId = null;

  try {
    commenterId = parseId(req.body?.commenter_id, "commenter_id");
    offerId = parseId(req.body?.offer_id, "offer_id");
    if (bid_id !== undefined && bid_id !== null && bid_id !== "") {
      bidId = parseId(bid_id, "bid_id");
    }
    if (!subject || !contents) {
      throw new Error("subject and contents are required");
    }
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    INSERT INTO data.conversations (subject, contents, commenter_id, offer_id, bid_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id AS conversation_id
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, [subject, contents, commenterId, offerId, bidId]);
    res.json({
      ok: true,
      durationMs,
      conversation_id: result.rows[0]?.conversation_id,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

module.exports = router;
router.get("/conversations", async (req, res) => {
  const { offer_id, bid_id } = req.query || {};
  let offerId;
  let bidId;

  try {
    offerId = parseId(offer_id, "offer_id");
    if (bid_id !== undefined && bid_id !== null && bid_id !== "") {
      bidId = parseId(bid_id, "bid_id");
    }
  } catch (error) {
    return sendError(res, error);
  }

  const params = [offerId];
  const bidFilter = bidId ? `AND c.bid_id = $2` : "";
  if (bidId) params.push(bidId);

  const sql = `
    SELECT
      c.id AS conversation_id,
      c.subject,
      c.contents,
      c.commenter_id,
      c.offer_id,
      c.bid_id,
      c.created_at,
      u.login AS commenter_login
    FROM data.conversations c
    JOIN core.users u ON u.id = c.commenter_id
    WHERE c.offer_id = $1
    ${bidFilter}
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 999
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, params);
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

router.post("/conversations", async (req, res) => {
  let commenterId;
  let offerId;
  const { bid_id, subject, contents } = req.body || {};
  let bidId = null;

  try {
    commenterId = parseId(req.body?.commenter_id, "commenter_id");
    offerId = parseId(req.body?.offer_id, "offer_id");
    if (bid_id !== undefined && bid_id !== null && bid_id !== "") {
      bidId = parseId(bid_id, "bid_id");
    }
    if (!subject || !contents) {
      throw new Error("subject and contents are required");
    }
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    INSERT INTO data.conversations (subject, contents, commenter_id, offer_id, bid_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id AS conversation_id
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, [subject, contents, commenterId, offerId, bidId]);
    res.json({
      ok: true,
      durationMs,
      conversation_id: result.rows[0]?.conversation_id,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

module.exports = router;
