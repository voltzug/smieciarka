DROP TRIGGER IF EXISTS trg_protect_item_ledger_update ON core.item_ledger;
DROP TRIGGER IF EXISTS trg_protect_item_ledger_delete ON core.item_ledger;
DROP TRIGGER IF EXISTS trg_protect_item_ledger_insert ON core.item_ledger;


TRUNCATE TABLE user_details;
TRUNCATE TABLE item_details;

TRUNCATE TABLE item_ledger;

TRUNCATE TABLE items;
TRUNCATE TABLE users;

-- TODO restore triggers
