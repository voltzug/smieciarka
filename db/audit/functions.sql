SET search_path TO audit;

CREATE OR REPLACE FUNCTION _chain_hash(
    p_prev_hash bytea,
    p_hash bytea
)
RETURNS bytea
LANGUAGE plpgsql
AS $$
DECLARE
    v_result bytea;
BEGIN
    v_result := digest(p_prev_hash || p_hash, 'sha256');
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION _init_item_chain(
    p_item_id bigint,
    p_creator_id bigint,
    p_hash_genesis bytea,
    p_event_hash bytea
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_type e_item_event_type := 'CREATE_ITEM';
    v_chain_hash bytea;
    v_ledger_id bigint;
BEGIN
    v_chain_hash := _chain_hash(p_hash_genesis, p_event_hash);

    INSERT INTO item_ledger (
        prev_id,
        hash,
        event_type,
        event_hash,
        item_id,
        creator_id
    )
    VALUES (
        NULL, -- genesis event has no previous ledger entry
        v_chain_hash,
        v_event_type,
        p_event_hash,
        p_item_id,
        p_creator_id
    )
    RETURNING id INTO v_ledger_id;

    RETURN v_ledger_id;
END;
$$;

CREATE OR REPLACE FUNCTION append_item_event(
    p_prev_ledger_id bigint,
    p_item_id bigint,
    p_creator_id bigint,
    p_event_type e_item_event_type,
    p_event_hash bytea
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    v_prev_hash bytea;
    v_chain_hash bytea;
    v_ledger_id bigint;
BEGIN
    BEGIN
        PERFORM 1 FROM item_ledger WHERE item_id = p_item_id FOR UPDATE;
        SELECT hash INTO v_prev_hash FROM item_ledger WHERE id = p_prev_ledger_id;

        v_chain_hash := _chain_hash(v_prev_hash, p_event_hash);

        INSERT INTO item_ledger (
            prev_id,
            hash,
            event_type,
            event_hash,
            item_id,
            creator_id
        )
        VALUES (
            p_prev_ledger_id,
            v_chain_hash,
            p_event_type,
            p_event_hash,
            p_item_id,
            p_creator_id
        )
        RETURNING id INTO v_ledger_id;
    EXCEPTION WHEN OTHERS THEN
        -- Explicitly release advisory lock if held (if you use advisory locks elsewhere)
        -- Otherwise, just RAISE to ensure the lock from FOR UPDATE is released by transaction end
        RAISE;
    END;

    RETURN v_ledger_id;
END;
$$;

CREATE OR REPLACE FUNCTION mi_verify_item_chain(
    p_item_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    v_ledger_head bigint;
    v_hash_genesis bytea;
    v_curr_id bigint;
    v_prev_id bigint;
    v_curr_hash bytea;
    v_prev_hash bytea;
    v_event_hash bytea;
    v_expected_hash bytea;
    v_chain_valid boolean := true;
BEGIN
    -- Ensure the item exists and get its ledger_head and hash_genesis
    SELECT ledger_head, hash_genesis INTO v_ledger_head, v_hash_genesis FROM core.items WHERE id = p_item_id;
    IF NOT FOUND OR v_ledger_head IS NULL THEN
        RAISE EXCEPTION 'Item with id % does not exist or has no ledger_head', p_item_id;
    END IF;

    v_curr_id := v_ledger_head;

    -- Traverse the chain backwards
    WHILE v_curr_id IS NOT NULL LOOP
        SELECT prev_id, hash, event_hash INTO v_prev_id, v_curr_hash, v_event_hash
        FROM item_ledger
        WHERE id = v_curr_id;

        IF v_prev_id IS NULL THEN
            -- Genesis event: use hash_genesis from core.items
            v_expected_hash := _chain_hash(v_hash_genesis, v_event_hash);

            IF v_curr_hash != v_expected_hash THEN
                v_chain_valid := false;
                EXIT;
            END IF;
        ELSE
            -- Non-genesis: use hash from previous ledger entry
            SELECT hash INTO v_prev_hash FROM item_ledger WHERE id = v_prev_id;

            v_expected_hash := _chain_hash(v_prev_hash, v_event_hash);

            IF v_curr_hash != v_expected_hash THEN
                v_chain_valid := false;
                EXIT;
            END IF;
        END IF;

        v_curr_id := v_prev_id;
    END LOOP;

    RETURN v_chain_valid;
END;
$$;
