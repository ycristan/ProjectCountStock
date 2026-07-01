CREATE TABLE solo_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  counter_name TEXT,
  access_pin TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE solo_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES solo_sessions(id) ON DELETE CASCADE,
  brand_code TEXT NOT NULL,
  brand_name TEXT,
  final_cases INT NOT NULL DEFAULT 0,
  final_units INT NOT NULL DEFAULT 0,
  counted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, brand_code)
);

ALTER TABLE solo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY solo_sessions_admin ON solo_sessions
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') = 'admin');

CREATE POLICY solo_entries_admin ON solo_entries
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') = 'admin');
