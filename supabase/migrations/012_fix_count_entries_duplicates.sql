-- Remove duplicate count_entries — keep only the most recent per (team_id, counter_role, brand_code)
DELETE FROM count_entries
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY team_id, counter_role, brand_code
             ORDER BY entered_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM count_entries
    WHERE is_joint_recount = FALSE
  ) ranked
  WHERE rn > 1
);

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_count_entries_per_role_brand
ON count_entries (team_id, counter_role, brand_code)
WHERE NOT is_joint_recount;
