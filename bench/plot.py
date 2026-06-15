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
from collections import defaultdict
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
        r["data"]["tags"].get("scenario", "")
        for r in rows
        if r.get("type") == "Point" and r.get("data", {}).get("tags")
    } - {""})
    meta = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "source_file": os.path.basename(results_path),
        "scenarios": scenarios,
    }
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Saved {meta_path}")


def to_ts(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def build_df(rows: list[dict], metric: str, scenario_filter: str | None) -> pd.DataFrame:
    points = []
    for r in rows:
        if r.get("type") != "Point":
            continue
        if r.get("metric") != metric:
            continue
        tags = r.get("data", {}).get("tags", {})
        sc = tags.get("scenario", "")
        if scenario_filter and scenario_filter != "all" and sc != scenario_filter:
            continue
        points.append({
            "ts": to_ts(r["data"]["time"]),
            "value": r["data"]["value"],
            "scenario": sc or "default",
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

    fig, axes = plt.subplots(4, 1, figsize=(14, 16), sharex=True)
    fig.suptitle(f"k6 Benchmark — {os.path.basename(args.results)}", fontsize=13)

    # collect scenarios present
    scenarios = sorted({
        r["data"]["tags"].get("scenario", "default")
        for r in rows
        if r.get("type") == "Point" and r.get("data", {}).get("tags")
        and (sc_filter is None or r["data"]["tags"].get("scenario") == sc_filter)
    })
    colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]
    sc_color = {s: colors[i % len(colors)] for i, s in enumerate(scenarios)}

    # Panel 1: VU count
    ax = axes[0]
    ax.set_title("Virtual Users")
    ax.set_ylabel("VUs")
    for sc in scenarios:
        df = build_df(rows, "vus", sc if sc_filter is None else sc_filter)
        df = df[df["scenario"] == sc] if sc_filter is None else df
        if df.empty:
            continue
        df_r = df.set_index("ts")["value"].resample("5s").last().dropna()
        ax.plot(df_r.index, df_r.values, label=sc, color=sc_color[sc])
    ax.legend(fontsize=8)

    # Panel 2: iteration rate
    ax = axes[1]
    ax.set_title("Iteration Rate")
    ax.set_ylabel("iter/s")
    for sc in scenarios:
        df = build_df(rows, "iterations", sc if sc_filter is None else sc_filter)
        df = df[df["scenario"] == sc] if sc_filter is None else df
        if df.empty:
            continue
        df_r = df.set_index("ts")["value"].resample("5s").sum().dropna()
        rate  = df_r / 5.0
        ax.plot(rate.index, rate.values, label=sc, color=sc_color[sc])
    ax.legend(fontsize=8)

    # Panel 3: latency percentiles (iteration_duration in ms)
    ax = axes[2]
    ax.set_title("Iteration Duration Percentiles")
    ax.set_ylabel("ms")
    for sc in scenarios:
        df = build_df(rows, "iteration_duration", sc if sc_filter is None else sc_filter)
        df = df[df["scenario"] == sc] if sc_filter is None else df
        if df.empty:
            continue
        for q, ls in [(0.50, "-"), (0.95, "--"), (0.99, ":")]:
            s = resample_percentile(df, "5s", q).dropna()
            ax.plot(s.index, s.values, ls, color=sc_color[sc],
                    label=f"{sc} p{int(q*100)}" if q == 0.95 else "_nolegend_")
    ax.legend(fontsize=8)

    # Panel 4: error rate
    ax = axes[3]
    ax.set_title("Error Rate")
    ax.set_ylabel("%")
    for sc in scenarios:
        df_ok  = build_df(rows, "iterations",       sc if sc_filter is None else sc_filter)
        df_err = build_df(rows, "iteration_duration", sc if sc_filter is None else sc_filter)
        df_ok  = df_ok[df_ok["scenario"]  == sc] if sc_filter is None else df_ok
        df_err = df_err[df_err["scenario"] == sc] if sc_filter is None else df_err
        if df_ok.empty:
            continue
        ok_r  = df_ok.set_index("ts")["value"].resample("5s").sum().dropna()
        # k6 records failed iterations via 'errors' metric or checks; use checks if available
        df_fail = build_df(rows, "checks", sc if sc_filter is None else sc_filter)
        df_fail = df_fail[df_fail["scenario"] == sc] if sc_filter is None else df_fail
        if not df_fail.empty:
            # checks value=0 means failure
            df_fail["failed"] = (df_fail["value"] == 0).astype(float)
            fail_r = df_fail.set_index("ts")["failed"].resample("5s").sum().reindex(ok_r.index, fill_value=0)
            total  = ok_r.replace(0, 1)
            rate   = (fail_r / total * 100).clip(0, 100)
            ax.plot(rate.index, rate.values, label=sc, color=sc_color[sc])
    ax.legend(fontsize=8)
    ax.set_ylim(bottom=0)

    for ax in axes:
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M:%S"))
        ax.xaxis.set_major_locator(mdates.AutoDateLocator())
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=30, ha="right")
        ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
