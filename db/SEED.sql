-- Seed: users, items, offers, bids, conversations

DO $$
DECLARE
    -- ADJUSTABLE CONSTANTS
    v_offset           int     := 0;
    v_seller_count      int     := 99;
    v_buyer_count       int     := 222;
    v_items_per_seller  int     := 5;
    v_bids_per_offer    int     := 3;
    v_base_price        numeric := 100;
    v_price_step        numeric := 9.69;
    v_conversations_per_offer int := 4;

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
BEGIN
    -- sellers
    FOR i IN (v_offset + 1)..(v_seller_count + v_offset) LOOP
        v_login := format('seller-%s', i);
        v_email := format('s-%s@seller.com', i);
        v_name := 'Seller';
        v_surname := format('User-%s', i);

        v_seller_id := core.create_user(v_login, 'pass123', v_name, v_surname, v_email);
        v_sellers := array_append(v_sellers, v_seller_id);
    END LOOP;

    -- buyers
    FOR i IN (v_offset + 1)..(v_buyer_count + v_offset) LOOP
        v_login := format('buyer-%s', i);
        v_email := format('b-%s@buyer.com', i);
        v_name := 'Buyer';
        v_surname := format('User-%s', i);

        v_buyer_id := core.create_user(v_login, 'pass123', v_name, v_surname, v_email);
        v_buyers := array_append(v_buyers, v_buyer_id);
    END LOOP;

    -- items + offers
    FOR i IN (v_offset + 1)..(array_length(v_sellers, 1) + v_offset) LOOP
        v_seller_id := v_sellers[i - v_offset];

        FOR j IN (v_offset + 1)..(v_items_per_seller + v_offset) LOOP
            v_item_id := core.create_item(
                v_seller_id,
                format('SN-S%02s-I%03s', i, j - v_offset),
                format('Item S%02s #%s', i, j - v_offset)
            );

            v_offer_price := v_base_price + ((j - v_offset - 1) * v_price_step);

            v_offer_id := data.register_item_offer(
                v_seller_id,
                v_item_id,
                v_offer_price::money,
                format('Offer for item S%02s #%s', i, j - v_offset)
            );

            v_offers := array_append(v_offers, v_offer_id);
            v_offer_prices := array_append(v_offer_prices, v_offer_price);
        END LOOP;
    END LOOP;

    -- bids
    IF array_length(v_buyers, 1) IS NULL OR array_length(v_offers, 1) IS NULL THEN
        RETURN;
    END IF;

    FOR i IN (v_offset + 1)..(array_length(v_offers, 1) + v_offset) LOOP
        v_offer_id := v_offers[i - v_offset];
        v_offer_price := v_offer_prices[i - v_offset];

        FOR k IN (v_offset + 1)..(v_bids_per_offer + v_offset) LOOP
            v_buyer_idx := ((i + (k - v_offset) - 2) % array_length(v_buyers, 1)) + 1;
            v_buyer_id := v_buyers[v_buyer_idx];

            PERFORM data.place_item_bid(
                v_buyer_id,
                v_offer_id,
                (v_offer_price + ((k - v_offset) * 1))::money
            );
        END LOOP;
    END LOOP;

    -- conversations (questions to offers, every 5th question is asked by a user without a bid, every 3rd question is unanswered)
    FOR i IN (v_offset + 1)..(array_length(v_offers, 1) + v_offset) LOOP
        v_offer_id := v_offers[i - v_offset];
        v_seller_id := NULL;
        -- Find seller for this offer
        SELECT creator_id INTO v_seller_id FROM data.offers WHERE id = v_offer_id;

        FOR k IN 1..v_conversations_per_offer LOOP
            -- Every 5th question is asked by a user without a bid (directly to offer)
            IF (k % 5 = 0) THEN
                v_question_buyer_id := v_buyers[((i + k) % array_length(v_buyers, 1)) + 1];
            ELSE
                -- Otherwise, pick a buyer who has already bid on this offer
                v_question_buyer_id := v_buyers[((i + k) % array_length(v_buyers, 1)) + 1];
            END IF;

            v_subject := format('Question %s for offer %s', k, v_offer_id);
            v_contents := format('This is question %s for offer %s', k, v_offer_id);

            v_conversation_id := data.comment_item_offer(
                v_question_buyer_id,
                v_offer_id,
                v_subject,
                v_contents
            );

            -- Every 3rd question is unanswered by seller, otherwise seller answers
            v_is_answered := (k % 3 <> 0);
            IF v_is_answered THEN
                v_subject := format('Answer to question %s for offer %s', k, v_offer_id);
                v_contents := format('This is the seller answer to question %s for offer %s', k, v_offer_id);
                PERFORM data.comment_item_offer(
                    v_seller_id,
                    v_offer_id,
                    v_subject,
                    v_contents
                );
            END IF;
        END LOOP;
    END LOOP;
END;
$$;
