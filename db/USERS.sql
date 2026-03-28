REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA core, data, audit FROM PUBLIC;

-- Internal owner role (no login)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elephant') THEN
        CREATE ROLE elephant NOLOGIN;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA core, data, audit TO elephant;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA core, data, audit TO elephant;
GRANT DELETE ON ALL TABLES IN SCHEMA core, data TO elephant;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA core, data, audit TO elephant;

-- ensure security definer functions are owned by elephant
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT n.nspname,
                p.proname,
                pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('core', 'data', 'audit')
    LOOP
        EXECUTE format(
            'ALTER FUNCTION %I.%I(%s) OWNER TO elephant',
            r.nspname, r.proname, r.args
        );
    END LOOP;
END;
$$;


-- Moderator roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moder') THEN
        CREATE ROLE moder CONNECTION LIMIT 4;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA core, data TO moder;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA core, data TO moder;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA core, data TO moder;


-- App roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
        CREATE ROLE app CONNECTION LIMIT 9;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA core, data, audit TO app;
GRANT SELECT ON ALL TABLES IN SCHEMA core, data, audit TO app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA core, data, audit TO app;

-- exclude private functions
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT n.nspname,
               p.proname,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('core', 'data', 'audit')
          AND p.proname NOT LIKE '\_%' ESCAPE '\'
    LOOP
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO app',
            r.nspname, r.proname, r.args
        );
    END LOOP;
END;
$$;


-- Test roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_test') THEN
        CREATE ROLE app_test CONNECTION LIMIT 1 LOGIN PASSWORD 'app_test' INHERIT;
    END IF;
END;
$$;

GRANT app TO app_test;

GRANT UPDATE,DELETE ON ALL TABLES IN SCHEMA data TO app_test;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core, data, audit TO app_test;


-- prevent direct DML on protected tables
REVOKE INSERT, UPDATE, DELETE ON TABLE core.users, core.items FROM PUBLIC, moder, app, app_test;
REVOKE INSERT, UPDATE, DELETE ON TABLE data.offers, data.bids FROM PUBLIC, moder, app, app_test;
REVOKE INSERT, UPDATE, DELETE ON TABLE audit.item_ledger FROM PUBLIC, moder, app, app_test;

ALTER DEFAULT PRIVILEGES FOR ROLE elephant IN SCHEMA core, data, audit
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE elephant IN SCHEMA core, data, audit
    REVOKE INSERT, UPDATE, DELETE ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE elephant IN SCHEMA core, data, audit
    REVOKE INSERT, UPDATE, DELETE ON TABLES FROM moder;
ALTER DEFAULT PRIVILEGES FOR ROLE elephant IN SCHEMA core, data, audit
    REVOKE INSERT, UPDATE, DELETE ON TABLES FROM app;
ALTER DEFAULT PRIVILEGES FOR ROLE elephant IN SCHEMA core, data, audit
    REVOKE INSERT, UPDATE, DELETE ON TABLES FROM app_test;
