CREATE TABLE saas.admission_fence (
  id smallint PRIMARY KEY CHECK (id = 1), generation uuid NOT NULL,
  tick bigint NOT NULL CHECK (tick >= 0), clock_version bigint NOT NULL CHECK (clock_version >= 0),
  admission_version bigint NOT NULL DEFAULT 0 CHECK (admission_version >= 0), barrier boolean NOT NULL DEFAULT true
);
CREATE TABLE saas.time_authority (
  id smallint PRIMARY KEY CHECK (id = 1), owner uuid NOT NULL, generation uuid NOT NULL,
  tick bigint NOT NULL CHECK (tick >= 0), clock_version bigint NOT NULL CHECK (clock_version >= 0),
  advanced_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE saas.policies (
  scope_key text PRIMARY KEY CHECK (length(scope_key) <= 96), version bigint NOT NULL CHECK (version > 0),
  limits jsonb NOT NULL CHECK (jsonb_typeof(limits) = 'object'), base_limits jsonb NOT NULL,
  override_expires_at timestamptz
);
CREATE TABLE saas.admission_scopes (
  scope_key text PRIMARY KEY REFERENCES saas.policies(scope_key),
  last_turn bigint NOT NULL DEFAULT 0 CHECK (last_turn >= 0)
);
CREATE TABLE saas.windows (
  scope_key text NOT NULL REFERENCES saas.policies(scope_key), tick bigint NOT NULL CHECK (tick >= 0),
  qh bigint NOT NULL DEFAULT 0 CHECK (qh >= 0), qc bigint NOT NULL DEFAULT 0 CHECK (qc >= 0), qt bigint NOT NULL DEFAULT 0 CHECK (qt >= 0),
  PRIMARY KEY (scope_key, tick)
);
CREATE TABLE saas.tickets (
  id uuid PRIMARY KEY, tenant_id uuid REFERENCES saas.tenant_directory(id),
  lane text NOT NULL CHECK (lane IN ('ordinary', 'essential', 'demo', 'auth', 'operator')),
  operation_kind text NOT NULL CHECK (operation_kind IN ('HTTP', 'JOB')), owner uuid NOT NULL, generation uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('WAITING', 'ACTIVE', 'UNCERTAIN', 'FINISHED', 'EXPIRED', 'REJECTED')),
  scopes text[] NOT NULL CHECK (cardinality(scopes) IN (1,4)), policy_versions jsonb NOT NULL,
  created_tick bigint NOT NULL CHECK (created_tick >= 0), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(), queue_expires_at timestamptz NOT NULL,
  reserved_qc bigint NOT NULL CHECK (reserved_qc >= 0), reserved_qt bigint NOT NULL CHECK (reserved_qt >= 0),
  work_started boolean NOT NULL DEFAULT false, finished_at timestamptz,
  CHECK (state NOT IN ('FINISHED', 'EXPIRED', 'REJECTED') OR (reserved_qc = 0 AND reserved_qt = 0)),
  CHECK ((tenant_id IS NULL AND lane IN ('auth','operator') AND cardinality(scopes)=1) OR (tenant_id IS NOT NULL AND lane IN ('ordinary','essential','demo') AND cardinality(scopes)=4))
);
CREATE INDEX tickets_live_scopes ON saas.tickets USING gin(scopes) WHERE state IN ('WAITING', 'ACTIVE', 'UNCERTAIN');
CREATE INDEX tickets_turn ON saas.tickets(lane, tenant_id, created_at, id) WHERE state = 'WAITING';
CREATE TABLE saas.policy_audit (
  request_id uuid PRIMARY KEY, actor_id uuid NOT NULL, tenant_id uuid NOT NULL, action text NOT NULL CHECK (action = 'quota.change'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 160), expected_version bigint NOT NULL,
  before_limits jsonb NOT NULL, after_limits jsonb NOT NULL, version bigint NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
  request_hash text NOT NULL CHECK (length(request_hash) = 64)
);

REVOKE ALL ON saas.admission_fence, saas.time_authority, saas.policies, saas.admission_scopes, saas.windows, saas.tickets, saas.policy_audit FROM PUBLIC;
GRANT SELECT ON saas.admission_fence, saas.time_authority, saas.policies, saas.admission_scopes, saas.windows, saas.tickets TO saas_api;
GRANT UPDATE(admission_version) ON saas.admission_fence TO saas_api;
GRANT UPDATE(last_turn) ON saas.admission_scopes TO saas_api;
GRANT INSERT, UPDATE ON saas.windows, saas.tickets TO saas_api;
GRANT SELECT ON saas.admission_fence, saas.time_authority TO saas_clock;
GRANT UPDATE(tick, clock_version, generation) ON saas.admission_fence TO saas_clock;
GRANT UPDATE(owner, generation, tick, clock_version, advanced_at) ON saas.time_authority TO saas_clock;
GRANT SELECT ON saas.admission_fence, saas.policies, saas.policy_audit TO saas_policy;
GRANT UPDATE(admission_version) ON saas.admission_fence TO saas_policy;
GRANT UPDATE(version, limits, override_expires_at) ON saas.policies TO saas_policy;
GRANT INSERT ON saas.policy_audit TO saas_policy;
GRANT SELECT ON saas.admission_fence TO saas_issuer;
GRANT UPDATE(admission_version) ON saas.admission_fence TO saas_issuer;
