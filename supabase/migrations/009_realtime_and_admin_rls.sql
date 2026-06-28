DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE count_entries;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE reconciliation_items;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE teams;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE counter_accounts;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "admin_read_counter_accounts"
    ON counter_accounts FOR SELECT
    TO authenticated
    USING (
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
