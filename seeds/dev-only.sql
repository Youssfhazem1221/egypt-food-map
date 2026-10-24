-- FAKE sample data for the LOCAL dev database only (npm run db:seed-local).
-- Never run this with --remote: the names and prices are made up.
INSERT INTO spots (id, name, area, city, lat, lng, kind) VALUES
  (1, 'مكان تجربة ١', 'وسط البلد', 'القاهرة', 30.0480, 31.2400, 'koshary'),
  (2, 'مكان تجربة ٢', 'الدقي', 'الجيزة', 30.0385, 31.2120, 'ful'),
  (3, 'مكان تجربة ٣', 'مصر الجديدة', 'القاهرة', 30.0890, 31.3270, 'liver');

INSERT INTO prices (spot_id, dish, price_egp, checked_on, source) VALUES
  (1, 'كشري صغير (تجربة)', 25, '2026-10-01', 'team'),
  (1, 'كشري صغير (تجربة)', 30, '2026-10-18', 'team'),
  (1, 'كشري كبير (تجربة)', 45, '2026-10-18', 'team'),
  (2, 'سندوتش فول (تجربة)', 10, '2026-10-15', 'submission'),
  (2, 'سندوتش طعمية (تجربة)', 12, '2026-10-15', 'submission'),
  (3, 'سندوتش كبدة (تجربة)', 35, '2026-10-12', 'team');

INSERT INTO submissions (spot_name, area, city, dish, price_egp, lat, lng, note) VALUES
  ('مكان تجربة ٤', 'شبرا', 'القاهرة', 'حواوشي (تجربة)', 40, 30.0950, 31.2440, 'ده تجربة');
