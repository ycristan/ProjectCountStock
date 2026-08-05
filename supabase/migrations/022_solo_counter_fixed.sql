-- 022_solo_counter_fixed.sql

ALTER TABLE solo_sessions
  ADD COLUMN assigned_to_counter BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN restrict_to_list BOOLEAN NOT NULL DEFAULT false;
-- counter_name (added in 018_solo_pin, always NULL until now) is reused:
-- from this point on it is set by the counter themself, not by the admin.

CREATE TABLE solo_session_items (
  session_id UUID NOT NULL REFERENCES solo_sessions(id) ON DELETE CASCADE,
  brand_code TEXT NOT NULL REFERENCES inventory_items(brand_code),
  PRIMARY KEY (session_id, brand_code)
);

ALTER TABLE solo_session_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY solo_session_items_admin ON solo_session_items
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') = 'admin');

CREATE POLICY solo_session_items_counter_read ON solo_session_items
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND EXISTS (
      SELECT 1 FROM solo_sessions s
      WHERE s.id = solo_session_items.session_id AND s.assigned_to_counter = true
    )
  );

-- solo_sessions/solo_entries already have an admin-only ALL policy (016_solo_sessions).
-- Add read/write for the fixed solo-counter role, scoped to sessions assigned to it.
CREATE POLICY solo_sessions_counter_select ON solo_sessions
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
  );

CREATE POLICY solo_sessions_counter_update ON solo_sessions
  FOR UPDATE USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND assigned_to_counter = true
  );

CREATE POLICY solo_entries_counter ON solo_entries
  FOR ALL USING (
    (auth.jwt()->'user_metadata'->>'role') = 'counter'
    AND (auth.jwt()->'user_metadata'->>'is_solo_counter') = 'true'
    AND EXISTS (
      SELECT 1 FROM solo_sessions s
      WHERE s.id = solo_entries.session_id AND s.assigned_to_counter = true
    )
  );

CREATE TABLE app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  notify_email TEXT
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_admin ON app_settings
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') = 'admin');

INSERT INTO app_settings (id, notify_email) VALUES (1, NULL);
