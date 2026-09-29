-- The console's schema. Applied by UIS, never by the app, PIPED from the host:
--   cat config/init-database.sql | uis configure postgresql --app urb-agents-console \
--     --namespace fleet --secret-name-prefix urb-agents-console --init-file -
-- A path (`--init-file config/init-database.sql`) does NOT work: before UIS 1.6.176 it was
-- silently ignored (no SQL applied, exit 0), and since then it is resolved inside the uis
-- container, where this checkout is not mounted (tor-agent, #1737). `--namespace` and
-- `--secret-name-prefix` write the Secret urb-agents-console-db where the pods run.
-- Every statement is idempotent, so re-running it is safe: re-run it when this file changes.
-- Check the result with \dt in the database, never by the exit code alone.
--
-- One row per `urb events` row, in the contract's shape (urb 0.5.48, "urb-events/1") and no wider.
-- `from_id` / `to_id` are the task's sender and recipient; `by_id` is who acted, where the bus says.
-- Each holds an allowlisted id or 'others' (src/allowlist.ts): an id that is not on the allowlist
-- is folded before the row is written, so it never reaches this table.
--
-- `id` is a keyed hash made with URB_EVENTS_KEY. The same key must be used on every run: a new
-- key gives every event a new id, so the overlap window would store events twice.

CREATE TABLE IF NOT EXISTS events (
    id         TEXT COLLATE "C" PRIMARY KEY,    -- the contract's opaque hash: de-duplication only. Byte order, so paging ties break the same everywhere
    at         TIMESTAMPTZ NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('opened', 'moved', 'replied', 'closed')),
    from_id    TEXT NOT NULL,
    to_id      TEXT,                            -- null if the contract ever sends none
    by_id      TEXT,                            -- who acted: set on replies; null where the bus does not say
    state      TEXT,
    provider   TEXT,                            -- null: a label move, or written before urb 0.5.43
    model      TEXT,
    collected  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_at ON events (at DESC, id DESC);

-- The last list of who may be named that the collector read from marketing's agents.json (#1687).
-- Kept so a restart while marketing's site is down still has a list: the collector never names
-- anyone without one. One row, 'named'.
CREATE TABLE IF NOT EXISTS naming (
    name    TEXT PRIMARY KEY,
    ids     TEXT[] NOT NULL,
    fetched TIMESTAMPTZ NOT NULL
);

-- Where the collector has read up to. One row per stream; 'events' is the only one.
CREATE TABLE IF NOT EXISTS collector_mark (
    name   TEXT PRIMARY KEY,
    since  TIMESTAMPTZ NOT NULL,
    ran    TIMESTAMPTZ NOT NULL
);
