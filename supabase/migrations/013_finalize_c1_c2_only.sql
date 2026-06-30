-- finalize_team_count: C1 vs C2 only — independente is reconciler, not counter
CREATE OR REPLACE FUNCTION finalize_team_count(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item       RECORD;
  v_c1_cases   INT; v_c1_units INT;
  v_c2_cases   INT; v_c2_units INT;
  v_status     reconciliation_status;
BEGIN
  DELETE FROM reconciliation_items WHERE team_id = p_team_id;

  FOR v_item IN
    SELECT DISTINCT brand_code, bin_location
    FROM count_entries
    WHERE team_id = p_team_id
      AND is_joint_recount = FALSE
      AND counter_role IN ('contador_1', 'contador_2')
  LOOP
    SELECT final_cases, final_units INTO v_c1_cases, v_c1_units
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'contador_1'
      AND brand_code = v_item.brand_code
      AND (bin_location IS NOT DISTINCT FROM v_item.bin_location)
      AND is_joint_recount = FALSE
    LIMIT 1;

    SELECT final_cases, final_units INTO v_c2_cases, v_c2_units
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'contador_2'
      AND brand_code = v_item.brand_code
      AND (bin_location IS NOT DISTINCT FROM v_item.bin_location)
      AND is_joint_recount = FALSE
    LIMIT 1;

    v_status := CASE
      WHEN v_c1_cases IS NOT NULL
        AND v_c2_cases IS NOT NULL
        AND v_c1_cases = v_c2_cases
        AND v_c1_units = v_c2_units
      THEN 'combinado'::reconciliation_status
      ELSE 'discrepancia'::reconciliation_status
    END;

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
