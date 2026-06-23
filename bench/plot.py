#!/usr/bin/env python3
"""
Usage:
  python3 plot.py results.json [--scenario <name>|all]

Reads k6 NDJSON output, saves results.meta.json alongside, produces results_plot.png.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

try:
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    import pandas as pd
except ImportError:
    sys.exit("pip install matplotlib pandas")


def load_metrics(path: str) -> list[dict]:
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def save_meta(results_path: str, rows: list[dict]) -> None:
    meta_path = results_path.replace(".json", ".meta.json")
    if os.path.exists(meta_path):
        return

    scenarios = sorted({
        r["data"]["tags"].get("scenario") or "default"
        for r in rows
        if r.get("type") == "Point" and r.get("data", {}).get("tags") is not None
    })

    meta = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "source_file": os.path.basename(results_path),
        "scenarios": scenarios,
    }
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Saved {meta_path}")


def build_df(rows: list[dict], metric: str, scenario_filter: str | None) -> pd.DataFrame:
    points = []
    for r in rows:
        if r.get("type") != "Point" or r.get("metric") != metric:
            continue

        tags = r.get("data", {}).get("tags") or {}
        sc = tags.get("scenario") or "default"

        if scenario_filter and scenario_filter != "all" and sc != scenario_filter:
            continue

        points.append({
            "ts": pd.to_datetime(r["data"]["time"]),
            "value": r["data"]["value"],
            "scenario": sc,
        })

    if not points:
        return pd.DataFrame(columns=["ts", "value", "scenario"])

    df = pd.DataFrame(points)
    df.sort_values("ts", inplace=True)
    return df


def resample_percentile(df: pd.DataFrame, rule: str, q: float) -> pd.Series:
    df = df.set_index("ts")
    return df["value"].resample(rule).quantile(q)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("results", help="Path to k6 results.json")
    ap.add_argument("--scenario", default="all",
                    help="Filter to a scenario name, or 'all' (default)")
    args = ap.parse_args()

    rows = load_metrics(args.results)
    if not rows:
        sys.exit("No data found in results file")

    save_meta(args.results, rows)

    sc_filter = None if args.scenario == "all" else args.scenario
    out_path  = args.results.replace(".json", "_plot.png")

    fig, axes = plt.subplots(4, 1, figsize=(14, 20), sharex=True)
    fig.suptitle(f"k6 Benchmark — {os.path.basename(args.results)}", fontsize=14, fontweight='bold')

    # Normalize scenarios collection
    scenarios = sorted({
        r["data"]["tags"].get("scenario") or "default"
        for r in rows
        if r.get("type") == "Point" and r.get("data", {}).get("tags") is not None
    })
    if sc_filter and sc_filter != "all":
        scenarios = [sc_filter] if sc_filter in scenarios else []

    colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]
    sc_color = {s: colors[i % len(colors)] for i, s in enumerate(scenarios)}

    # Panel 1: VU count
    ax = axes[0]
    ax.set_title("Virtual Users", fontweight='bold')
    ax.set_ylabel("VUs")
    has_plots = False
    for sc in scenarios:
        df = build_df(rows, "vus", sc)
        if df.empty:
            continue
        df_r = df.set_index("ts")["value"].resample("5s").last().dropna()
        ax.plot(df_r.index, df_r.values, label=sc, color=sc_color[sc])
        has_plots = True
    if has_plots:
        ax.legend(fontsize=8)
    else:
        ax.text(0.5, 0.5, "No 'vus' metrics present", ha="center", va="center", transform=ax.transAxes, color="gray")


    # Panel 2: iteration rate
    ax = axes[1]
    ax.set_title("Iteration Rate", fontweight='bold')
    ax.set_ylabel("iter/s")
    has_plots = False
    for sc in scenarios:
        df = build_df(rows, "iterations", sc)
        if df.empty:
            continue
        df_r = df.set_index("ts")["value"].resample("5s").sum().dropna()
        rate  = df_r / 5.0
        ax.plot(rate.index, rate.values, label=sc, color=sc_color[sc])
        has_plots = True
    if has_plots:
        ax.legend(fontsize=8)
    else:
        ax.text(0.5, 0.5, "No 'iterations' metrics present", ha="center", va="center", transform=ax.transAxes, color="gray")

    # Panel 3: latency percentiles (iteration_duration in ms)
    ax = axes[2]
    ax.set_title("Iteration Duration Percentiles", fontweight='bold')
    ax.set_ylabel("ms")
    has_plots = False
    for sc in scenarios:
        df = build_df(rows, "iteration_duration", sc)
        if df.empty:
            continue
        for q, ls in [(0.50, "-"), (0.95, "--"), (0.99, ":")]:
            s = resample_percentile(df, "5s", q).dropna()
            if not s.empty:
                ax.plot(s.index, s.values, ls, color=sc_color[sc],
                        label=f"{sc} p{int(q*100)}" if q == 0.95 else "_nolegend_")
                has_plots = True
    if has_plots:
        ax.legend(fontsize=8)
    else:
        ax.text(0.5, 0.5, "No 'iteration_duration' metrics present", ha="center", va="center", transform=ax.transAxes, color="gray")

    # Panel : Infrastructure & System Failure Track (SLO Violations)
    ax = axes[3]
    ax.set_title("Server Failure Rate (SLO Baseline)", fontweight='bold')
    ax.set_ylabel("Failure Rate %")
    has_plots = False
    for sc in scenarios:
        df_rate = build_df(rows, "db_server_failure_rate", sc)
        if not df_rate.empty:
            # Map percentage rate explicitly across sample windows
            fail_rate_r = df_rate.set_index("ts")["value"].resample("5s").mean().fillna(0) * 100
            ax.plot(fail_rate_r.index, fail_rate_r.values, label=f"{sc} (infra_failure)", color="crimson", linewidth=1.5)
            has_plots = True
    if has_plots:
        ax.legend(fontsize=8)
    else:
        ax.text(0.5, 0.5, "0% Server Failures Detected (Infra Clean)", ha="center", va="center", transform=ax.transAxes, color="green")
    ax.set_ylim(bottom=-5, top=105)

    for ax in axes:
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M:%S"))
        ax.xaxis.set_major_locator(mdates.AutoDateLocator())
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=30, ha="right")
        ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_path, dpi=300)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
