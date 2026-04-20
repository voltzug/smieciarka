-- pgbench core workload: user/item create + search
SET search_path TO core, data, audit;

-- scalable counts (indexed domains)
\set users_n (100000 * :scale)
\set items_n (100000 * :scale)
\set offers_n (100000 * :scale)
\set bids_n (100000 * :scale)

\set action random(1, 100)

\if :action <= 30
BEGIN;
SELECT (random() * 100000000)::bigint AS rnd \gset
SELECT core.create_user(
  format('u_%s_%s', :client_id, :rnd),
  'pass',
  'Name',
  'Surname',
  format('u_%s_%s@example.com', :client_id, :rnd)
);
COMMIT;
\elif :action <= 60
BEGIN;
SELECT id AS creator_id FROM core.users ORDER BY random() LIMIT 1 \gset
SELECT core.create_item(
  :creator_id,
  format('SN-%s-%s', :creator_id, (random() * 100000000)::bigint),
  format('Item %s', (random() * 100000000)::bigint)
);
COMMIT;
\else
\set search_action random(1, 3)
\if :search_action = 1
-- use real item keys
SELECT id AS item_id, sn AS item_sn, title AS item_title
FROM core.items
ORDER BY random()
LIMIT 1
\gset item_

SELECT o.id AS offer_id, o.status AS offer_status, o.price, o.item_id,
       i.sn, i.title, i.creator_id
FROM data.offers o
JOIN core.items i ON i.id = o.item_id
WHERE i.sn = ':item_sn'
   OR i.title = ':item_title'
ORDER BY (o.stamp).created_at DESC
LIMIT 20;
\elif :search_action = 2
SELECT id AS user_id FROM core.users ORDER BY random() LIMIT 1 \gset
SELECT b.id, b.value, b.status, b.offer_id, b.created_at
FROM data.bids b
WHERE b.bidder_id = :user_id
ORDER BY b.created_at DESC
LIMIT 20;
\else
SELECT id AS user_id FROM core.users ORDER BY random() LIMIT 1 \gset
SELECT o.id, o.status, o.price, o.item_id, (o.stamp).created_at AS created_at
FROM data.offers o
WHERE o.creator_id = :user_id
ORDER BY (o.stamp).created_at DESC
LIMIT 20;
\endif
\endif
