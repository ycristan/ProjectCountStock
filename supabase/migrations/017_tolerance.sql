-- Add configurable weight tolerance to count_sessions
-- Default 0 = exact match (backward-compatible with existing sessions)
ALTER TABLE count_sessions ADD COLUMN IF NOT EXISTS tolerance_g INT NOT NULL DEFAULT 0;

-- finalize_team_count: C1 vs C2 with configurable weight tolerance
-- For weight items: converts grams → units via weight_avg, allows ABS diff <= tolerance
CREATE OR REPLACE FUNCTION finalize_team_count(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item        RECORD;
  v_c1_cases    INT; v_c1_units INT; v_c1_weight BOOL;
  v_c2_cases    INT; v_c2_units INT; v_c2_weight BOOL;
  v_status      reconciliation_status;
  v_tolerance_g INT;
  v_weight_avg  NUMERIC;
  v_bpu         INT;
  v_c1_total    BIGINT; v_c2_total BIGINT;
  v_tol_units   BIGINT;
BEGIN
  SELECT cs.tolerance_g INTO v_tolerance_g
  FROM count_sessions cs
  JOIN teams t ON t.session_id = cs.id
  WHERE t.id = p_team_id;
  v_tolerance_g := COALESCE(v_tolerance_g, 0);

  DELETE FROM reconciliation_items WHERE team_id = p_team_id;

  FOR v_item IN
    SELECT DISTINCT brand_code, bin_location
    FROM count_entries
    WHERE team_id = p_team_id
      AND is_joint_recount = FALSE
      AND counter_role IN ('contador_1', 'contador_2')
  LOOP
    SELECT final_cases, final_units, is_weight_count INTO v_c1_cases, v_c1_units, v_c1_weight
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'contador_1'
      AND brand_code = v_item.brand_code
      AND (bin_location IS NOT DISTINCT FROM v_item.bin_location)
      AND is_joint_recount = FALSE
    LIMIT 1;

    SELECT final_cases, final_units, is_weight_count INTO v_c2_cases, v_c2_units, v_c2_weight
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'contador_2'
      AND brand_code = v_item.brand_code
      AND (bin_location IS NOT DISTINCT FROM v_item.bin_location)
      AND is_joint_recount = FALSE
    LIMIT 1;

    IF v_c1_cases IS NOT NULL AND v_c2_cases IS NOT NULL THEN
      IF v_c1_cases = v_c2_cases AND v_c1_units = v_c2_units THEN
        v_status := 'combinado';
      ELSIF v_tolerance_g > 0
        AND COALESCE(v_c1_weight, false)
        AND COALESCE(v_c2_weight, false)
      THEN
        SELECT ii.weight_avg, ii.bpu INTO v_weight_avg, v_bpu
        FROM inventory_items ii WHERE ii.brand_code = v_item.brand_code;
        IF v_weight_avg > 0 AND v_bpu > 0 THEN
          v_c1_total  := v_c1_cases::BIGINT * v_bpu + v_c1_units;
          v_c2_total  := v_c2_cases::BIGINT * v_bpu + v_c2_units;
          v_tol_units := CEIL(v_tolerance_g::NUMERIC / v_weight_avg);
          v_status := CASE
            WHEN ABS(v_c1_total - v_c2_total) <= v_tol_units
            THEN 'combinado'::reconciliation_status
            ELSE 'discrepancia'::reconciliation_status
          END;
        ELSE
          v_status := 'discrepancia';
        END IF;
      ELSE
        v_status := 'discrepancia';
      END IF;
    ELSE
      v_status := 'discrepancia';
    END IF;

    INSERT INTO reconciliation_items (
      team_id, brand_code, bin_location, status,
      contador_1_cases, contador_1_units,
      contador_2_cases, contador_2_units,
      independente_cases, independente_units
    ) VALUES (
      p_team_id, v_item.brand_code, v_item.bin_location, v_status,
      v_c1_cases, v_c1_units,
      v_c2_cases, v_c2_units,
      NULL, NULL
    );
  END LOOP;

  UPDATE teams
  SET status = CASE
    WHEN EXISTS (
      SELECT 1 FROM reconciliation_items
      WHERE team_id = p_team_id AND status = 'discrepancia'
    )
    THEN 'reconciliando'::team_status
    ELSE 'reconciliada'::team_status
  END
  WHERE id = p_team_id;
END;
$$;
