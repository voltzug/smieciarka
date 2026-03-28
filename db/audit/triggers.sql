SET search_path TO audit;

-- block UPDATE and DELETE entirely once a ledger row is written it is immutable.
CREATE OR REPLACE FUNCTION audit.protect_item_ledger_no_update_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, core, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'item_ledger is append-only: % operations are forbidden', TG_OP;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_protect_item_ledger_update
    BEFORE UPDATE ON audit.item_ledger
    FOR EACH ROW
    EXECUTE FUNCTION audit.protect_item_ledger_no_update_delete();
CREATE TRIGGER trg_protect_item_ledger_delete
    BEFORE DELETE ON audit.item_ledger
    FOR EACH ROW
    EXECUTE FUNCTION audit.protect_item_ledger_no_update_delete();


-- Validate every INSERT targeting ledger
CREATE OR REPLACE FUNCTION audit.protect_item_ledger_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, core, pg_temp
AS $$
DECLARE
    v_expected  bytea;
    v_prev_hash bytea;
    v_genesis   bytea;
    v_prev_item bigint;
BEGIN
    IF NEW.prev_id IS NULL THEN
        -- Genesis row: verify hash = sha256(core.items.hash_genesis || event_hash)
        SELECT i.hash_genesis
          INTO v_genesis
          FROM core.items i
         WHERE i.id = NEW.item_id;

        IF v_genesis IS NULL THEN
            RAISE EXCEPTION 'item_ledger INSERT rejected: item_id = % does not exist', NEW.item_id;
        END IF;

        v_expected := sha384(v_genesis || NEW.event_hash);

        IF NEW.hash IS DISTINCT FROM v_expected THEN
            RAISE EXCEPTION 'item_ledger INSERT rejected: genesis hash mismatch for item_id = %', NEW.item_id;
        END IF;
    ELSE
        -- Chained row: prev must exist, belong to same item, hash must chain
        SELECT il.hash, il.item_id
          INTO v_prev_hash, v_prev_item
          FROM audit.item_ledger il
         WHERE il.id = NEW.prev_id;

        IF v_prev_hash IS NULL THEN
            RAISE EXCEPTION 'item_ledger INSERT rejected: prev_id = % not found', NEW.prev_id;
        END IF;

        IF v_prev_item IS DISTINCT FROM NEW.item_id THEN
            RAISE EXCEPTION
                'item_ledger INSERT rejected: prev_id = % belongs to item_id = %, expected %',
                NEW.prev_id, v_prev_item, NEW.item_id;
        END IF;

        v_expected := sha384(v_prev_hash || NEW.event_hash);

        IF NEW.hash IS DISTINCT FROM v_expected THEN
            RAISE EXCEPTION 'item_ledger INSERT rejected: chain hash mismatch (prev_id = %)', NEW.prev_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- CREATE TRIGGER trg_protect_item_ledger_insert
--     BEFORE INSERT ON item_ledger
--     FOR EACH ROW
--     EXECUTE FUNCTION protect_item_ledger_insert();
