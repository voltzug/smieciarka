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
