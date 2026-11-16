-- Store separate owner-configurable daily prices for self-drive and chauffeur rentals,
-- plus the exact server-calculated estimate shown when the customer submits a request.
ALTER TABLE vehicles ADD COLUMN with_driver_daily_rate_paisa INTEGER
  CHECK (with_driver_daily_rate_paisa IS NULL OR with_driver_daily_rate_paisa >= 0);

ALTER TABLE rental_requests ADD COLUMN rental_days INTEGER
  CHECK (rental_days IS NULL OR rental_days BETWEEN 1 AND 60);
ALTER TABLE rental_requests ADD COLUMN estimated_daily_rate_paisa INTEGER
  CHECK (estimated_daily_rate_paisa IS NULL OR estimated_daily_rate_paisa >= 0);
ALTER TABLE rental_requests ADD COLUMN estimated_total_paisa INTEGER
  CHECK (estimated_total_paisa IS NULL OR estimated_total_paisa >= 0);
