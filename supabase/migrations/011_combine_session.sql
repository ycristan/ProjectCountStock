-- combine_session_results: agrega reconciliation_items de todas as equipes
-- com status 'reconciliada' e faz UPSERT em combined_results por brand_code.
CREATE OR REPLACE FUNCTION combine_session_results(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_brand_code TEXT;
  v_bpu        INT;
  v_team       RECORD;
  v_total      BIGINT;
  v_contrib    JSONB;
BEGIN
  DELETE FROM combined_results WHERE session_id = p_session_id;

  FOR v_brand_code, v_bpu IN
    SELECT DISTINCT ri.brand_code, ii.bpu
    FROM   reconciliation_items ri
    JOIN   teams t              ON t.id           = ri.team_id
    JOIN   inventory_items ii   ON ii.brand_code  = ri.brand_code
    WHERE  t.session_id = p_session_id
      AND  t.status     = 'reconciliada'
    ORDER BY ri.brand_code
  LOOP
    v_total   := 0;
    v_contrib := '[]'::JSONB;

    FOR v_team IN
      SELECT t.id        AS team_id,
             t.team_name,
             ri.status,
             ri.contador_1_cases,    ri.contador_1_units,
             ri.contador_2_cases,    ri.contador_2_units,
             ri.independente_cases,  ri.independente_units,
             ri.reconciliated_cases, ri.reconciliated_units
      FROM   teams t
      LEFT JOIN reconciliation_items ri
             ON ri.team_id    = t.id
            AND ri.brand_code = v_brand_code
      WHERE  t.session_id = p_session_id
        AND  t.status     = 'reconciliada'
      ORDER BY t.team_name
    LOOP
      IF v_team.independente_cases IS NOT NULL THEN
        IF v_team.status = 'resolvido' THEN
          v_total := v_total
            + (COALESCE(v_team.reconciliated_cases, 0)::BIGINT * v_bpu)
            + COALESCE(v_team.reconciliated_units, 0);
        ELSE
          v_total := v_total
            + (COALESCE(v_team.independente_cases, 0)::BIGINT * v_bpu)
            + COALESCE(v_team.independente_units, 0);
        END IF;
      END IF;

      v_contrib := v_contrib || jsonb_build_array(jsonb_build_object(
        'team_id',             v_team.team_id,
        'team_name',           v_team.team_name,
        'independente_cases',  v_team.independente_cases,
        'independente_units',  v_team.independente_units,
        'contador_1_cases',    v_team.contador_1_cases,
        'contador_1_units',    v_team.contador_1_units,
        'contador_2_cases',    v_team.contador_2_cases,
        'contador_2_units',    v_team.contador_2_units,
        'reconciliated_cases', v_team.reconciliated_cases,
        'reconciliated_units', v_team.reconciliated_units,
        'had_discrepancy',     (v_team.status = 'resolvido')
      ));
    END LOOP;

    INSERT INTO combined_results (
      session_id, brand_code,
      total_cases, total_units,
      contributing_teams, status
    ) VALUES (
      p_session_id, v_brand_code,
      (v_total / v_bpu)::INT,
      (v_total % v_bpu)::INT,
      v_contrib,
      'Avl'
    )
    ON CONFLICT (session_id, brand_code) DO UPDATE SET
      total_cases        = EXCLUDED.total_cases,
      total_units        = EXCLUDED.total_units,
      contributing_teams = EXCLUDED.contributing_teams,
      status             = EXCLUDED.status;
  END LOOP;
END;
$$;
