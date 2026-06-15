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
cd ci
cp .env.example .env
# fill in POSTGRES_USER, POSTGRES_PASSWORD, BENCH_PASSWORD
```

### 2. Start DB (pre-baked volume)

```bash
podman-compose up -d db
```

Connect to pgAdmin at `http://localhost:5050` and verify data is present (~100k users, ~400k items).

Apply the updated `db/USERS.sql` via pgAdmin query tool to ensure `app_test` has the correct connection limit and DML grants.

### 3. Reset pg_stat_statements before bench

Run in pgAdmin (or psql):

```sql
SELECT pg_stat_statements_reset();
```

### 4. Run benchmark

```bash
# all 4 scenarios in parallel (default)
podman-compose --profile bench run --rm k6

# single scenario
K6_SCENARIO=s03_bid_flow podman-compose --profile bench run --rm k6
```

Results are written to `bench/results.json`.

### 5. Plot results

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
