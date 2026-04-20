-- pgbench data workload: sellers/buyers actions + audit events
SET search_path TO data, core, audit, pg_temp;

-- scalable ranges (indexed domains)
\set users_n (1000 * :scale)
\set items_n (1000 * :scale)
\set offers_n (1000 * :scale)
\set bids_n (1000 * :scale)

-- cap by existing data to avoid empty sets
SELECT LEAST(count(*), :users_n) AS users_count FROM core.users \gset
SELECT LEAST(count(*), :items_n) AS items_count FROM core.items \gset
SELECT LEAST(count(*), :offers_n) AS offers_count FROM data.offers \gset
SELECT LEAST(count(*), :bids_n) AS bids_count FROM data.bids \gset

\set chance random(0, 99)

BEGIN;

-- 0-19: register offer (seller) -> audit via function
\if :chance < 20
  SELECT LEAST(count(*), :items_n) AS no_offer_items_count
    FROM core.items i
    LEFT JOIN data.offers o
      ON o.item_id = i.id AND o.status IN ('ACTIVE','RESERVED')
   WHERE o.id IS NULL
  \gset
  \if :no_offer_items_count > 0
    \set item_offset random(0, :no_offer_items_count - 1)
    SELECT i.id, i.creator_id
      FROM core.items i
      LEFT JOIN data.offers o
        ON o.item_id = i.id AND o.status IN ('ACTIVE','RESERVED')
     WHERE o.id IS NULL
     OFFSET :item_offset LIMIT 1
    \gset item_
    \set price_cents random(100, 100000)
    SELECT data.register_item_offer(
      :item_creator_id,
      :item_id,
      (:price_cents / 100.0)::numeric::money,
      format('offer for item %s', :item_id)
    );
  \endif
\endif

-- 20-34: cancel offer (seller) -> audit via function
\if :chance >= 20 and :chance < 35
  SELECT count(*) AS cancellable_offers_count
    FROM data.offers
   WHERE status IN ('ACTIVE','RESERVED')
  \gset
  \if :cancellable_offers_count > 0
    \set offer_offset random(0, :cancellable_offers_count - 1)
    SELECT id, creator_id
      FROM data.offers
     WHERE status IN ('ACTIVE','RESERVED')
     OFFSET :offer_offset LIMIT 1
    \gset offer_
    SELECT data.cancel_item_offer(:offer_creator_id, :offer_id);
  \endif
\endif

-- 35-54: place bid (buyer)
\if :chance >= 35 and :chance < 55
  SELECT count(*) AS active_offers_count
    FROM data.offers
   WHERE status = 'ACTIVE'
  \gset
  \if :active_offers_count > 0
    \set offer_offset random(0, :active_offers_count - 1)
    SELECT id, creator_id, price::numeric AS offer_price_num
      FROM data.offers
     WHERE status = 'ACTIVE'
     OFFSET :offer_offset LIMIT 1
    \gset offer_
    SELECT count(*) AS other_users_count
      FROM core.users
     WHERE id <> :offer_creator_id
    \gset
    \if :other_users_count > 0
      \set bidder_offset random(0, :other_users_count - 1)
      SELECT id
        FROM core.users
       WHERE id <> :offer_creator_id
       OFFSET :bidder_offset LIMIT 1
      \gset bidder_
      \set bid_bump_cents random(0, 5000)
      SELECT data.place_item_bid(
        :bidder_id,
        :offer_id,
        ((:bid_bump_cents / 100.0)::numeric + :offer_offer_price_num)::money
      );
    \endif
  \endif
\endif

-- 55-64: cancel bid (buyer)
\if :chance >= 55 and :chance < 65
  SELECT count(*) AS pending_bids_count
    FROM data.bids
   WHERE status = 'PENDING'
  \gset
  \if :pending_bids_count > 0
    \set bid_offset random(0, :pending_bids_count - 1)
    SELECT id, bidder_id
      FROM data.bids
     WHERE status = 'PENDING'
     OFFSET :bid_offset LIMIT 1
    \gset bid_
    SELECT data.cancel_item_bid(:bid_bidder_id, :bid_id);
  \endif
\endif

-- 65-74: reserve offer (seller-side state change) + audit event
-- \if :chance >= 65 and :chance < 75
-- \endif

-- 75-84: bid winning (offer state change) + audit event
-- \if :chance >= 75 and :chance < 85
-- \endif

-- 85-99: comment (noise)
\if :chance >= 85
  SELECT count(*) AS open_offers_count
    FROM data.offers
   WHERE status <> 'CLOSED'
  \gset
  \if :open_offers_count > 0 and :users_count > 0
    \set offer_offset random(0, :open_offers_count - 1)
    SELECT id
      FROM data.offers
     WHERE status <> 'CLOSED'
     OFFSET :offer_offset LIMIT 1
    \gset offer_
    \set commenter_offset random(0, :users_count - 1)
    SELECT id
      FROM core.users
     OFFSET :commenter_offset LIMIT 1
    \gset commenter_
    SELECT data.comment_item_offer(
      :commenter_id,
      :offer_id,
      format('question for offer %s', :offer_id),
      format('comment from user %s', :commenter_id)
    );
  \endif
\endif

COMMIT;
