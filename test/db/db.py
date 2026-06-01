from __future__ import annotations

from dataclasses import dataclass

import asyncpg
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    database: str
    user: str
    password: str
    pool_min_size: int = 2
    pool_max_size: int = 99
    sa_pool_size: int = 5
    sa_max_overflow: int = 5


@dataclass(frozen=True)
class DbContext:
    engine: AsyncEngine
    sessionmaker: async_sessionmaker[AsyncSession]
    pool: asyncpg.Pool


async def init_db(config: DbConfig) -> DbContext:
    sa_url = URL.create(
        drivername="postgresql+asyncpg",
        username=config.user,
        password=config.password,
        host=config.host,
        port=config.port,
        database=config.database,
    )

    engine = create_async_engine(
        sa_url,
        pool_size=config.sa_pool_size,
        max_overflow=config.sa_max_overflow,
        future=True,
    )
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    pool = await asyncpg.create_pool(
        user=config.user,
        password=config.password,
        host=config.host,
        port=config.port,
        database=config.database,
        min_size=config.pool_min_size,
        max_size=config.pool_max_size,
    )

    return DbContext(engine=engine, sessionmaker=sessionmaker, pool=pool)


async def close_db(ctx: DbContext) -> None:
    await ctx.pool.close()
    await ctx.engine.dispose()
