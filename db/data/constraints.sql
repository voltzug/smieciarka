SET search_path TO data;

-- 1 offer per user-item
ALTER TABLE data.offers
  ADD CONSTRAINT uq_offers_creator_item UNIQUE (creator_id, item_id);

-- offer price must be positive
ALTER TABLE data.offers
  ADD CONSTRAINT chk_offers_price_positive
  CHECK (price > 0::money);


-- 1 bid per user-offer
ALTER TABLE data.bids
  ADD CONSTRAINT uq_bids_bidder_offer UNIQUE (bidder_id, offer_id);
