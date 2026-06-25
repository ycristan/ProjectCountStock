-- Enums
CREATE TYPE session_status AS ENUM ('aberta', 'em_auditoria', 'fechada');
CREATE TYPE scope_mode AS ENUM ('livre', 'por_bin', 'por_brand_code');
CREATE TYPE count_focus AS ENUM ('pallets_cases', 'units');
CREATE TYPE team_status AS ENUM ('contando', 'reconciliando', 'reconciliada');
CREATE TYPE counter_role AS ENUM ('contador_1', 'contador_2', 'independente');
CREATE TYPE reconciliation_status AS ENUM ('combinado', 'discrepancia', 'resolvido');
CREATE TYPE combined_status AS ENUM ('Avl', 'Pendente', 'Conflito', 'Não Contado');
CREATE TYPE audit_final_status AS ENUM ('pendente', 'aprovado', 'rejeitado');

CREATE TABLE inventory_items (
  brand_code   TEXT PRIMARY KEY,
  brand_name   TEXT NOT NULL,
  bpu          INT  NOT NULL CHECK (bpu > 0),
  pallet_size  INT  NOT NULL CHECK (pallet_size > 0)
);

CREATE TABLE item_bin_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_code   TEXT NOT NULL REFERENCES inventory_items(brand_code) ON DELETE CASCADE,
  bin_location TEXT NOT NULL,
  UNIQUE (brand_code, bin_location)
);

CREATE TABLE count_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                 session_status NOT NULL DEFAULT 'aberta',
  inventory_snapshot_ref TEXT
);

CREATE TABLE teams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES count_sessions(id) ON DELETE CASCADE,
  team_name           TEXT NOT NULL,
  scope_mode          scope_mode NOT NULL DEFAULT 'livre',
  scope_bin_locations TEXT[],
  scope_brand_codes   TEXT[],
  count_focus         count_focus,
  status              team_status NOT NULL DEFAULT 'contando'
);

CREATE TABLE counter_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id              UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role                 counter_role NOT NULL,
  username             TEXT NOT NULL UNIQUE,
  must_change_password BOOL NOT NULL DEFAULT TRUE,
  UNIQUE (team_id, role)
);

CREATE TABLE count_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  counter_role     counter_role NOT NULL,
  brand_code       TEXT NOT NULL REFERENCES inventory_items(brand_code),
  bin_location     TEXT,
  pallets          INT NOT NULL DEFAULT 0 CHECK (pallets >= 0),
  cases            INT NOT NULL DEFAULT 0 CHECK (cases >= 0),
  units            INT NOT NULL DEFAULT 0 CHECK (units >= 0),
  final_cases      INT NOT NULL DEFAULT 0,
  final_units      INT NOT NULL DEFAULT 0,
  entered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_joint_recount BOOL NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX count_entries_no_bin_unique
  ON count_entries (team_id, counter_role, brand_code)
  WHERE bin_location IS NULL;

CREATE UNIQUE INDEX count_entries_with_bin_unique
  ON count_entries (team_id, counter_role, brand_code, bin_location)
  WHERE bin_location IS NOT NULL;

CREATE TABLE reconciliation_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  brand_code         TEXT NOT NULL REFERENCES inventory_items(brand_code),
  bin_location       TEXT,
  status             reconciliation_status NOT NULL DEFAULT 'discrepancia',
  contador_1_cases   INT,
  contador_1_units   INT,
  contador_2_cases   INT,
  contador_2_units   INT,
  independente_cases INT,
  independente_units INT
);

CREATE TABLE combined_results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES count_sessions(id) ON DELETE CASCADE,
  brand_code         TEXT NOT NULL REFERENCES inventory_items(brand_code),
  total_cases        INT NOT NULL DEFAULT 0,
  total_units        INT NOT NULL DEFAULT 0,
  contributing_teams JSONB,
  status             combined_status NOT NULL DEFAULT 'Pendente',
  UNIQUE (session_id, brand_code)
);

CREATE TABLE audit_approvals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES count_sessions(id) ON DELETE CASCADE,
  auditor_1_id          UUID REFERENCES auth.users(id),
  auditor_1_approved_at TIMESTAMPTZ,
  auditor_2_id          UUID REFERENCES auth.users(id),
  auditor_2_approved_at TIMESTAMPTZ,
  final_status          audit_final_status NOT NULL DEFAULT 'pendente'
);
