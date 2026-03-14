SET search_path TO data;

-- 1 offer per user-item
ALTER TABLE offers
  ADD CONSTRAINT uq_offers_creator_item UNIQUE (creator_id, item_id);

-- 1 bid per user-offer
ALTER TABLE bids
  ADD CONSTRAINT uq_bids_bidder_offer UNIQUE (bidder_id, offer_id);

-- offer price must be positive
ALTER TABLE offers
  ADD CONSTRAINT chk_offers_price_positive
  CHECK (price > 0::money);
