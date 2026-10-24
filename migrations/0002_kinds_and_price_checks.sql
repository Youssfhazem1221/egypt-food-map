-- Food type for what people send in (one of public/kinds.js, or empty).
ALTER TABLE submissions ADD COLUMN kind TEXT;

-- Spots used free text for kind; switch the known ones to the fixed list.
UPDATE spots SET kind = CASE kind
  WHEN 'كشري' THEN 'koshary'
  WHEN 'فول وطعمية' THEN 'ful'
  WHEN 'طعمية' THEN 'ful'
  WHEN 'كبدة' THEN 'liver'
  WHEN 'شاورما' THEN 'shawarma'
  WHEN 'حواوشي' THEN 'hawawshi'
  WHEN 'فطير' THEN 'feteer'
  WHEN 'سمك' THEN 'fish'
  WHEN 'حلويات' THEN 'sweets'
  ELSE kind
END
WHERE kind IS NOT NULL;

-- "السعر لسه كده؟" from visitors: a confirm counts right away,
-- a changed price waits for review, like a new spot.
CREATE TABLE price_checks (
  id          INTEGER PRIMARY KEY,
  spot_id     INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('confirm', 'update')),
  dish        TEXT,
  price_egp   INTEGER CHECK (price_egp IS NULL OR price_egp BETWEEN 1 AND 1000),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  reviewed_at TEXT
);
CREATE INDEX price_checks_by_spot ON price_checks (spot_id, status);
CREATE INDEX price_checks_by_status ON price_checks (status, created_at);
