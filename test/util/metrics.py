from __future__ import annotations

import asyncio
import csv
import re
from pathlib import Path
from time import perf_counter_ns
from typing import Any


def now_ns() -> int:
    return perf_counter_ns()


def elapsed_ms(start_ns: int) -> float:
    return (perf_counter_ns() - start_ns) / 1_000_000


class Metrics:
    def __init__(self, report_dir: str | Path) -> None:
        self._report_dir = Path(report_dir)
        self._report_dir.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, asyncio.Lock] = {}
        self._writers: dict[str, csv.writer] = {}
        self._files: dict[str, Any] = {}
        self._fieldnames: dict[str, list[str]] = {}

    def _topic_path(self, topic: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9_.-]+", "_", topic)
        return self._report_dir / f"{safe}.csv"

    async def log(self, topic: str, iteration: int, **fields: Any) -> None:
        lock = self._locks.setdefault(topic, asyncio.Lock())
        async with lock:
            if topic not in self._writers:
                path = self._topic_path(topic)
                f = path.open("w", newline="", encoding="utf-8")
                writer = csv.writer(f)
                fieldnames = list(fields.keys())
                writer.writerow(["iteration", *fieldnames])
                self._writers[topic] = writer
                self._files[topic] = f
                self._fieldnames[topic] = fieldnames
            else:
                fieldnames = self._fieldnames[topic]
                if list(fields.keys()) != fieldnames:
                    raise ValueError(
                        f"Metrics fields mismatch for topic '{topic}'. "
                        f"Expected {fieldnames}, got {list(fields.keys())}."
                    )

            row = [iteration] + [fields[name] for name in fieldnames]
            self._writers[topic].writerow(row)
            self._files[topic].flush()

    async def close(self) -> None:
        for f in self._files.values():
            f.close()
        self._writers.clear()
        self._files.clear()
        self._fieldnames.clear()
        self._locks.clear()
