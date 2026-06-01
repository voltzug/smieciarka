#!/bin/bash
CLIENT_STEPS=(1 90)
ITERATIONS=20

for clients in "${CLIENT_STEPS[@]}"
do
    echo "Running benchmark with $clients concurrent clients..."

    REPORT_DIR="reports/clients_${clients}"
    mkdir -p "$REPORT_DIR"

    python3 test.py --suite all --iterations $ITERATIONS --clients $clients --report-dir "$REPORT_DIR" --pool-max 99 --sa-max-overflow 50

    sleep 2
done

echo "Workload loops complete. Generating charts..."
python3 gen_charts.py --report-dir "$PWD/reports" --clients "${CLIENT_STEPS[@]}"
