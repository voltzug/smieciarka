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


def clean_error_string(err_msg):
    """Extracts short exception class name from SQLAlchemy/asyncpg string"""
    if pd.isna(err_msg) or str(err_msg).strip() == "":
        return None
    err_str = str(err_msg)
    # Target extraction patterns like <class 'asyncpg.exceptions.DiskFullError'>
    if "<class '" in err_str:
        try:
            return err_str.split("<class '")[1].split("'>")[0].split(".")[-1]
        except IndexError:
            pass
    # Fallback to the first line of the error message if complex format
    return err_str.split("\n")[0][:50]


def main():
    args = parse_args()
    client_steps = args.clients
    base_dir = args.report_dir

    print(f"Analyzing metrics for client tiers: {client_steps}")
    summary_data = []
    all_errors_global = []
    client_error_breakdown = {}

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
            except Exception:
                continue

        if not all_dfs:
            continue

        master_df = pd.concat(all_dfs, ignore_index=True)

        # Trace individual error occurrences
        error_series = master_df["error"].dropna().apply(clean_error_string)
        all_errors_global.extend(error_series.tolist())
        # Store dynamic frequencies per current client volume
        if not error_series.empty:
            client_error_breakdown[clients] = error_series.value_counts().to_dict()
        else:
            client_error_breakdown[clients] = {}

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
    df_summary = pd.DataFrame(summary_data)

    # Create a 2x2 subplot canvas (adjusted layout sizes for the extra layer)
    fig, axs = plt.subplots(2, 2, figsize=(16, 12))
    ax1, ax2, ax3, ax4 = axs[0, 0], axs[0, 1], axs[1, 0], axs[1, 1]

    # Chart 1: Latency Spikes
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
        "Latency vs. Concurrent Load (System Collapse)", fontsize=11, fontweight="bold"
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
        "Request Error Rate (%) vs. Load Scale", fontsize=11, fontweight="bold"
    )
    ax2.set_xlabel("Concurrent Clients")
    ax2.set_ylabel("Failed Requests (%)")
    ax2.grid(True, linestyle=":")

    # Chart 3: Global Error Distribution (Pie Chart)
    global_err_counts = pd.Series(all_errors_global).value_counts()
    if not global_err_counts.empty:
        ax3.pie(
            global_err_counts,
            labels=global_err_counts.index,
            autopct="%1.1f%%",
            startangle=140,
            colors=plt.cm.Paired.colors,
        )
        ax3.set_title(
            "Global Error Type Breakdown (All Runs combined)",
            fontsize=11,
            fontweight="bold",
        )
    else:
        ax3.text(
            0.5, 0.5, "No errors encountered during testing", ha="center", va="center"
        )
        ax3.set_title("Global Error Distribution", fontsize=11, fontweight="bold")

    # Chart 4: Top 3 Error Types Stacked Graph per Client Volume
    # Detect top 3 highest volume exceptions across the entire program runtime history
    top_3_errors = pd.Series(all_errors_global).value_counts().head(3).index.tolist()
    if top_3_errors:
        # Prepare alignment layers for the stack graph
        plot_clients = [str(c) for c in client_steps]
        bottom_base = [0] * len(client_steps)
        colors = ["#4e79a7", "#f28e2b", "#e15759"]  # High contrast palette for layers

        for idx, err_name in enumerate(top_3_errors):
            err_counts_per_step = []
            for c in client_steps:
                # Extract count if error occurred under that client volume, otherwise 0
                err_counts_per_step.append(
                    client_error_breakdown.get(c, {}).get(err_name, 0)
                )

            ax4.bar(
                plot_clients,
                err_counts_per_step,
                bottom=bottom_base,
                label=err_name,
                color=colors[idx % len(colors)],
            )
            # Mutate stack base alignment for subsequent categories
            bottom_base = [b + c for b, c in zip(bottom_base, err_counts_per_step)]

        ax4.set_title(
            "Top 3 Most Occurring Errors by Client Scale",
            fontsize=11,
            fontweight="bold",
        )
        ax4.set_xlabel("Concurrent Clients")
        ax4.set_ylabel("Error Count")
        ax4.legend(
            loc="upper left", bbox_to_anchor=(1, 1)
        )  # Offload legend out of bars boundaries
    else:
        ax4.text(0.5, 0.5, "No errors to stack", ha="center", va="center")
        ax4.set_title("Top 3 Most Occurring Errors", fontsize=11, fontweight="bold")

    plt.tight_layout()
    output_image = os.path.join(base_dir, "database_load_collapse.png")
    plt.savefig(output_image, dpi=600)


if __name__ == "__main__":
    main()
