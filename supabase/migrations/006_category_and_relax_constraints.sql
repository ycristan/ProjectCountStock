ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_bpu_check;
ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_pallet_size_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_bpu_check CHECK (bpu >= 0);
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_pallet_size_check CHECK (pallet_size >= 0);
ALTER TABLE inventory_items ALTER COLUMN bpu SET DEFAULT 0;
ALTER TABLE inventory_items ALTER COLUMN pallet_size SET DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category1 TEXT NOT NULL DEFAULT '';
