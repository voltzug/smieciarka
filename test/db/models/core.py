from sqlalchemy import BigInteger, Column, LargeBinary, String

from . import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "core"}

    id = Column(BigInteger, primary_key=True)
    login = Column(String(99), nullable=False)
    password = Column(String(512), nullable=False)
    status = Column(String, nullable=False)
    data_hash = Column(LargeBinary, nullable=False)


class Item(Base):
    __tablename__ = "items"
    __table_args__ = {"schema": "core"}

    id = Column(BigInteger, primary_key=True)
    sn = Column(String(512), nullable=False)
    hash_genesis = Column(LargeBinary, nullable=False)
    status = Column(String, nullable=False)
    title = Column(String(256), nullable=False)
    creator_id = Column(BigInteger, nullable=False)
    ledger_head = Column(BigInteger, nullable=True)
