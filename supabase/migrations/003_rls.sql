-- Enable RLS em todas as tabelas
ALTER TABLE inventory_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_bin_locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE count_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE count_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE combined_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_approvals       ENABLE ROW LEVEL SECURITY;

-- inventory_items
CREATE POLICY "admin_all" ON inventory_items
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "counter_read" ON inventory_items
  FOR SELECT TO authenticated USING (NOT is_admin());

-- item_bin_locations
CREATE POLICY "admin_all" ON item_bin_locations
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "counter_read" ON item_bin_locations
  FOR SELECT TO authenticated USING (NOT is_admin());

-- count_sessions
CREATE POLICY "admin_all" ON count_sessions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "counter_read" ON count_sessions
  FOR SELECT TO authenticated USING (NOT is_admin());

-- teams
CREATE POLICY "admin_all" ON teams
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "counter_read_own" ON teams
  FOR SELECT TO authenticated USING (id = my_team_id());

-- counter_accounts
CREATE POLICY "admin_all" ON counter_accounts
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "counter_read_own" ON counter_accounts
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

-- count_entries
CREATE POLICY "admin_all" ON count_entries
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "counter_write_own" ON count_entries
  FOR ALL TO authenticated
  USING (team_id = my_team_id() AND counter_role = my_counter_role())
  WITH CHECK (team_id = my_team_id() AND counter_role = my_counter_role());
CREATE POLICY "counter_read_team" ON count_entries
  FOR SELECT TO authenticated USING (team_id = my_team_id());

-- reconciliation_items
CREATE POLICY "admin_all" ON reconciliation_items
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "counter_team" ON reconciliation_items
  FOR ALL TO authenticated
  USING (team_id = my_team_id())
  WITH CHECK (team_id = my_team_id());

-- combined_results
CREATE POLICY "admin_all" ON combined_results
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "all_read" ON combined_results
  FOR SELECT TO authenticated USING (true);

-- audit_approvals
CREATE POLICY "admin_all" ON audit_approvals
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
