-- fix: sessão não encerrava (nem acesso de escrita era revogado) após "Confirm merged results".
-- Root cause: combine_session_results nunca setava count_sessions.status = 'fechada' (enum já previa
-- esse valor, nunca usado); e as RLS de escrita de count_entries/reconciliation_items só checavam
-- team_id/counter_role, sem olhar status da sessão — ou seja, mesmo com o status setado, contador e
-- independente continuariam escrevendo. Fix cobre as duas pontas.

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
    SELECT ii.brand_code, COALESCE(NULLIF(ii.bpu, 0), 1)
    FROM   inventory_items ii
    ORDER BY ii.brand_code
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
      IF v_team.status = 'resolvido' THEN
        v_total := v_total
          + (COALESCE(v_team.reconciliated_cases, 0)::BIGINT * v_bpu)
          + COALESCE(v_team.reconciliated_units, 0);
      ELSIF v_team.independente_cases IS NOT NULL THEN
        v_total := v_total
          + (COALESCE(v_team.independente_cases, 0)::BIGINT * v_bpu)
          + COALESCE(v_team.independente_units, 0);
      ELSIF v_team.contador_1_cases IS NOT NULL THEN
        -- ponytail: C1=C2, no discrepancy — C1 is official
        v_total := v_total
          + (COALESCE(v_team.contador_1_cases, 0)::BIGINT * v_bpu)
          + COALESCE(v_team.contador_1_units, 0);
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

  -- fix: encerra a sessão (enum já previa 'fechada', nunca era usado)
  UPDATE count_sessions SET status = 'fechada' WHERE id = p_session_id;
END;
$$;

-- fix: revoga escrita de contador/independente quando a sessão da equipe está fechada
DROP POLICY "counter_write_own" ON count_entries;
CREATE POLICY "counter_write_own" ON count_entries
  FOR ALL TO authenticated
  USING (
    team_id = my_team_id() AND counter_role = my_counter_role()
    AND NOT EXISTS (
      SELECT 1 FROM teams t JOIN count_sessions cs ON cs.id = t.session_id
      WHERE t.id = count_entries.team_id AND cs.status = 'fechada'
    )
  )
  WITH CHECK (
    team_id = my_team_id() AND counter_role = my_counter_role()
    AND NOT EXISTS (
      SELECT 1 FROM teams t JOIN count_sessions cs ON cs.id = t.session_id
      WHERE t.id = count_entries.team_id AND cs.status = 'fechada'
    )
  );

DROP POLICY "counter_team" ON reconciliation_items;
CREATE POLICY "counter_team" ON reconciliation_items
  FOR ALL TO authenticated
  USING (
    team_id = my_team_id()
    AND NOT EXISTS (
      SELECT 1 FROM teams t JOIN count_sessions cs ON cs.id = t.session_id
      WHERE t.id = reconciliation_items.team_id AND cs.status = 'fechada'
    )
  )
  WITH CHECK (
    team_id = my_team_id()
    AND NOT EXISTS (
      SELECT 1 FROM teams t JOIN count_sessions cs ON cs.id = t.session_id
      WHERE t.id = reconciliation_items.team_id AND cs.status = 'fechada'
    )
  );
