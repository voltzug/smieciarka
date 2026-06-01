SET search_path TO data;


CREATE INDEX IF NOT EXISTS idx_offers_active_reserved_items
  ON data.offers (item_id)
  WHERE status IN ('ACTIVE', 'RESERVED');
