SET search_path TO data;

-- hash helpers (called by bench transaction logic via SQL)
CREATE OR REPLACE FUNCTION data._offer_hash(
    p_offer_id bigint,
    p_item_id bigint,
    p_creator_id bigint,
    p_price money,
    p_description text,
    p_stamp timestamptz
)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
BEGIN
    RETURN sha384(
        convert_to(
            p_offer_id::text || p_item_id::text || p_creator_id::text || p_price::text || p_description || p_stamp::text,
            'UTF8'
        )
    );
END;
$$;


CREATE OR REPLACE FUNCTION data.change_item_details(p_item_id bigint, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
BEGIN
    UPDATE data.item_details
    SET description = p_description
    WHERE item_id = p_item_id;
END;
$$;


-- maintenance
CREATE OR REPLACE FUNCTION data.mc_drop_offers(p_before timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
DECLARE
    v_deleted_count integer := 0;
BEGIN
    DELETE FROM data.offers o
    WHERE o.status = 'CLOSED'
      AND (o.stamp).updated_at < p_before;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;
