# Benchmark

Stress-test Postgres under increasing concurrency until it degrades or fails to serve requests. Measures raw DB throughput using explicit multi-statement TypeScript transactions (no stored-procedure overhead) via Grafana k6 + xk6-sql-driver-postgres.

## Strategy

- **Breakpoint test**: VU count ramps from 5 → 500 over ~12 minutes to find the degradation knee
- **4 parallel scenarios** cover all write and read paths:
  | Scenario | Operations |
  |---|---|
  | `user_flow`   | login lookup + update user details |
  | `item_flow`   | create item + change title + register offer |
  | `bid_flow`    | place bid + comment + cancel/win bid + cancel offer |
  | `select_flow` | search users, items, offers, bids, conversations |
- **pg_stat_statements** captures per-query CPU/IO time for post-run analysis
- **Python3 plot** visualises the degradation curve from k6 JSON output

Transaction logic lives in `bench/logic/` (TypeScript, executed directly against Postgres). Hash helpers and audit chain functions remain in the DB and are called via SQL.

---

## Prerequisites

- `podman` + `podman-compose`
- Python 3.10+ with `pip install matplotlib pandas`

---

## Step-by-step

### 1. Configure environment

```bash
cp .env.example .env
# fill in POSTGRES_USER, POSTGRES_PASSWORD, BENCH_PASSWORD
```

### 2. Start DB & seed

```bash
podman-compose up -d db
```

Connect to pgAdmin at `http://localhost:5050` and verify data is present by running these count queries:

```sql
SELECT 'core.users'         AS table, COUNT(*) FROM core.users
UNION ALL
SELECT 'core.items',                  COUNT(*) FROM core.items
UNION ALL
SELECT 'data.user_details',           COUNT(*) FROM data.user_details
UNION ALL
SELECT 'data.offers',                 COUNT(*) FROM data.offers
UNION ALL
SELECT 'data.bids',                   COUNT(*) FROM data.bids
UNION ALL
SELECT 'data.conversations',          COUNT(*) FROM data.conversations
UNION ALL
SELECT 'audit.item_ledger',           COUNT(*) FROM audit.item_ledger;
```

Expected baseline: ~100k users, ~400k items, matching rows in user_details, offers, bids, conversations, and one ledger entry per item event.

Apply the updated `db/USERS.sql` via pgAdmin query tool to ensure `app_test` has the correct connection limit and DML grants.

### 3. Reset pg_stat_statements before bench

Run in pgAdmin (or psql):

```sql
SELECT pg_stat_statements_reset();
```

### 4. Build k6 image (first time only)

```bash
podman-compose -f compose.bench.yml build
```

### 5. Run benchmark

```bash
podman-compose -f compose.bench.yml run --rm k6
```

Results are written to `bench/results.json`.

### 6. Plot results

```bash
python3 bench/plot.py bench/results.json
# optional: filter to one scenario
python3 bench/plot.py bench/results.json --scenario bid_flow
```

Outputs:
- `bench/results_plot.png` — 4-panel figure
- `bench/results.meta.json` — run metadata (created on first plot)

---

## pg_stat analysis

Run after the benchmark to identify bottleneck queries:

```sql
SELECT
    query,
    calls,
    round(total_exec_time::numeric, 2)  AS total_ms,
    round(mean_exec_time::numeric, 2)   AS mean_ms,
    round(stddev_exec_time::numeric, 2) AS stddev_ms,
    rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

Cross-reference with the plot: queries that spike in `mean_ms` at the same VU count where p95 latency climbs are the bottlenecks.

---

## Reading results

| Signal | Meaning |
|---|---|
| p95 latency > 2 s | DB struggling to keep up |
| Error rate > 1 % | Connection exhaustion or lock contention |
| `iterations` rate plateaus | DB at saturation point |

The VU count just before the knee in p95 latency is the practical concurrency limit of the DB at the given hardware constraint (2 CPU / 4 GB RAM).
