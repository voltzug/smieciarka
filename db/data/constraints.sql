SET search_path TO data;

-- 1 offer per user-item
ALTER TABLE data.offers
  ADD CONSTRAINT uq_offers_creator_item UNIQUE (creator_id, item_id);

-- offer price must be positive
ALTER TABLE data.offers
  ADD CONSTRAINT chk_offers_price_positive
  CHECK (price > 0::money);


-- 1 PENDING bid per user-offer
CREATE UNIQUE INDEX uq_bids_bidder_offer_pending
  ON data.bids (bidder_id, offer_id)
  WHERE status = 'PENDING';
