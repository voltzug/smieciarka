from sqlalchemy import BigInteger, Column, DateTime, LargeBinary, SmallInteger, String

from . import Base


class ItemLedger(Base):
    __tablename__ = "item_ledger"
    __table_args__ = {"schema": "audit"}

    id = Column(BigInteger, primary_key=True)
    prev_id = Column(BigInteger, nullable=True)
    version = Column(SmallInteger, nullable=False)
    hash = Column(LargeBinary, nullable=False)
    event_type = Column(String, nullable=False)
    event_hash = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    item_id = Column(BigInteger, nullable=False)
    creator_id = Column(BigInteger, nullable=False)
