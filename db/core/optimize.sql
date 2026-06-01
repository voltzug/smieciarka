SET search_path TO core;


CREATE INDEX IF NOT EXISTS idx_items_creator_id ON core.items (creator_id);
