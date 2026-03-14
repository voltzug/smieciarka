SET search_path TO core;

-- Func
DROP TRIGGER IF EXISTS trg_prevent_direct_login_update ON users;
DROP FUNCTION IF EXISTS prevent_direct_login_update();

DROP FUNCTION IF EXISTS create_item(bigint, character varying, character varying);
DROP FUNCTION IF EXISTS change_item_sn(bigint, character varying, bigint);
DROP FUNCTION IF EXISTS change_item_details(bigint, character varying, bigint);

DROP FUNCTION IF EXISTS create_user(character varying, character varying, character varying, character varying, character varying);
DROP FUNCTION IF EXISTS change_user_password(bigint, character varying);
DROP FUNCTION IF EXISTS change_user_email(bigint, character varying);
DROP FUNCTION IF EXISTS deactivate_user(bigint);

DROP FUNCTION IF EXISTS _user_data_hash(character varying, character varying);
DROP FUNCTION IF EXISTS _item_hash(bigint, bigint, character varying, character varying);

-- Table
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS users;

-- Type
DROP TYPE IF EXISTS t_created_updated;
DROP TYPE IF EXISTS e_user_status;
DROP TYPE IF EXISTS e_item_status;
