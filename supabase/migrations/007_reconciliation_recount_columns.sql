ALTER TABLE reconciliation_items
  ADD COLUMN IF NOT EXISTS reconciliated_cases INTEGER,
  ADD COLUMN IF NOT EXISTS reconciliated_units INTEGER;
