SET search_path TO data;

-- Triggers
DROP TRIGGER IF EXISTS trg_validate_bid_value_ge_offer_price ON bids;
DROP FUNCTION IF EXISTS validate_bid_value_ge_offer_price();

-- Functions
DROP FUNCTION IF EXISTS _init_user_details(bigint, varchar, varchar, varchar);
DROP FUNCTION IF EXISTS _change_user_email(bigint, varchar);
DROP FUNCTION IF EXISTS change_user_details(bigint, varchar, varchar);
DROP FUNCTION IF EXISTS _init_item_details(bigint, text);
DROP FUNCTION IF EXISTS change_item_details(bigint, text);

DROP FUNCTION IF EXISTS _offer_hash(bigint, bigint, bigint, money, text, timestamptz);
DROP FUNCTION IF EXISTS register_item_offer(bigint, bigint, money, text);
DROP FUNCTION IF EXISTS cancel_item_offer(bigint, bigint);

DROP FUNCTION IF EXISTS _bid_hash(bigint, bigint, bigint, bigint, money, timestamptz);
DROP FUNCTION IF EXISTS place_item_bid(bigint, bigint, money);
DROP FUNCTION IF EXISTS cancel_item_bid(bigint, bigint);

DROP FUNCTION IF EXISTS comment_item_offer(bigint, bigint, varchar, text);

DROP FUNCTION IF EXISTS mc_drop_offers(timestamptz);

-- Tables
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS item_details;
DROP TABLE IF EXISTS user_details;

-- Types
DROP TYPE IF EXISTS e_offer_status;
DROP TYPE IF EXISTS e_bid_status;
