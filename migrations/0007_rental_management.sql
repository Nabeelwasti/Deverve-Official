-- Fleet catalogue and rental request details for the De VERVE mobility workflow.
ALTER TABLE vehicles ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_requests ADD COLUMN email TEXT;
ALTER TABLE rental_requests ADD COLUMN customer_note TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_requests ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_requests ADD COLUMN reference_code TEXT;
ALTER TABLE rental_requests ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_requests_reference
  ON rental_requests(reference_code) WHERE reference_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_requests_vehicle_window
  ON rental_requests(vehicle_id, status, pickup_at, return_at);
CREATE INDEX IF NOT EXISTS idx_rental_requests_status_created
  ON rental_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_status
  ON vehicles(status, vehicle_type);
