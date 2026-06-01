from __future__ import annotations

import argparse
import asyncio
import os
import random

from tests import offers_scenario
from tests.audit import chain as audit_chain
from tests.core import items as core_items
from tests.data import workload as data_workload
from util import Metrics, TestContext

from db import DbConfig, close_db, init_db


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Async benchmark test runner")
    parser.add_argument(
        "--suite",
        choices=["core", "data", "audit", "scenario", "all"],
        default="all",
    )
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--clients", type=int, default=1)
    parser.add_argument("--scale", type=int, default=1)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--report-dir", type=str, default="reports")

    parser.add_argument("--pool-min", type=int, default=1)
    parser.add_argument("--pool-max", type=int, default=10)
    parser.add_argument("--sa-pool-size", type=int, default=5)
    parser.add_argument("--sa-max-overflow", type=int, default=5)
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()

    config = DbConfig(
        host=_required_env("PGHOST"),
        port=int(_required_env("PGPORT")),
        database=_required_env("PGDATABASE"),
        user=_required_env("PGUSER"),
        password=_required_env("PGPASSWORD"),
        pool_min_size=args.pool_min,
        pool_max_size=args.pool_max,
        sa_pool_size=args.sa_pool_size,
        sa_max_overflow=args.sa_max_overflow,
    )

    db = await init_db(config)
    metrics = Metrics(args.report_dir)

    suite_map = {
        "core": core_items,
        "data": data_workload,
        "audit": audit_chain,
        "scenario": offers_scenario,
    }

    if args.suite == "all":
        suites = [core_items, data_workload, audit_chain, offers_scenario]
    else:
        suites = [suite_map[args.suite]]

    async def worker(client_id: int) -> None:
        seed = args.seed + client_id if args.seed is not None else None
        rng = random.Random(seed)
        ctx = TestContext(db=db, scale=args.scale, client_id=client_id, rng=rng)
        async with db.sessionmaker() as session:
            for suite in suites:
                await suite.test(args.iterations, ctx, metrics, session)

    try:
        await asyncio.gather(*(worker(i) for i in range(args.clients)))
    finally:
        await metrics.close()
        await close_db(db)


if __name__ == "__main__":
    asyncio.run(main())
