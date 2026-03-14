SET search_path TO core;

CREATE TYPE t_created_updated AS (
    created_at timestamptz,
    updated_at timestamptz
);

-- users
CREATE TYPE e_user_status AS ENUM ('PENDING', 'ACTIVE', 'DELETED');

-- items
CREATE TYPE e_item_status AS ENUM ('CREATED', 'VERIFIED', 'BURNT');