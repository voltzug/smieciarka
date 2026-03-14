SET search_path TO data;

-- offers
CREATE TYPE e_offer_status AS ENUM (
    'ACTIVE',
    'RESERVED',
    'PENDING_TRANSACTION',
    'CLOSED'
);

-- bids
CREATE TYPE e_bid_status AS ENUM (
    'PENDING',
    'CANCELLED',
    'FINISHED'
);
