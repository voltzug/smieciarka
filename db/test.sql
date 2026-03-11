  -- CORE --
-- 1) Create two users
DO $$
DECLARE
  v_u1 bigint;
  v_u2 bigint;
BEGIN
  v_u1 := core.create_user('alice', 'password123', 'Alice', 'Smith', 'alice@example.com');
  RAISE NOTICE 'Created user alice -> id=%', v_u1;

  v_u2 := core.create_user('bob', 'hunter2', 'Bob', 'Jones', 'bob@example.com');
  RAISE NOTICE 'Created user bob -> id=%', v_u2;
END;
$$;

-- 2) Create an item by alice (with description)
DO $$
DECLARE
  v_item1 bigint;
BEGIN
  v_item1 := core.create_item('SN-0001', 'Test Item 1', (SELECT id FROM core.users WHERE login='alice' LIMIT 1), 'An item created for testing.');
  RAISE NOTICE 'Created item -> id=%', v_item1;
END;
$$;

-- 3) Inspect item and its genesis ledger row
-- \echo '--- Item rows ---'
SELECT id, sn, title, creator_id, created_at, encode(hash_genesis,'hex') AS genesis_hex
FROM core.items
ORDER BY id;

-- \echo '--- Item ledger rows (after create_item) ---'
SELECT id, prev_id, item_id, event_type, creator_id, created_at,
        encode(hash,'hex') AS chain_hash_hex,
        encode(event_hash,'hex') AS event_hash_hex
FROM core.item_ledger
ORDER BY item_id, id;

-- 4) Append a couple of events to the item's chain
DO $$
DECLARE
  v_item_id bigint := (SELECT id FROM core.items WHERE sn='SN-0001' LIMIT 1);
  v_alice bigint := (SELECT id FROM core.users WHERE login='alice' LIMIT 1);
  v_bob bigint := (SELECT id FROM core.users WHERE login='bob' LIMIT 1);
  v_lid1 bigint;
  v_lid2 bigint;
BEGIN
  v_lid1 := core.append_item_event(v_item_id, 'TRANSFER', v_bob);
  RAISE NOTICE 'Appended TRANSFER by bob -> ledger id=%', v_lid1;

  v_lid2 := core.append_item_event(v_item_id, 'UPDATE', v_alice);
  RAISE NOTICE 'Appended UPDATE by alice -> ledger id=%', v_lid2;
END;
$$;

-- \echo '--- Item ledger rows (after appends) ---'
SELECT id, prev_id, item_id, event_type, creator_id, created_at,
        encode(hash,'hex') AS chain_hash_hex,
        encode(event_hash,'hex') AS event_hash_hex
FROM core.item_ledger
ORDER BY item_id, id;

-- 5) Attempt manual (forged) insert with wrong hash for chaining => should be rejected
DO $$
DECLARE
  v_item_id bigint := (SELECT id FROM core.items WHERE sn='SN-0001' LIMIT 1);
  v_tip_id bigint;
BEGIN
  SELECT id INTO v_tip_id
  FROM core.item_ledger il
  WHERE il.item_id = v_item_id
    AND NOT EXISTS (SELECT 1 FROM core.item_ledger il2 WHERE il2.prev_id = il.id)
  ORDER BY id DESC
  LIMIT 1;

  -- Try to insert a row with incorrect hash (random bytes) to simulate forgery.
  BEGIN
    INSERT INTO core.item_ledger (prev_id, hash, event_type, event_hash, creator_id, item_id)
    VALUES (v_tip_id, gen_random_bytes(32), 'FORGE', gen_random_bytes(32), (SELECT id FROM core.users WHERE login='bob'), v_item_id);
    RAISE NOTICE 'ERROR: forged insert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Expected failure on forged insert: %', SQLERRM;
  END;
END;
$$;

-- 6) Create a second item, then attempt to chain it to the first item's tip (cross-item prev_id) => should be rejected
DO $$
DECLARE
  v_item1 bigint := (SELECT id FROM core.items WHERE sn='SN-0001' LIMIT 1);
  v_item2 bigint;
  v_tip1 bigint;
BEGIN
  v_item2 := core.create_item('SN-0002', 'Item Two', (SELECT id FROM core.users WHERE login='alice' LIMIT 1), NULL);
  RAISE NOTICE 'Created second item -> id=%', v_item2;

  SELECT id INTO v_tip1
  FROM core.item_ledger il
  WHERE il.item_id = v_item1
    AND NOT EXISTS (SELECT 1 FROM core.item_ledger il2 WHERE il2.prev_id = il.id)
  LIMIT 1;

  BEGIN
    -- Attempt to insert a ledger row for item2 but referencing tip1 as prev_id
    INSERT INTO core.item_ledger (prev_id, hash, event_type, event_hash, creator_id, item_id)
    VALUES (v_tip1,
            gen_random_bytes(32), -- wrong hash on purpose
            'TRANSFER',
            gen_random_bytes(32),
            (SELECT id FROM core.users WHERE login='bob'),
            v_item2);
    RAISE NOTICE 'ERROR: cross-item insert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Expected failure on cross-item prev_id insert: %', SQLERRM;
  END;
END;
$$;

-- 7) Attempt to insert a second genesis row for item1 (prev_id IS NULL) => unique index / trigger should reject
DO $$
DECLARE
  v_item1 bigint := (SELECT id FROM core.items WHERE sn='SN-0001' LIMIT 1);
BEGIN
  BEGIN
    INSERT INTO core.item_ledger (prev_id, hash, event_type, event_hash, creator_id, item_id)
    VALUES (NULL, gen_random_bytes(32), 'CREATED', gen_random_bytes(32), (SELECT id FROM core.users WHERE login='alice'), v_item1);
    RAISE NOTICE 'ERROR: duplicate genesis insert unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Expected failure on duplicate genesis insert: %', SQLERRM;
  END;
END;
$$;

-- 8) Attempt UPDATE on a ledger row => should be rejected
DO $$
DECLARE
  v_lid bigint := (SELECT id FROM core.item_ledger ORDER BY id LIMIT 1);
BEGIN
  BEGIN
    UPDATE core.item_ledger SET hash = gen_random_bytes(32) WHERE id = v_lid;
    RAISE NOTICE 'ERROR: UPDATE of ledger unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Expected failure on UPDATE: %', SQLERRM;
  END;
END;
$$;

-- 9) Attempt DELETE on a ledger row => should be rejected
DO $$
DECLARE
  v_lid bigint := (SELECT id FROM core.item_ledger ORDER BY id LIMIT 1);
BEGIN
  BEGIN
    DELETE FROM core.item_ledger WHERE id = v_lid;
    RAISE NOTICE 'ERROR: DELETE of ledger unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Expected failure on DELETE: %', SQLERRM;
  END;
END;
$$;

-- 10) Final state of items and ledger
-- \echo '--- FINAL items ---'
SELECT id, sn, title, creator_id, created_at, encode(hash_genesis, 'hex') AS genesis_hex
FROM core.items
ORDER BY id;

-- \echo '--- FINAL item_ledger ---'
SELECT id, prev_id, core.item_ledger.item_id, event_type, creator_id, created_at,
        encode(hash,'hex') AS chain_hash_hex,
        encode(event_hash,'hex') AS event_hash_hex
FROM core.item_ledger
ORDER BY item_id, id;
