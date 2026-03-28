SET search_path TO data;

-- bid value >= related offer price
CREATE OR REPLACE FUNCTION data.validate_bid_value_ge_offer_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = data, pg_temp
AS $$
DECLARE
    v_offer_price money;
BEGIN
    SELECT o.price
      INTO v_offer_price
      FROM data.offers o
     WHERE o.id = NEW.offer_id;

    IF v_offer_price IS NULL THEN
        RAISE EXCEPTION
            'Bid validation failed: offer_id % does not exist',
            NEW.offer_id;
    END IF;

    IF NEW.value < v_offer_price THEN
        RAISE EXCEPTION
            'Bid validation failed: bid value % is lower than offer price % for offer_id %',
            NEW.value, v_offer_price, NEW.offer_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_bid_value_ge_offer_price
BEFORE INSERT OR UPDATE OF value, offer_id
ON data.bids
FOR EACH ROW
EXECUTE FUNCTION data.validate_bid_value_ge_offer_price();
