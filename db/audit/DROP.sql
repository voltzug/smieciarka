SET search_path TO audit;

-- Triggers
DROP TRIGGER IF EXISTS trg_protect_item_ledger_update ON item_ledger;
DROP TRIGGER IF EXISTS trg_protect_item_ledger_delete ON item_ledger;
DROP TRIGGER IF EXISTS trg_protect_item_ledger_insert ON item_ledger;

-- Functions
DROP FUNCTION IF EXISTS protect_item_ledger_no_update_delete();
DROP FUNCTION IF EXISTS protect_item_ledger_insert();

DROP FUNCTION IF EXISTS append_item_event(bigint, bigint, bigint, e_item_event_type, bytea);
DROP FUNCTION IF EXISTS _chain_hash(bytea, bytea);
DROP FUNCTION IF EXISTS _init_item_chain(bigint, bigint, bytea, bytea);
DROP FUNCTION IF EXISTS mi_verify_item_chain(bigint);

-- Tables
ALTER TABLE core.items DROP CONSTRAINT IF EXISTS fk_items_ledger_head;
DROP TABLE IF EXISTS item_ledger;

-- Types
DROP TYPE IF EXISTS e_item_event_type;
