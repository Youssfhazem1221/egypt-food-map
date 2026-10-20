-- Places that sell food cheaply. Only 'live' spots show on the map.
CREATE TABLE spots (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,                       -- as people call it, Arabic first
  area       TEXT NOT NULL,                       -- e.g. وسط البلد
  city       TEXT NOT NULL DEFAULT 'القاهرة',
  lat        REAL NOT NULL CHECK (lat BETWEEN 21.5 AND 32),
  lng        REAL NOT NULL CHECK (lng BETWEEN 24.5 AND 37),
  kind       TEXT,                                -- e.g. كشري، فول وطعمية
  maps_url   TEXT,
  status     TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'hidden', 'closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- What a spot sells and what it cost on the day someone checked.
-- Old rows stay, so price changes over time can be tracked.
CREATE TABLE prices (
  id         INTEGER PRIMARY KEY,
  spot_id    INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  dish       TEXT NOT NULL,
  price_egp  INTEGER NOT NULL CHECK (price_egp BETWEEN 1 AND 1000),
  checked_on TEXT NOT NULL,                       -- YYYY-MM-DD
  source     TEXT NOT NULL DEFAULT 'team' CHECK (source IN ('team', 'submission')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX prices_by_spot ON prices (spot_id, checked_on);

-- What people send through the form. Never shown until someone approves it.
CREATE TABLE submissions (
  id          INTEGER PRIMARY KEY,
  spot_name   TEXT NOT NULL,
  area        TEXT NOT NULL,
  city        TEXT,
  dish        TEXT NOT NULL,
  price_egp   INTEGER NOT NULL,
  lat         REAL,
  lng         REAL,
  maps_url    TEXT,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  spot_id     INTEGER REFERENCES spots(id),       -- set when approved
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  reviewed_at TEXT
);
CREATE INDEX submissions_by_status ON submissions (status, created_at);
