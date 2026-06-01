from sqlalchemy import BigInteger, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import MONEY

from . import Base


class UserDetails(Base):
    __tablename__ = "user_details"
    __table_args__ = {"schema": "data"}

    user_id = Column(BigInteger, primary_key=True)
    email = Column(String(256), nullable=False)
    name = Column(String(64), nullable=False)
    surname = Column(String(128), nullable=False)


class ItemDetails(Base):
    __tablename__ = "item_details"
    __table_args__ = {"schema": "data"}

    item_id = Column(BigInteger, primary_key=True)
    description = Column(Text, nullable=True)


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = {"schema": "data"}

    id = Column(BigInteger, primary_key=True)
    status = Column(String, nullable=False)
    price = Column(MONEY, nullable=False)
    description = Column(Text, nullable=True)
    item_id = Column(BigInteger, nullable=False)
    creator_id = Column(BigInteger, nullable=False)


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = {"schema": "data"}

    id = Column(BigInteger, primary_key=True)
    value = Column(MONEY, nullable=False)
    status = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    offer_id = Column(BigInteger, nullable=False)
    bidder_id = Column(BigInteger, nullable=False)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = {"schema": "data"}

    id = Column(BigInteger, primary_key=True)
    subject = Column(String(256), nullable=True)
    contents = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=True)
    commenter_id = Column(BigInteger, nullable=False)
    offer_id = Column(BigInteger, nullable=False)
    bid_id = Column(BigInteger, nullable=True)
