-- Func
DROP TRIGGER IF EXISTS trg_protect_item_ledger_update ON core.item_ledger;
DROP TRIGGER IF EXISTS trg_protect_item_ledger_delete ON core.item_ledger;
DROP TRIGGER IF EXISTS trg_protect_item_ledger_insert ON core.item_ledger;

DROP FUNCTION IF EXISTS core.protect_item_ledger_no_update_delete();
DROP FUNCTION IF EXISTS core.protect_item_ledger_insert();
DROP FUNCTION IF EXISTS core.append_item_event(bigint, character(13), bigint);
DROP FUNCTION IF EXISTS core.create_item(character varying, character varying, bigint, text);
DROP FUNCTION IF EXISTS core.create_user(character varying, character varying, character varying, character varying, character varying);

-- Tabe
DROP TABLE IF EXISTS core.user_details;
DROP TABLE IF EXISTS core.item_details;

DROP TABLE IF EXISTS core.item_ledger;

DROP TABLE IF EXISTS core.items;
DROP TABLE IF EXISTS core.users;
