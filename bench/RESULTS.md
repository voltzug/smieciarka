## Before idx

```ts
const stages = [
  // Step 1
  { duration: "20s", target: 50 },
  { duration: "40s", target: 55 },
  // Step 2
  { duration: "10s", target: 100 },
  { duration: "40s", target: 110 },
  // Ramp Down
  { duration: "10s", target: 0 },
];
```


### Command 1: The Massive Marketplace Scan
#### The Target
```SQL
SELECT id, status FROM data.offers WHERE item_id = $1
```

#### The Diagnostic Commands

```SQL
-- theoretical execution logic
EXPLAIN 
SELECT id, status FROM data.offers WHERE item_id = 12345;
-- actual processing time and memory buffers
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, status FROM data.offers WHERE item_id = 12345;
```

```
"Gather  (cost=1000.00..11140.51 rows=1 width=12)"
"  Workers Planned: 2"
"  ->  Parallel Seq Scan on offers  (cost=0.00..10140.41 rows=1 width=12)"
"        Filter: (item_id = 12345)"
```

#### Why?
Without an index, PostgreSQL must execute a `Parallel Seq Scan`. This is the most frequently called command during offer lookup and even related offer-bid lookup. The query engine must read a significant portion of the `offers` table from storage into RAM memory to apply the `Filter: (item_id = 12345)`. This is an inefficient process, as it must examine many rows that do not match the filter.

#### Fix
```SQL
CREATE INDEX idx_offers_item_id ON data.offers (item_id);
```

This replaces an O(N) full table scan with an O(logN) balanced-tree binary lookup. Instead of scanning a large portion of the table, the query engine can use the index to directly locate the relevant rows, dramatically reducing the cost and improving execution times.


### Command 2: The Deep Ledger Verification Row Lock
#### The Target
```SQL
SELECT $3 FROM item_ledger WHERE item_id = p_item_id FOR UPDATE
```

#### The Diagnostic Commands

```SQL
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 1 FROM audit.item_ledger WHERE item_id = 5555 FOR UPDATE;
```

```
"LockRows  (cost=0.00..36366.57 rows=2 width=10) (actual time=7.267..566.934 rows=2 loops=1)"
"  Buffers: shared hit=5 read=23274 dirtied=2271 written=2238"
"  ->  Seq Scan on item_ledger  (cost=0.00..36366.55 rows=2 width=10) (actual time=7.213..566.875 rows=2 loops=1)"
"        Filter: (item_id = 5555)"
"        Rows Removed by Filter: 998969"
"        Buffers: shared hit=1 read=23274 dirtied=2270 written=2238"
"Planning:"
"  Buffers: shared hit=6 dirtied=2"
"Planning Time: 0.152 ms"
"Execution Time: 566.967 ms"
```

#### Why?
The `FOR UPDATE` clause requires PostgreSQL to lock the rows that match the `WHERE` condition. Without an index on `item_id`, the database must perform a sequential scan of the `item_ledger` table to find all relevant rows. This scan is inefficient, especially on large, append-only tables, and holding these locks for extended periods can block other operations and lead to performance bottlenecks.

#### Fix
```SQL
CREATE INDEX idx_item_ledger_item_id ON audit.item_ledger (item_id);
```

By creating an index on `item_id`, PostgreSQL can efficiently locate the specific ledger entries for a given item. This allows it to apply the `FOR UPDATE` lock only to the necessary rows, rather than scanning the entire table. This significantly speeds up the locking process and reduces contention, allowing other transactions to proceed without delay.

---

## Out of scope
### Command 3: Enhancing Marketplace Offer Filtering
#### The Target
```SQL
SELECT * FROM data.offers WHERE status IN ('ACTIVE', 'RESERVED') AND item_id = $1
```

#### Why?
This query is designed to quickly retrieve active or reserved offers for a specific item. Without an appropriate index, PostgreSQL would have to scan a potentially large portion of the `offers` table and then filter by `status` and `item_id`. This can be inefficient, especially if the table contains many historical or closed offers.

#### Fix
```SQL
CREATE INDEX  idx_offers_active_reserved_items
  ON data.offers (item_id)
  WHERE status IN ('ACTIVE', 'RESERVED');
```

This partial index focuses specifically on the `item_id` for offers that are currently `ACTIVE` or `RESERVED`. By including the `WHERE` clause, the index is smaller and more efficient, as it only stores entries for the most frequently queried offer states. This allows PostgreSQL to perform a much faster lookup for these specific offers, significantly reducing query times and I/O operations.


### Command 4: Optimizing Bid History Lookups
#### The Target
```SQL
SELECT * FROM data.bids WHERE offer_id = $1 AND status = 'PENDING' ORDER BY value DESC
```

#### Why?
When retrieving pending bids for a given offer, users often want to see the highest value bids first. A simple `SELECT` with a `WHERE` clause and `ORDER BY` on an unindexed table requires a full scan to find all pending bids, followed by a sort operation in memory. This can be resource-intensive and slow, especially for offers with many bids.

#### Fix
```SQL
CREATE INDEX  idx_bids_active_lookup
  ON data.bids (offer_id, value DESC)
  WHERE status = 'PENDING';
```

This partial index is tailored for looking up pending bids for a specific offer, and it pre-sorts them by `value` in descending order. This means that when the query engine uses this index, it can retrieve the bids for a given `offer_id` that are `PENDING` directly in the desired `value DESC` order without needing an additional sort step. This dramatically speeds up the retrieval of the latest or highest bids for an offer.

### Command 5: Streamlining Item Creator Lookups
#### The Target
```SQL
SELECT * FROM core.items WHERE creator_id = $1
```

#### Why?
Retrieving all items created by a specific user is a common operation. Without an index on `creator_id`, the database must perform a full table scan of the `core.items` table to find all items associated with that creator. On a large table of items, this sequential scan can be very slow and consume significant I/O resources.

#### Fix
```SQL
CREATE INDEX  idx_items_creator_id ON core.items (creator_id);
```

By adding an index on `creator_id`, PostgreSQL can directly locate all items belonging to a particular creator. This transforms an inefficient full table scan into a rapid index lookup, significantly reducing the time and resources required to fetch a creator's items.

### Command 6: Efficient Case-Insensitive User Login Search
#### The Target
```SQL
SELECT * FROM core.users WHERE lower(login) LIKE 'john%';
```

#### Why?
Many applications require case-insensitive searches for usernames or logins. Directly applying `lower()` to a column in a `WHERE` clause without an appropriate index prevents PostgreSQL from using a standard index on the `login` column. This forces a full table scan, applying the `lower()` function to every `login` value before comparison, which is very inefficient.

#### Fix
```SQL
CREATE INDEX idx_users_login_lower ON core.users (lower(login) varchar_pattern_ops);
```

This functional index pre-computes and stores the `lower()` version of the `login` column, enabling efficient case-insensitive searches. The `varchar_pattern_ops` operator class is specifically chosen to optimize `LIKE 'prefix%'` queries. This allows PostgreSQL to use a fast index scan instead of a full table scan when performing case-insensitive prefix matching on user logins, greatly improving search performance.
