#!/bin/bash
CLIENT_STEPS=(1 5 10 15 20 25 30 35 40 45 50 55 60 66 70 75 80 85)
ITERATIONS=40

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
