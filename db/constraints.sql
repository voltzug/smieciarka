  -- CORE --
-- chain init: each node pointed to once
CREATE UNIQUE INDEX uq_IL_genesis_item_id
    ON core.item_ledger (item_id)
    WHERE prev_id IS NULL;

-- standard chain: each node pointed to once
CREATE UNIQUE INDEX uq_IL_standard_prev_id
    ON core.item_ledger (prev_id)
    WHERE prev_id IS NOT NULL;
