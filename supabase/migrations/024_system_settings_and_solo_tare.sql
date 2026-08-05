ALTER TABLE app_settings
  ADD COLUMN default_box_tare_g INT NOT NULL DEFAULT 300 CHECK (default_box_tare_g > 0),
  ADD COLUMN default_tolerance_g INT NOT NULL DEFAULT 0 CHECK (default_tolerance_g >= 0);

ALTER TABLE solo_sessions
  ADD COLUMN box_tare_g INT NOT NULL DEFAULT 300 CHECK (box_tare_g > 0);
