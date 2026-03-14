SET search_path TO data;

-- Trigger
DROP TRIGGER IF EXISTS trg_validate_bid_value_ge_offer_price ON bids;
DROP FUNCTION IF EXISTS validate_bid_value_ge_offer_price();

-- Function
DROP FUNCTION IF EXISTS _init_user_details(bigint, varchar, varchar, varchar);
DROP FUNCTION IF EXISTS _change_user_email(bigint, varchar);
DROP FUNCTION IF EXISTS change_user_details(bigint, varchar, varchar);
DROP FUNCTION IF EXISTS _init_item_details(bigint, text);
DROP FUNCTION IF EXISTS change_item_details(bigint, text);

-- Table
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS user_details;

-- Type
DROP TYPE IF EXISTS e_offer_status;
DROP TYPE IF EXISTS e_bid_status;
