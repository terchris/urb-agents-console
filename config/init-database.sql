-- The console's schema. Applied by UIS, never by the app:
--   uis configure postgresql --app urb-agents-console --init-file config/init-database.sql
-- (the dev-templates convention, see python-basic-webserver-database). Every statement is
-- idempotent, so re-running it is safe.
--
-- One row per `urb events` row, in the contract's shape (terchris/urb-agents #1651) and no wider.
-- `from_id` / `to_id` hold an allowlisted id or 'others' (src/allowlist.ts): an id that is not on
-- the allowlist is folded before the row is written, so it never reaches this table.

CREATE TABLE IF NOT EXISTS events (
    id         TEXT COLLATE "C" PRIMARY KEY,    -- the contract's opaque hash: de-duplication only. Byte order, so paging ties break the same everywhere
    at         TIMESTAMPTZ NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('opened', 'moved', 'replied', 'closed')),
    from_id    TEXT NOT NULL,
    to_id      TEXT,                            -- null if the contract ever sends none
    state      TEXT,
    provider   TEXT,                            -- null: a label move, or written before urb 0.5.43
    model      TEXT,
    collected  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_at ON events (at DESC, id DESC);

-- Where the collector has read up to. One row per stream; 'events' is the only one.
CREATE TABLE IF NOT EXISTS collector_mark (
    name   TEXT PRIMARY KEY,
    since  TIMESTAMPTZ NOT NULL,
    ran    TIMESTAMPTZ NOT NULL
);
