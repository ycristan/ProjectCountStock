-- Teams are divided by corridor; a brand_code never splits across bins within a team.
-- Grouping by bin_location was creating phantom multi-row reconciliations.
-- From now on finalize_team_count groups by brand_code only and stores bin_location = NULL.
CREATE OR REPLACE FUNCTION public.finalize_team_count(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item       RECORD;
  v_c1_cases   INT; v_c1_units INT; v_c1_weight BOOL;
  v_c2_cases   INT; v_c2_units INT; v_c2_weight BOOL;
  v_ind_cases  INT; v_ind_units INT; v_ind_weight BOOL;
  v_status     reconciliation_status;
  v_is_weight  BOOL;
  v_weight_avg NUMERIC;
  v_bpu        INT;
  v_c1_grams   NUMERIC; v_c2_grams NUMERIC; v_ind_grams NUMERIC;
BEGIN
  DELETE FROM reconciliation_items WHERE team_id = p_team_id;

  FOR v_item IN
    SELECT DISTINCT brand_code
    FROM count_entries
    WHERE team_id = p_team_id AND is_joint_recount = FALSE
  LOOP
    SELECT final_cases, final_units, is_weight_count
      INTO v_c1_cases, v_c1_units, v_c1_weight
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'contador_1'
      AND brand_code = v_item.brand_code
      AND is_joint_recount = FALSE LIMIT 1;

    SELECT final_cases, final_units, is_weight_count
      INTO v_c2_cases, v_c2_units, v_c2_weight
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'contador_2'
      AND brand_code = v_item.brand_code
      AND is_joint_recount = FALSE LIMIT 1;

    SELECT final_cases, final_units, is_weight_count
      INTO v_ind_cases, v_ind_units, v_ind_weight
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'independente'
      AND brand_code = v_item.brand_code
      AND is_joint_recount = FALSE LIMIT 1;

    v_is_weight := COALESCE(v_c1_weight, FALSE)
               AND COALESCE(v_c2_weight, FALSE)
               AND COALESCE(v_ind_weight, FALSE);

    IF v_c1_cases IS NULL OR v_c2_cases IS NULL OR v_ind_cases IS NULL THEN
      v_status := 'discrepancia';

    ELSIF v_is_weight THEN
      SELECT weight_avg, bpu INTO v_weight_avg, v_bpu
      FROM inventory_items WHERE brand_code = v_item.brand_code;

      v_c1_grams  := (v_c1_cases  * v_bpu + v_c1_units)  * v_weight_avg;
      v_c2_grams  := (v_c2_cases  * v_bpu + v_c2_units)  * v_weight_avg;
      v_ind_grams := (v_ind_cases * v_bpu + v_ind_units) * v_weight_avg;

      IF GREATEST(v_c1_grams, v_c2_grams, v_ind_grams)
       - LEAST(v_c1_grams, v_c2_grams, v_ind_grams) <= 200
      THEN
        v_status := 'combinado';
      ELSE
        v_status := 'discrepancia';
      END IF;

    ELSE
      IF v_c1_cases = v_c2_cases AND v_c2_cases = v_ind_cases
         AND v_c1_units = v_c2_units AND v_c2_units = v_ind_units
      THEN
        v_status := 'combinado';
      ELSE
        v_status := 'discrepancia';
      END IF;
    END IF;

    INSERT INTO reconciliation_items (
      team_id, brand_code, bin_location, status,
      contador_1_cases, contador_1_units,
      contador_2_cases, contador_2_units,
      independente_cases, independente_units,
      is_weight_count
    ) VALUES (
      p_team_id, v_item.brand_code, NULL, v_status,
      v_c1_cases, v_c1_units, v_c2_cases, v_c2_units, v_ind_cases, v_ind_units,
      v_is_weight
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
