-- Seed: users, items, offers, bids, conversations

-- Disable item_ledger triggers for fast seeding
DROP TRIGGER IF EXISTS trg_protect_item_ledger_update ON audit.item_ledger;
DROP TRIGGER IF EXISTS trg_protect_item_ledger_delete ON audit.item_ledger;
-- If present, also drop insert trigger
DROP TRIGGER IF EXISTS trg_protect_item_ledger_insert ON audit.item_ledger;

DO $$
DECLARE
    -- ADJUSTABLE CONSTANTS
    v_offset           int     := 0;
    v_seller_count      int     := 211211;
    v_buyer_count       int     := 433433;
    v_items_per_seller  int     := 9;
    v_bids_per_offer    int     := 3;
    v_base_price        numeric := 100;
    v_price_step        numeric := 9.69;
    v_conversations_per_offer int := 2;

    v_sellers      bigint[] := ARRAY[]::bigint[];
    v_buyers       bigint[] := ARRAY[]::bigint[];
    v_offers       bigint[] := ARRAY[]::bigint[];
    v_offer_prices numeric[] := ARRAY[]::numeric[];

    v_seller_id   bigint;
    v_buyer_id    bigint;
    v_item_id     bigint;
    v_offer_id    bigint;
    v_offer_price numeric;
    v_login       text;
    v_email       text;
    v_name        text;
    v_surname     text;
    i int;
    j int;
    k int;
    v_buyer_idx int;
    v_conversation_id bigint;
    v_subject text;
    v_contents text;
    v_question_buyer_id bigint;
    v_answer_seller_id bigint;
    v_is_answered boolean;
    v_hash_genesis bytea;
    v_stamp timestamptz;
    v_item_hash bytea;
    v_offer_hash bytea;
    v_bid_id bigint;
    v_bid_hash bytea;
    v_bid_stamp timestamptz;
    v_ledger_id bigint;
    v_prev_ledger_id bigint;
    v_event_hash bytea;
    v_prev_hash bytea;
    v_chain_hash bytea;
    v_existing_offer_id bigint;
    v_existing_offer_status text;
    v_bidder_id bigint;
    v_bid_value money;
    v_offer_status text;
    v_item_ledger_id bigint;
    v_item_ledger_head bigint;
    v_conversation_bid_id bigint;
BEGIN
    -- USERS (sellers)
    FOR i IN (v_offset + 1)..(v_seller_count + v_offset) LOOP
        v_login := format('seller-%s', i);
        v_email := format('s-%s@seller.com', i);
        v_name := 'Seller';
        v_surname := format('User-%s', i);
        INSERT INTO core.users (login, password, status, data_hash)
        VALUES (v_login, 'pass123', 'ACTIVE', core._user_data_hash(v_login, v_email))
        RETURNING id INTO v_seller_id;
        INSERT INTO data.user_details(user_id, name, surname, email)
        VALUES (v_seller_id, v_name, v_surname, v_email);
        v_sellers := array_append(v_sellers, v_seller_id);
    END LOOP;

    -- USERS (buyers)
    FOR i IN (v_offset + 1)..(v_buyer_count + v_offset) LOOP
        v_login := format('buyer-%s', i);
        v_email := format('b-%s@buyer.com', i);
        v_name := 'Buyer';
        v_surname := format('User-%s', i);
        INSERT INTO core.users (login, password, status, data_hash)
        VALUES (v_login, 'pass123', 'ACTIVE', core._user_data_hash(v_login, v_email))
        RETURNING id INTO v_buyer_id;
        INSERT INTO data.user_details(user_id, name, surname, email)
        VALUES (v_buyer_id, v_name, v_surname, v_email);
        v_buyers := array_append(v_buyers, v_buyer_id);
    END LOOP;

    -- ITEMS + OFFERS (direct insert, with item_ledger chain)
    FOR i IN (v_offset + 1)..(array_length(v_sellers, 1) + v_offset) LOOP
        v_seller_id := v_sellers[i - v_offset];
        FOR j IN (v_offset + 1)..(v_items_per_seller + v_offset) LOOP
            v_hash_genesis := audit.gen_random_bytes(32);
            INSERT INTO core.items (hash_genesis, sn, status, title, creator_id)
            VALUES (
                v_hash_genesis,
                format('SN-S%02s-I%03s', i, j - v_offset),
                'CREATED',
                format('Item S%02s #%s', i, j - v_offset),
                v_seller_id
            ) RETURNING id, (stamp).created_at INTO v_item_id, v_stamp;
            v_item_hash := core._item_hash(v_item_id, v_seller_id, format('SN-S%02s-I%03s', i, j - v_offset), format('Item S%02s #%s', i, j - v_offset), v_stamp);
            v_chain_hash := sha384(v_hash_genesis || v_item_hash);
            INSERT INTO audit.item_ledger (prev_id, hash, event_type, event_hash, item_id, creator_id)
            VALUES (NULL, v_chain_hash, 'CREATE_ITEM', v_item_hash, v_item_id, v_seller_id)
            RETURNING id INTO v_item_ledger_id;
            UPDATE core.items SET ledger_head = v_item_ledger_id WHERE id = v_item_id;

            v_offer_price := v_base_price + ((j - v_offset - 1) * v_price_step);
            INSERT INTO data.offers (status, price, description, item_id, creator_id)
            VALUES ('ACTIVE', v_offer_price::money, format('Offer for item S%02s #%s', i, j - v_offset), v_item_id, v_seller_id)
            RETURNING id, (stamp).created_at INTO v_offer_id, v_stamp;
            v_offer_hash := data._offer_hash(v_offer_id, v_item_id, v_seller_id, v_offer_price::money, format('Offer for item S%02s #%s', i, j - v_offset), v_stamp);
            v_prev_hash := v_chain_hash;
            v_chain_hash := sha384(v_prev_hash || v_offer_hash);
            INSERT INTO audit.item_ledger (prev_id, hash, event_type, event_hash, item_id, creator_id)
            VALUES (v_item_ledger_id, v_chain_hash, 'REGISTER_OFFER', v_offer_hash, v_item_id, v_seller_id)
            RETURNING id INTO v_item_ledger_id;
            UPDATE core.items SET ledger_head = v_item_ledger_id WHERE id = v_item_id;

            v_offers := array_append(v_offers, v_offer_id);
            v_offer_prices := array_append(v_offer_prices, v_offer_price);
        END LOOP;
    END LOOP;

    -- BIDS (direct insert)
    IF array_length(v_buyers, 1) IS NULL OR array_length(v_offers, 1) IS NULL THEN
        RETURN;
    END IF;
    FOR i IN (v_offset + 1)..(array_length(v_offers, 1) + v_offset) LOOP
        v_offer_id := v_offers[i - v_offset];
        v_offer_price := v_offer_prices[i - v_offset];
        SELECT item_id, creator_id, status INTO v_item_id, v_seller_id, v_offer_status FROM data.offers WHERE id = v_offer_id;
        FOR k IN (v_offset + 1)..(v_bids_per_offer + v_offset) LOOP
            v_buyer_idx := ((i + (k - v_offset) - 2) % array_length(v_buyers, 1)) + 1;
            v_buyer_id := v_buyers[v_buyer_idx];
            v_bid_value := (v_offer_price + ((k - v_offset) * 1))::money;
            INSERT INTO data.bids (offer_id, bidder_id, value, status)
            VALUES (v_offer_id, v_buyer_id, v_bid_value, 'PENDING')
            RETURNING id, created_at INTO v_bid_id, v_bid_stamp;
        END LOOP;
    END LOOP;

    -- CONVERSATIONS (direct insert, attach bid_id if present)
    FOR i IN (v_offset + 1)..(array_length(v_offers, 1) + v_offset) LOOP
        v_offer_id := v_offers[i - v_offset];
        SELECT creator_id INTO v_seller_id FROM data.offers WHERE id = v_offer_id;
        FOR k IN 1..v_conversations_per_offer LOOP
            IF (k % 5 = 0) THEN
                v_question_buyer_id := v_buyers[((i + k) % array_length(v_buyers, 1)) + 1];
            ELSE
                v_question_buyer_id := v_buyers[((i + k) % array_length(v_buyers, 1)) + 1];
            END IF;
            v_subject := format('Question %s for offer %s', k, v_offer_id);
            v_contents := format('This is question %s for offer %s', k, v_offer_id);
            SELECT id INTO v_conversation_bid_id FROM data.bids WHERE offer_id = v_offer_id AND bidder_id = v_question_buyer_id AND status = 'PENDING' LIMIT 1;
            IF v_conversation_bid_id IS NOT NULL THEN
                INSERT INTO data.conversations(subject, contents, commenter_id, offer_id, bid_id)
                VALUES (v_subject, v_contents, v_question_buyer_id, v_offer_id, v_conversation_bid_id)
                RETURNING id INTO v_conversation_id;
            ELSE
                INSERT INTO data.conversations(subject, contents, commenter_id, offer_id)
                VALUES (v_subject, v_contents, v_question_buyer_id, v_offer_id)
                RETURNING id INTO v_conversation_id;
            END IF;
            v_is_answered := (k % 3 <> 0);
            IF v_is_answered THEN
                v_subject := format('Answer to question %s for offer %s', k, v_offer_id);
                v_contents := format('This is the seller answer to question %s for offer %s', k, v_offer_id);
                INSERT INTO data.conversations(subject, contents, commenter_id, offer_id)
                VALUES (v_subject, v_contents, v_seller_id, v_offer_id);
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- Re-enable item_ledger triggers after seeding
CREATE TRIGGER trg_protect_item_ledger_update
    BEFORE UPDATE ON audit.item_ledger
    FOR EACH ROW
    EXECUTE FUNCTION audit.protect_item_ledger_no_update_delete();
CREATE TRIGGER trg_protect_item_ledger_delete
    BEFORE DELETE ON audit.item_ledger
    FOR EACH ROW
    EXECUTE FUNCTION audit.protect_item_ledger_no_update_delete();
-- CREATE TRIGGER trg_protect_item_ledger_insert
--     BEFORE INSERT ON audit.item_ledger
--     FOR EACH ROW
--     EXECUTE FUNCTION audit.protect_item_ledger_insert();
