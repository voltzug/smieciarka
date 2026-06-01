SET search_path TO data;

-- user_details
CREATE OR REPLACE FUNCTION data._init_user_details(p_user_id bigint, p_name varchar, p_surname varchar, p_email varchar)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
BEGIN
    INSERT INTO data.user_details(user_id, name, surname, email)
    VALUES (p_user_id, p_name, p_surname, p_email)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION data._change_user_email(p_user_id bigint, p_email varchar)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
BEGIN
    UPDATE data.user_details
    SET email = p_email
    WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION data.change_user_details(p_user_id bigint, p_name varchar, p_surname varchar)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
BEGIN
    UPDATE data.user_details
    SET name = p_name,
        surname = p_surname
    WHERE user_id = p_user_id;
END;
$$;

-- item_details
CREATE OR REPLACE FUNCTION data._init_item_details(p_item_id bigint, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
BEGIN
    INSERT INTO data.item_details(item_id, description)
    VALUES (p_item_id, p_description)
    ON CONFLICT (item_id) DO NOTHING;
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


-- offers
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


-- bids
CREATE OR REPLACE FUNCTION data._bid_hash(
    p_bid_id bigint,
    p_offer_id bigint,
    p_item_id bigint,
    p_bidder_id bigint,
    p_value money,
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
            p_bid_id::text || p_offer_id::text || p_item_id::text || p_bidder_id::text || p_value::text || p_stamp::text,
            'UTF8'
        )
    );
END;
$$;


-- maintainance functions
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
      AND (o.stamp).updated_at < p_before
    RETURNING id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;
