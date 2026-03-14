SET search_path TO data;

-- user_details
CREATE OR REPLACE FUNCTION _init_user_details(p_user_id bigint, p_name varchar, p_surname varchar, p_email varchar)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO user_details(user_id, name, surname, email)
    VALUES (p_user_id, p_name, p_surname, p_email)
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION _change_user_email(p_user_id bigint, p_email varchar)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_details
    SET email = p_email
    WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION change_user_details(p_user_id bigint, p_name varchar, p_surname varchar)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_details
    SET name = p_name,
        surname = p_surname
    WHERE user_id = p_user_id;
END;
$$;

-- item_details
CREATE OR REPLACE FUNCTION _init_item_details(p_item_id bigint, p_description text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO item_details(item_id, description)
    VALUES (p_item_id, p_description)
    ON CONFLICT (item_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION change_item_details(p_item_id bigint, p_description text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE item_details
    SET description = p_description
    WHERE item_id = p_item_id;
END;
$$;
