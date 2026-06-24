-- ============================================================================
-- SEGMENT 1: Users Transaction Block
-- ============================================================================
DO $$
DECLARE
    v_offset       int := 0;
    v_seller_count int := 211211;
    v_buyer_count  int := 433433;

    v_seller_id bigint;
    v_buyer_id  bigint;
    v_login     text;
    v_email     text;
    v_name      text;
    v_surname   text;
    i           int;
BEGIN
    -- USERS (sellers)
    FOR i IN (v_offset + 1)..(v_seller_count + v_offset) LOOP
        v_login   := format('seller-%s', i);
        v_email   := format('s-%s@seller.com', i);
        v_name    := 'Seller';
        v_surname := format('User-%s', i);

        INSERT INTO core.users (login, password, status, data_hash)
        VALUES (v_login, 'pass123', 'ACTIVE', core._user_data_hash(v_login, v_email))
        RETURNING id INTO v_seller_id;

        INSERT INTO data.user_details(user_id, name, surname, email)
        VALUES (v_seller_id, v_name, v_surname, v_email);
    END LOOP;

    -- USERS (buyers)
    FOR i IN (v_offset + 1)..(v_buyer_count + v_offset) LOOP
        v_login   := format('buyer-%s', i);
        v_email   := format('s-%s@buyer.com', i); -- preserving logic context naming
        v_name    := 'Buyer';
        v_surname := format('User-%s', i);

        INSERT INTO core.users (login, password, status, data_hash)
        VALUES (v_login, 'pass123', 'ACTIVE', core._user_data_hash(v_login, v_email))
        RETURNING id INTO v_buyer_id;

        INSERT INTO data.user_details(user_id, name, surname, email)
        VALUES (v_buyer_id, v_name, v_surname, v_email);
    END LOOP;
END;
$$;


-- ============================================================================
-- SEGMENT 2: Items + Offers + Bids Transaction Block
-- ============================================================================
DO $$
DECLARE
    v_offset     int := 0;
    v_item_count int := 80000;
    v_bid_count  int := 120000;

    v_base_price   numeric := 100;
    v_price_step   numeric := 9.69;

    -- Lookups aggregated efficiently from Segment 1
    v_sellers      bigint[];
    v_buyers       bigint[];
    v_offers       bigint[]  := ARRAY[]::bigint[];
    v_offer_prices numeric[] := ARRAY[]::numeric[];

    v_seller_id   bigint;
    v_buyer_id    bigint;
    v_item_id     bigint;
    v_offer_id    bigint;
    v_offer_price numeric;
    i int;

    v_hash_genesis     bytea;
    v_stamp            timestamptz;
    v_item_hash        bytea;
    v_offer_hash       bytea;
    v_chain_hash       bytea;
    v_prev_hash        bytea;
    v_item_ledger_id   bigint;
    v_bid_value        money;

    -- Dynamic pointer indicators
    v_seller_idx int;
    v_buyer_idx  int;
    v_offer_idx  int;
BEGIN
    SELECT array_agg(id ORDER BY (substring(login from '^[^-]+-(\d+)$'))::int)
      INTO v_sellers FROM core.users WHERE login LIKE 'seller-%';

    SELECT array_agg(id ORDER BY (substring(login from '^[^-]+-(\d+)$'))::int)
      INTO v_buyers FROM core.users WHERE login LIKE 'buyer-%';

    IF v_sellers IS NULL OR v_buyers IS NULL THEN
        RAISE EXCEPTION 'Prerequisite seed user vectors missing from database context.';
    END IF;

    -- 1. ITEMS & OFFERS GENERATION (Flat Loop up to precise v_item_count target)
    FOR i IN 1..v_item_count LOOP
        -- Distribute uniformly across all fetched sellers via modulo assignment
        v_seller_idx := ((i - 1) % array_length(v_sellers, 1)) + 1;
        v_seller_id  := v_sellers[v_seller_idx];

        v_hash_genesis := audit.gen_random_bytes(32);

        INSERT INTO core.items (hash_genesis, sn, status, title, creator_id)
        VALUES (
            v_hash_genesis,
            format('SN-I%06s', v_offset+i),
            'CREATED',
            format('Item Absolute Metric #%s', i),
            v_seller_id
        ) RETURNING id, (stamp).created_at INTO v_item_id, v_stamp;

        v_item_hash  := core._item_hash(v_item_id, v_seller_id, format('SN-I%06s', i), format('Item Absolute Metric #%s', i), v_stamp);
        v_chain_hash := sha384(v_hash_genesis || v_item_hash);

        INSERT INTO audit.item_ledger (prev_id, hash, event_type, event_hash, item_id, creator_id)
        VALUES (NULL, v_chain_hash, 'CREATE_ITEM', v_item_hash, v_item_id, v_seller_id)
        RETURNING id INTO v_item_ledger_id;

        UPDATE core.items SET ledger_head = v_item_ledger_id WHERE id = v_item_id;

        v_offer_price := v_base_price + ((i - 1) * v_price_step);

        INSERT INTO data.offers (status, price, description, item_id, creator_id)
        VALUES ('ACTIVE', v_offer_price::money, format('Offer for flat item #%s', i), v_item_id, v_seller_id)
        RETURNING id, (stamp).created_at INTO v_offer_id, v_stamp;

        v_offer_hash := data._offer_hash(v_offer_id, v_item_id, v_seller_id, v_offer_price::money, format('Offer for flat item #%s', i), v_stamp);
        v_prev_hash  := v_chain_hash;
        v_chain_hash := sha384(v_prev_hash || v_offer_hash);

        INSERT INTO audit.item_ledger (prev_id, hash, event_type, event_hash, item_id, creator_id)
        VALUES (v_item_ledger_id, v_chain_hash, 'REGISTER_OFFER', v_offer_hash, v_item_id, v_seller_id)
        RETURNING id INTO v_item_ledger_id;

        UPDATE core.items SET ledger_head = v_item_ledger_id WHERE id = v_item_id;

        -- Store mappings locally for sequential bid calculations inside this transaction
        v_offers       := array_append(v_offers, v_offer_id);
        v_offer_prices := array_append(v_offer_prices, v_offer_price);
    END LOOP;

    -- 2. BIDS GENERATION (Flat Loop up to precise v_bid_count target)
    FOR i IN 1..v_bid_count LOOP
        -- Evenly round-robin distribute incoming bids across existing generated offers
        v_offer_idx   := ((i - 1) % array_length(v_offers, 1)) + 1;
        v_offer_id    := v_offers[v_offer_idx];
        v_offer_price := v_offer_prices[v_offer_idx];

        -- Select a unique buyer sequence per bid to satisfy unique pending constraints
        v_buyer_idx := ((i + v_offer_idx - 2) % array_length(v_buyers, 1)) + 1;
        v_buyer_id  := v_buyers[v_buyer_idx];

        -- Increment price margins structurally based on target metrics
        v_bid_value := (v_offer_price + ((i / v_item_count::numeric) + 1.0))::money;

        INSERT INTO data.bids (offer_id, bidder_id, value, status)
        VALUES (v_offer_id, v_buyer_id, v_bid_value, 'PENDING');
    END LOOP;
END;
$$;


-- ============================================================================
-- SEGMENT 3: Conversations Transaction Block
-- ============================================================================
DO $$
DECLARE
    v_conversation_count int := 100000;

    v_buyers    bigint[];
    v_seller_id bigint;
    v_offer_id  bigint;
    i           int;

    v_subject             text;
    v_contents            text;
    v_question_buyer_id   bigint;
    v_is_answered         boolean;
    v_conversation_bid_id bigint;

    -- Local mapping cache for active offers context inside Segment 3
    v_active_offers record[];
    v_target_offer  record;
    v_offer_idx     int;
BEGIN
    SELECT array_agg(id ORDER BY (substring(login from '^[^-]+-(\d+)$'))::int)
      INTO v_buyers FROM core.users WHERE login LIKE 'buyer-%';

    -- Buffer live offers from data segment straight into a query array
    SELECT array_agg(r) INTO v_active_offers
    FROM (SELECT id, creator_id FROM data.offers ORDER BY id) r;

    IF v_active_offers IS NULL THEN
        RAISE EXCEPTION 'Conversations cannot be linked; matching offer inventory is completely empty.';
    END IF;

    -- Flat Loop running up to precise v_conversation_count configuration bounds
    FOR i IN 1..v_conversation_count LOOP
        v_offer_idx    := ((i - 1) % array_length(v_active_offers, 1)) + 1;
        v_offer_id     := (v_active_offers[v_offer_idx]).id;
        v_seller_id    := (v_active_offers[v_offer_idx]).creator_id;

        v_question_buyer_id := v_buyers[((i + v_offer_idx) % array_length(v_buyers, 1)) + 1];
        v_subject           := format('Question Metric #%s for offer %s', i, v_offer_id);
        v_contents          := format('Absolute execution question context metric value reference #%s', i);

        -- High speed evaluation utilizing our indexed data.bids subset
        SELECT id INTO v_conversation_bid_id
          FROM data.bids
         WHERE offer_id = v_offer_id
           AND bidder_id = v_question_buyer_id
           AND status = 'PENDING'
         LIMIT 1;

        IF v_conversation_bid_id IS NOT NULL THEN
            INSERT INTO data.conversations(subject, contents, commenter_id, offer_id, bid_id)
            VALUES (v_subject, v_contents, v_question_buyer_id, v_offer_id, v_conversation_bid_id);
        ELSE
            INSERT INTO data.conversations(subject, contents, commenter_id, offer_id)
            VALUES (v_subject, v_contents, v_question_buyer_id, v_offer_id);
        END IF;

        -- Structured alternating distribution pattern for seller responses
        v_is_answered := (i % 3 <> 0);
        IF v_is_answered THEN
            v_subject  := format('Answer to question reference #%s for offer %s', i, v_offer_id);
            v_contents := format('System automatic generated processing response confirmation balance structural trace.');

            INSERT INTO data.conversations(subject, contents, commenter_id, offer_id)
            VALUES (v_subject, v_contents, v_seller_id, v_offer_id);
        END IF;
    END LOOP;
END;
$$;
