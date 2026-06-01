from __future__ import annotations

import random


def rand_int(rng: random.Random, low: int, high: int) -> int:
    return rng.randint(low, high)
