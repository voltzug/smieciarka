import argparse
import glob
import os
import sys

import matplotlib.pyplot as plt
import pandas as pd


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate DB performance degradation charts."
    )
    parser.add_argument(
        "--clients",
        type=int,
        nargs="+",
        required=True,
        help="List of concurrent client steps evaluated in the benchmark (e.g., --clients 1 5 10 20)",
    )
    parser.add_argument(
        "--report-dir",
        type=str,
        default="reports",
        help="Base directory where reports are stored",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    client_steps = args.clients
    base_dir = args.report_dir

    print(f"Analyzing metrics for client tiers: {client_steps}")
    summary_data = []

    for clients in client_steps:
        # Match the directory pattern created by the bash script
        report_path = os.path.join(base_dir, f"clients_{clients}", "*.csv")
        files = glob.glob(report_path)

        if not files:
            print(f"Warning: No CSV data found for {clients} clients in {report_path}")
            continue

        all_dfs = []
        for f in files:
            try:
                df = pd.read_csv(f)
                if not df.empty and "latency_ms" in df.columns:
                    all_dfs.append(df)
            except Exception as e:
                continue

        if not all_dfs:
            continue

        master_df = pd.concat(all_dfs, ignore_index=True)

        total_requests = len(master_df)
        # Check both 'ok' flag (if 0 means fail) or presence of explicit error string
        successful_reqs = master_df[
            (master_df["ok"] == 1) & (master_df["error"].isna())
        ]
        failed_reqs = total_requests - len(successful_reqs)

        error_rate = (failed_reqs / total_requests) * 100 if total_requests > 0 else 0
        avg_latency = master_df["latency_ms"].mean()
        p95_latency = master_df["latency_ms"].quantile(0.95)

        summary_data.append(
            {
                "clients": clients,
                "avg_latency": avg_latency,
                "p95_latency": p95_latency,
                "error_rate": error_rate,
                "total_requests": total_requests,
            }
        )

    if not summary_data:
        print("Error: No valid benchmark data was parsed. Graph generation aborted.")
        sys.exit(1)

    df_summary = pd.DataFrame(summary_data)

    # --- GRAPH GENERATION ---
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))

    # Chart 1: Latency Spikes (The Exponential "Fold" Curve)
    ax1.plot(
        df_summary["clients"],
        df_summary["p95_latency"],
        marker="o",
        color="red",
        label="95th Percentile Latency",
    )
    ax1.plot(
        df_summary["clients"],
        df_summary["avg_latency"],
        marker="s",
        color="orange",
        linestyle="--",
        label="Average Latency",
    )
    ax1.set_title(
        "Latency vs. Concurrent Load (System Collapse)", fontsize=12, fontweight="bold"
    )
    ax1.set_xlabel("Concurrent Clients")
    ax1.set_ylabel("Latency (ms)")
    ax1.grid(True, linestyle=":")
    ax1.legend()

    # Chart 2: Non-linear Error Cascade
    ax2.plot(
        df_summary["clients"],
        df_summary["error_rate"],
        marker="x",
        color="darkblue",
        linewidth=2,
    )
    ax2.set_title(
        "Request Error Rate (%) vs. Load Scale", fontsize=12, fontweight="bold"
    )
    ax2.set_xlabel("Concurrent Clients")
    ax2.set_ylabel("Failed Requests (%)")
    ax2.grid(True, linestyle=":")

    plt.tight_layout()
    output_image = os.path.join(base_dir, "database_load_collapse.png")
    plt.savefig(output_image, dpi=600)
    print(f"\nCharts successfully generated and saved to: {output_image}")


if __name__ == "__main__":
    main()
