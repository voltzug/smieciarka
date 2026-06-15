SET search_path TO core;

-- hash helpers (called by bench transaction logic via SQL)
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
