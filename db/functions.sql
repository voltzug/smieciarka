  -- CORE --
CREATE OR REPLACE FUNCTION core.create_user(
    p_login       character varying,
    p_password    character varying,
    p_name        character varying,
    p_surname     character varying,
    p_email       character varying
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id   bigint;
    v_hash_data bytea;
BEGIN
    -- deterministic fingerprint of the user record
    v_hash_data := core.digest(
        convert_to(p_login || '|' || p_email, 'UTF8'),
        'sha256'
    );

    INSERT INTO core.users (login, password, status, hash_data)
    VALUES (p_login, p_password, 'ACTIVE', v_hash_data)
    RETURNING id INTO v_user_id;

    INSERT INTO core.user_details (user_id, name, surname, email)
    VALUES (v_user_id, p_name, p_surname, p_email);

    RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION core.create_item(
    p_sn          character varying,
    p_title       character varying,
    p_creator_id  bigint,
    p_description text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    v_item_id      bigint;
    v_hash_genesis bytea;
    v_event_hash   bytea;
    v_chain_hash   bytea;
    v_ledger_id    bigint;
BEGIN
    v_hash_genesis := core.gen_random_bytes(32);

    -- insert item
    INSERT INTO core.items (hash_genesis, sn, status, title, creator_id)
    VALUES (v_hash_genesis, p_sn, 'CREATED', p_title, p_creator_id)
    RETURNING id INTO v_item_id;
    -- optional details
    IF p_description IS NOT NULL THEN
        INSERT INTO core.item_details (item_id, description)
        VALUES (v_item_id, p_description);
    END IF;

    -- event_hash = sha256(event_type || item_id || creator_id || now())
    v_event_hash := core.digest(
        convert_to(
            'CREATED' || '|' || v_item_id::text || '|' || p_creator_id::text || '|' || now()::text,
            'UTF8'
        ),
        'sha256'
    );

    v_chain_hash := core.digest(v_hash_genesis || v_event_hash, 'sha256');
    -- genesis ledger entry (prev_id IS NULL)
    INSERT INTO core.item_ledger (prev_id, hash, event_type, event_hash, creator_id, item_id)
    VALUES (NULL, v_chain_hash, 'CREATED', v_event_hash, p_creator_id, v_item_id)
    RETURNING id INTO v_ledger_id;

    RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION core.append_item_event(
    p_item_id    bigint,
    p_event_type character(13),
    p_creator_id bigint
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    v_prev_id    bigint;
    v_prev_hash  bytea;
    v_event_hash bytea;
    v_chain_hash bytea;
    v_ledger_id  bigint;
BEGIN
    -- Find the current chain tip
    SELECT il.id, il.hash
      INTO v_prev_id, v_prev_hash
      FROM core.item_ledger il
     WHERE il.item_id = p_item_id
       AND NOT EXISTS (
           SELECT 1
             FROM core.item_ledger il2
            WHERE il2.prev_id = il.id
       )
     ORDER BY il.id DESC
     LIMIT 1;
    IF v_prev_id IS NULL THEN
        RAISE EXCEPTION 'No existing ledger chain found for item_id = %', p_item_id;
    END IF;

    -- event_hash = sha256(event_type || item_id || creator_id || 'now')
    v_event_hash := core.digest(
        convert_to(
            p_event_type || '|' || p_item_id::text || '|' || p_creator_id::text || '|' || now()::text,
            'UTF8'
        ),
        'sha256'
    );

    v_chain_hash := core.digest(v_prev_hash || v_event_hash, 'sha256');
    -- standard ledger entry (prev_id IS NOT NULL)
    INSERT INTO core.item_ledger (prev_id, hash, event_type, event_hash, creator_id, item_id)
    VALUES (v_prev_id, v_chain_hash, p_event_type, v_event_hash, p_creator_id, p_item_id)
    RETURNING id INTO v_ledger_id;

    RETURN v_ledger_id;
END;
$$;
