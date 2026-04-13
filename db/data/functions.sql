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

CREATE OR REPLACE FUNCTION data.register_item_offer(
    p_creator_id bigint,
    p_item_id bigint,
    p_price money,
    p_description text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, core, audit, pg_temp
AS $$
DECLARE
    v_item record;
    v_existing_offer record;
    v_offer_id bigint;
    v_offer_hash bytea;
    v_stamp timestamptz;
BEGIN
    SELECT id, creator_id, ledger_head
      INTO v_item
    FROM core.items
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % does not exists', p_item_id;
    END IF;

    IF v_item.creator_id <> p_creator_id THEN
        RAISE EXCEPTION 'User % does not own item %', p_creator_id, p_item_id;
    END IF;

    SELECT id, status INTO v_existing_offer
    FROM data.offers
    WHERE item_id = p_item_id;

    IF v_existing_offer.id IS NOT NULL THEN
        IF v_existing_offer.status = 'CLOSED' THEN
            UPDATE data.offers
            SET status = 'ACTIVE', price = p_price, description = p_description, stamp = (now(), now())
            WHERE id = v_existing_offer.id;
            v_offer_id := v_existing_offer.id;
            SELECT (stamp).created_at INTO v_stamp FROM data.offers WHERE id = v_offer_id;
        ELSE
            RAISE EXCEPTION 'An active or reserved offer already exists for item %', p_item_id;
        END IF;
    ELSE
        INSERT INTO data.offers (status, price, description, item_id, creator_id)
        VALUES ('ACTIVE', p_price, p_description, p_item_id, p_creator_id)
        RETURNING id, (stamp).created_at INTO v_offer_id, v_stamp;
    END IF;

    v_offer_hash := data._offer_hash(
        v_offer_id,
        p_item_id,
        p_creator_id,
        p_price,
        p_description,
        v_stamp
    );
    PERFORM audit.append_item_event(
        v_item.ledger_head,
        v_item.id,
        p_creator_id,
        'REGISTER_OFFER',
        v_offer_hash
    );

    RETURN v_offer_id;
END;
$$;

CREATE OR REPLACE FUNCTION data.cancel_item_offer(
    p_user_id bigint,
    p_offer_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, core, audit, pg_temp
AS $$
DECLARE
    v_offer record;
    v_offer_hash bytea;
    v_stamp timestamptz;
BEGIN
    SELECT o.id, o.status, o.item_id, o.price, o.description, o.stamp, i.creator_id, i.ledger_head
      INTO v_offer
    FROM data.offers o
    JOIN core.items i ON o.item_id = i.id
    WHERE o.id = p_offer_id;

    IF v_offer.id IS NULL THEN
        RAISE EXCEPTION 'Offer with id % does not exist', p_offer_id;
    END IF;

    IF v_offer.creator_id <> p_user_id THEN
        RAISE EXCEPTION 'User % does not own the offer %', p_user_id, p_offer_id;
    END IF;

    IF v_offer.status NOT IN ('ACTIVE', 'RESERVED') THEN
        RAISE EXCEPTION 'Offer % cannot be cancelled (status=%)', p_offer_id, v_offer.status;
    END IF;

    v_stamp := now();

    UPDATE data.offers
    SET status = 'CLOSED', stamp = ((v_offer.stamp).created_at, v_stamp)
    WHERE id = p_offer_id;

    UPDATE data.bids
    SET status = 'CANCELLED'
    WHERE offer_id = p_offer_id AND status = 'PENDING';

    v_offer_hash := data._offer_hash(
        p_offer_id,
        v_offer.item_id,
        p_user_id,
        v_offer.price,
        v_offer.description,
        v_stamp
    );
    PERFORM audit.append_item_event(
        v_offer.ledger_head,
        v_offer.item_id,
        p_user_id,
        'CANCEL_OFFER',
        v_offer_hash
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

CREATE OR REPLACE FUNCTION data.place_item_bid(
    p_bidder_id bigint,
    p_offer_id bigint,
    p_value money
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, core, audit, pg_temp
AS $$
DECLARE
    v_offer record;
    v_bid_id bigint;
    v_bid_hash bytea;
    v_stamp timestamptz;
BEGIN
    SELECT o.status, o.item_id, i.creator_id, i.ledger_head
      INTO v_offer
    FROM data.offers o
    JOIN core.items i ON o.item_id = i.id
    WHERE o.id = p_offer_id AND i.creator_id <> p_bidder_id;

    IF v_offer.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Offer % is not active', p_offer_id;
    END IF;

    INSERT INTO data.bids (offer_id, bidder_id, value, status)
    VALUES (p_offer_id, p_bidder_id, p_value, 'PENDING')
    RETURNING id, created_at INTO v_bid_id, v_stamp;

    v_bid_hash := data._bid_hash(
        v_bid_id,
        p_offer_id,
        v_offer.item_id,
        p_bidder_id,
        p_value,
        v_stamp
    );
    PERFORM audit.append_item_event(
        v_offer.ledger_head,
        v_offer.item_id,
        p_bidder_id,
        'PLACE_BID',
        v_bid_hash
    );

    RETURN v_bid_id;
END;
$$;

CREATE OR REPLACE FUNCTION data.cancel_item_bid(
    p_bidder_id bigint,
    p_bid_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, core, audit, pg_temp
AS $$
DECLARE
    v_bid record;
    v_bid_hash bytea;
    v_stamp timestamptz;
BEGIN
    SELECT b.id, b.status, b.offer_id, b.bidder_id, b.value, b.created_at, o.status as offer_status, o.item_id, i.creator_id, i.ledger_head
      INTO v_bid
    FROM data.bids b
    JOIN data.offers o ON b.offer_id = o.id
    JOIN core.items i ON o.item_id = i.id
    WHERE b.id = p_bid_id;

    IF v_bid.id IS NULL THEN
        RAISE EXCEPTION 'Bid with id % does not exist', p_bid_id;
    END IF;

    IF v_bid.bidder_id <> p_bidder_id THEN
        RAISE EXCEPTION 'User % does not own the bid %', p_bidder_id, p_bid_id;
    END IF;

    IF v_bid.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Bid % cannot be cancelled (status=%)', p_bid_id, v_bid.status;
    END IF;

    IF v_bid.offer_status NOT IN ('ACTIVE', 'RESERVED') THEN
        RAISE EXCEPTION 'Offer % is not in a state to cancel bids (status=%)', v_bid.offer_id, v_bid.offer_status;
    END IF;

    UPDATE data.bids
    SET status = 'CANCELLED'
    WHERE id = p_bid_id;

    v_bid_hash := data._bid_hash(
        p_bid_id,
        v_bid.offer_id,
        v_bid.item_id,
        p_bidder_id,
        v_bid.value,
        v_bid.created_at
    );
    PERFORM audit.append_item_event(
        v_bid.ledger_head,
        v_bid.item_id,
        p_bidder_id,
        'CANCEL_BID',
        v_bid_hash
    );
END;
$$;


-- conversations
CREATE OR REPLACE FUNCTION data.comment_item_offer(
    p_commenter_id bigint,
    p_offer_id bigint,
    p_subject varchar(256),
    p_contents text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, core, pg_temp
AS $$
DECLARE
    v_offer record;
    v_bid_id bigint := NULL;
    v_conversation_id bigint;
BEGIN
    SELECT o.id, o.creator_id, o.status INTO v_offer
    FROM data.offers o
    WHERE o.id = p_offer_id;
    IF v_offer.id IS NULL THEN
        RAISE EXCEPTION 'Offer % does not exist', p_offer_id;
    END IF;
    IF v_offer.status = 'CLOSED' THEN
        RAISE EXCEPTION 'Cannot comment on a closed offer (offer_id=%)', p_offer_id;
    END IF;

    -- Check if commenter has a bid on this offer
    SELECT b.id INTO v_bid_id
    FROM data.bids b
    WHERE b.status = 'PENDING' AND b.offer_id = p_offer_id AND b.bidder_id = p_commenter_id
    LIMIT 1;

    -- Allow any user to comment, but if they have a PENDING bid, attach bid_id
    IF v_bid_id IS NOT NULL THEN
        INSERT INTO data.conversations(subject, contents, commenter_id, offer_id, bid_id)
        VALUES (p_subject, p_contents, p_commenter_id, p_offer_id, v_bid_id)
        RETURNING id INTO v_conversation_id;
    ELSE
        INSERT INTO data.conversations(subject, contents, commenter_id, offer_id)
        VALUES (p_subject, p_contents, p_commenter_id, p_offer_id)
        RETURNING id INTO v_conversation_id;
    END IF;

    RETURN v_conversation_id;
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
