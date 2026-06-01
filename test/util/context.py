from __future__ import annotations

import random
from dataclasses import dataclass

from db.db import DbContext


@dataclass(frozen=True)
class TestContext:
    db: DbContext
    scale: int
    client_id: int
    rng: random.Random
