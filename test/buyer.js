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

router.get("/bids", async (req, res) => {
  const { user_id } = req.query || {};
  let userId;

  try {
    userId = parseId(user_id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    SELECT
      b.id AS bid_id,
      b.status AS bid_status,
      b.value::text AS bid_value,
      b.offer_id,
      o.status AS offer_status,
      o.price::text AS offer_price,
      o.item_id,
      i.title AS item_title,
      i.sn AS item_sn,
      (o.stamp).created_at AS offer_created_at,
      (o.stamp).updated_at AS offer_updated_at,
      COALESCE((o.stamp).updated_at, (o.stamp).created_at) AS offer_time
    FROM data.bids b
    JOIN data.offers o ON o.id = b.offer_id
    JOIN core.items i ON i.id = o.item_id
    WHERE b.bidder_id = $1
    ORDER BY b.id DESC
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

router.post("/bids", async (req, res) => {
  let bidderId;
  let offerId;
  let value;

  try {
    bidderId = parseId(req.body?.bidder_id, "bidder_id");
    offerId = parseId(req.body?.offer_id, "offer_id");
    value = parseMoney(req.body?.value, "value");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = "SELECT data.place_item_bid($1, $2, $3::money) AS bid_id";

  try {
    const { result, durationMs } = await timedQuery(sql, [bidderId, offerId, value]);
    res.json({
      ok: true,
      durationMs,
      bid_id: result.rows[0]?.bid_id,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post("/bids/:id/cancel", async (req, res) => {
  let bidId;
  let bidderId;

  try {
    bidId = parseId(req.params.id, "bid_id");
    bidderId = parseId(req.body?.user_id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = "SELECT data.cancel_item_bid($1, $2)";

  try {
    const { result, durationMs } = await timedQuery(sql, [bidderId, bidId]);
    res.json({
      ok: true,
      durationMs,
      updated: result.rowCount,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post("/bids/:id/pay", async (req, res) => {
  let bidId;
  let bidderId;

  try {
    bidId = parseId(req.params.id, "bid_id");
    bidderId = parseId(req.body?.user_id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    UPDATE data.offers o
    SET status = 'PENDING_TRANSACTION'
    FROM data.bids b
    WHERE b.offer_id = o.id
      AND b.id = $1
      AND b.bidder_id = $2
      AND o.status = 'RESERVED'
    RETURNING o.id
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, [bidId, bidderId]);
    res.json({
      ok: true,
      durationMs,
      updated: result.rowCount,
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post("/bids/:id/ack", async (req, res) => {
  let bidId;
  let bidderId;

  try {
    bidId = parseId(req.params.id, "bid_id");
    bidderId = parseId(req.body?.user_id, "user_id");
  } catch (error) {
    return sendError(res, error);
  }

  const sql = `
    WITH target AS (
      SELECT b.id AS bid_id, b.offer_id
      FROM data.bids b
      JOIN data.offers o ON o.id = b.offer_id
      WHERE b.id = $1
        AND b.bidder_id = $2
        AND o.status = 'PENDING_TRANSACTION'
    ),
    update_offer AS (
      UPDATE data.offers o
      SET status = 'CLOSED'
      FROM target t
      WHERE o.id = t.offer_id
      RETURNING o.id
    ),
    update_bid AS (
      UPDATE data.bids b
      SET status = 'FINISHED'
      FROM target t
      WHERE b.id = t.bid_id
      RETURNING b.id
    )
    SELECT
      (SELECT count(*) FROM update_offer) AS offers_updated,
      (SELECT count(*) FROM update_bid) AS bids_updated
  `;

  try {
    const { result, durationMs } = await timedQuery(sql, [bidId, bidderId]);
    res.json({
      ok: true,
      durationMs,
      offers_updated: Number(result.rows[0]?.offers_updated || 0),
      bids_updated: Number(result.rows[0]?.bids_updated || 0),
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

module.exports = router;
