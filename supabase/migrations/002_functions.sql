-- convert_count: pallets+cases+units → final_cases+final_units
-- total_units = (pallets * pallet_size * bpu) + (cases * bpu) + units
CREATE OR REPLACE FUNCTION convert_count(
  p_pallets    INT,
  p_cases      INT,
  p_units      INT,
  p_bpu        INT,
  p_pallet_size INT,
  OUT final_cases INT,
  OUT final_units INT
)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  total_units BIGINT;
BEGIN
  total_units := (p_pallets::BIGINT * p_pallet_size * p_bpu)
               + (p_cases::BIGINT * p_bpu)
               + p_units;
  final_cases := (total_units / p_bpu)::INT;
  final_units := (total_units % p_bpu)::INT;
END;
$$;

-- is_admin: true se user_metadata.role = 'admin'
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOL
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
END;
$$;

-- my_team_id: team_id do contador autenticado
CREATE OR REPLACE FUNCTION my_team_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_team_id UUID;
BEGIN
  SELECT team_id INTO v_team_id
  FROM counter_accounts
  WHERE auth_user_id = auth.uid();
  RETURN v_team_id;
END;
$$;

-- my_counter_role: role do contador autenticado
CREATE OR REPLACE FUNCTION my_counter_role()
RETURNS counter_role
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role counter_role;
BEGIN
  SELECT role INTO v_role
  FROM counter_accounts
  WHERE auth_user_id = auth.uid();
  RETURN v_role;
END;
$$;

-- finalize_team_count: compara as 3 contagens e popula reconciliation_items
CREATE OR REPLACE FUNCTION finalize_team_count(p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item       RECORD;
  v_c1_cases   INT; v_c1_units INT;
  v_c2_cases   INT; v_c2_units INT;
  v_ind_cases  INT; v_ind_units INT;
  v_status     reconciliation_status;
BEGIN
  DELETE FROM reconciliation_items WHERE team_id = p_team_id;

  FOR v_item IN
    SELECT DISTINCT brand_code, bin_location
    FROM count_entries
    WHERE team_id = p_team_id AND is_joint_recount = FALSE
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

    SELECT final_cases, final_units INTO v_ind_cases, v_ind_units
    FROM count_entries
    WHERE team_id = p_team_id AND counter_role = 'independente'
      AND brand_code = v_item.brand_code
      AND (bin_location IS NOT DISTINCT FROM v_item.bin_location)
      AND is_joint_recount = FALSE
    LIMIT 1;

    IF v_c1_cases IS NOT NULL
      AND v_c2_cases IS NOT NULL
      AND v_ind_cases IS NOT NULL
      AND v_c1_cases = v_c2_cases AND v_c2_cases = v_ind_cases
      AND v_c1_units = v_c2_units AND v_c2_units = v_ind_units
    THEN
      v_status := 'combinado';
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
      v_ind_cases, v_ind_units
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
