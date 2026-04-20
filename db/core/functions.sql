SET search_path TO core;

-- users
CREATE OR REPLACE FUNCTION core._user_data_hash(
    p_login character varying,
    p_email character varying
)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
BEGIN
    RETURN sha384(
        convert_to( p_login || p_email, 'UTF8' )
    );
END;
$$;

CREATE OR REPLACE FUNCTION core.create_user(
    p_login       character varying,
    p_password    character varying,
    p_name        character varying,
    p_surname     character varying,
    p_email       character varying
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, data, audit, pg_temp
AS $$
DECLARE
    v_user_id   bigint;
    v_data_hash bytea;
BEGIN
    v_data_hash := core._user_data_hash(p_login, p_email);

    INSERT INTO core.users (login, password, status, data_hash)
    VALUES (p_login, p_password, 'ACTIVE', v_data_hash)
    RETURNING id INTO v_user_id;

    PERFORM data._init_user_details(v_user_id, p_name, p_surname, p_email);

    RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION core.change_user_password(
    p_user_id bigint,
    p_new_password character varying
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, data, audit, pg_temp
AS $$
BEGIN
    UPDATE core.users
    SET password = p_new_password
    WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION core.change_user_email(
    p_user_id bigint,
    p_new_email character varying
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, data, audit, pg_temp
AS $$
DECLARE
    v_login character varying;
    v_data_hash bytea;
BEGIN
    SELECT login INTO v_login
    FROM core.users
    WHERE id = p_user_id;

    IF v_login IS NULL THEN
        RAISE EXCEPTION 'User with id % does not exist', p_user_id;
    END IF;

    v_data_hash := core._user_data_hash(v_login, p_new_email);

    UPDATE core.users
    SET data_hash = v_data_hash
    WHERE id = p_user_id;

    PERFORM data._change_user_email(p_user_id, p_new_email);
END;
$$;

CREATE OR REPLACE FUNCTION core.deactivate_user(
    p_user_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, data, audit, pg_temp
AS $$
BEGIN
    UPDATE core.users
    SET status = 'DELETED',
        password = encode(sha384(audit.gen_random_bytes(32)), 'hex')
    WHERE id = p_user_id;

    DELETE FROM data.user_details
    WHERE user_id = p_user_id;
END;
$$;


-- items
CREATE OR REPLACE FUNCTION core._item_hash(
    p_item_id bigint,
    p_creator_id bigint,
    p_sn character varying,
    p_title character varying,
    p_stamp timestamptz
)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
BEGIN
    RETURN sha384(
        convert_to(
            p_item_id::text || p_creator_id::text || p_sn || p_title || p_stamp::text,
            'UTF8'
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION core.create_item(
    p_creator_id  bigint,
    p_sn          character varying,
    p_title       character varying
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, data, audit, pg_temp
AS $$
DECLARE
    v_item_id      bigint;
    v_hash_genesis bytea;
    v_item_hash    bytea;
    v_stamp        timestamptz;
BEGIN
    v_hash_genesis := audit.gen_random_bytes(32);

    INSERT INTO core.items (hash_genesis, sn, status, title, creator_id)
    VALUES (v_hash_genesis, p_sn, 'CREATED', p_title, p_creator_id)
    RETURNING id, (stamp).created_at INTO v_item_id, v_stamp;

    v_item_hash := core._item_hash(v_item_id, p_creator_id, p_sn, p_title, v_stamp);
    PERFORM audit._init_item_chain(v_item_id, p_creator_id, v_hash_genesis, v_item_hash);

    RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION core.change_item_sn(
    p_item_id bigint,
    p_new_sn character varying,
    p_user_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, data, audit, pg_temp
AS $$
DECLARE
    v_item record;
    v_item_hash bytea;
    v_stamp timestamptz;
BEGIN
    SELECT id, creator_id, sn, title, ledger_head
      INTO v_item
    FROM core.items
    WHERE id = p_item_id
      AND creator_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item with id % does not exist', p_item_id;
    END IF;

    v_stamp := now();

    UPDATE core.items
    SET sn = p_new_sn, stamp = ((v_item.stamp).created_at, v_stamp)
    WHERE id = p_item_id;

    v_item_hash := core._item_hash(
        v_item.id,
        v_item.creator_id,
        p_new_sn,
        v_item.title,
        v_stamp
    );
    PERFORM audit.append_item_event(
        v_item.ledger_head,
        v_item.id,
        p_user_id,
        'MOD_ITEM_SN',
        v_item_hash
    );
END;
$$;

CREATE OR REPLACE FUNCTION core.change_item_details(
    p_item_id bigint,
    p_new_title character varying,
    p_user_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, data, audit, pg_temp
AS $$
DECLARE
    v_item record;
    v_item_hash bytea;
    v_stamp timestamptz;
BEGIN
    SELECT id, creator_id, sn, title, ledger_head, stamp
      INTO v_item
    FROM core.items
    WHERE id = p_item_id
      AND creator_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item with id % does not exist', p_item_id;
    END IF;

    v_stamp := now();

    UPDATE core.items
    SET title = p_new_title, stamp = ((v_item.stamp).created_at, v_stamp)
    WHERE id = p_item_id;

    v_item_hash := core._item_hash(
        v_item.id,
        v_item.creator_id,
        v_item.sn,
        p_new_title,
        v_stamp
    );
    PERFORM audit.append_item_event(
        v_item.ledger_head,
        v_item.id,
        p_user_id,
        'MOD_ITEM_DETAILS',
        v_item_hash
    );
END;
$$;
