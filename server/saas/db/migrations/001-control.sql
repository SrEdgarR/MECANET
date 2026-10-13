-- Applied only by the private, preflighted preparer; never by an API process.
CREATE SCHEMA saas AUTHORIZATION saas_owner;
CREATE SCHEMA session_store AUTHORIZATION saas_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SET ROLE saas_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;

CREATE TABLE saas.identities (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('company','demo','operator')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  security_version bigint NOT NULL DEFAULT 1 CHECK (security_version > 0),
  verified boolean NOT NULL DEFAULT false,
  mfa_verified boolean NOT NULL DEFAULT false
);
CREATE TABLE saas.tenant_directory (
  id uuid PRIMARY KEY,
  db_name text UNIQUE NOT NULL CHECK (db_name ~ '^[a-z][a-z0-9_]{0,62}$'),
  secret_ref text UNIQUE NOT NULL CHECK (length(secret_ref) BETWEEN 1 AND 128),
  credential_version bigint NOT NULL CHECK (credential_version > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  data_epoch bigint NOT NULL CHECK (data_epoch > 0),
  status text NOT NULL CHECK (status IN ('active','blocked','draining')),
  purpose text NOT NULL CHECK (purpose IN ('company','demo'))
);
CREATE TABLE saas.memberships (
  identity_id uuid REFERENCES saas.identities(id),
  tenant_id uuid REFERENCES saas.tenant_directory(id),
  role text NOT NULL CHECK (role IN ('owner','member','demo')),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  version bigint NOT NULL CHECK (version > 0),
  PRIMARY KEY (identity_id, tenant_id)
);
CREATE TABLE saas.role_policies (
  role text NOT NULL, action text NOT NULL CHECK (action IN ('catalog.read','usage.read','quota.change')),
  version bigint NOT NULL CHECK (version > 0), PRIMARY KEY (role, action)
);
CREATE TABLE saas.action_grants (
  identity_id uuid NOT NULL REFERENCES saas.identities(id),
  tenant_id uuid NOT NULL REFERENCES saas.tenant_directory(id),
  action text NOT NULL CHECK (action IN ('catalog.read','usage.read','quota.change')),
  status text NOT NULL CHECK (status IN ('active','revoked')),
  version bigint NOT NULL CHECK (version > 0),
  PRIMARY KEY (identity_id, tenant_id, action)
);
CREATE TABLE saas.session_registry (
  sid varchar PRIMARY KEY CHECK (length(sid) BETWEEN 32 AND 128),
  identity_id uuid NOT NULL REFERENCES saas.identities(id),
  purpose text NOT NULL CHECK (purpose IN ('company','demo','operator')),
  generation uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  security_version bigint NOT NULL CHECK (security_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  absolute_expires_at timestamptz NOT NULL,
  last_interactive_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reauth_at timestamptz,
  CHECK (absolute_expires_at > created_at),
  CHECK (last_interactive_at >= created_at)
);
CREATE INDEX registry_identity ON saas.session_registry(identity_id);

CREATE TABLE session_store.company_sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX company_sessions_expire ON session_store.company_sessions(expire);
CREATE TABLE session_store.demo_sessions (LIKE session_store.company_sessions INCLUDING ALL);
CREATE TABLE session_store.operator_sessions (LIKE session_store.company_sessions INCLUDING ALL);

-- The API supplies the SID exclusively from its verified cookie, not request input.
CREATE FUNCTION saas.revoke_session(p_sid text, p_identity uuid, p_generation uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $$
  WITH revoked AS (
    UPDATE saas.session_registry SET status='revoked'
    WHERE sid=p_sid AND identity_id=p_identity AND generation=p_generation
    RETURNING sid
  ) SELECT EXISTS (SELECT 1 FROM revoked)
$$;
REVOKE ALL ON FUNCTION saas.revoke_session(text,uuid,uuid) FROM PUBLIC;
CREATE FUNCTION saas.touch_session(p_sid text, p_identity uuid, p_generation uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $$
  WITH touched AS (
    UPDATE saas.session_registry SET last_interactive_at=clock_timestamp()
    WHERE sid=p_sid AND identity_id=p_identity AND generation=p_generation
      AND status='active' AND purpose <> 'demo' AND absolute_expires_at > clock_timestamp()
      AND last_interactive_at > clock_timestamp() - CASE WHEN purpose='operator' THEN interval '15 minutes' ELSE interval '30 minutes' END
    RETURNING sid
  ) SELECT EXISTS (SELECT 1 FROM touched)
$$;
REVOKE ALL ON FUNCTION saas.touch_session(text,uuid,uuid) FROM PUBLIC;

GRANT USAGE ON SCHEMA saas TO saas_api,saas_issuer,saas_revoker,saas_clock,saas_policy,saas_measure,saas_measure_owner,saas_reconciler;
GRANT USAGE ON SCHEMA session_store TO saas_session;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA session_store TO saas_session;
GRANT SELECT(id,email,purpose,status,security_version,verified,mfa_verified) ON saas.identities TO saas_api;
GRANT SELECT ON saas.tenant_directory,saas.memberships,saas.role_policies,saas.action_grants,saas.session_registry TO saas_api;
GRANT EXECUTE ON FUNCTION saas.revoke_session(text,uuid,uuid),saas.touch_session(text,uuid,uuid) TO saas_api;
GRANT SELECT ON saas.identities,saas.session_registry TO saas_issuer;
GRANT INSERT ON saas.session_registry TO saas_issuer;
GRANT EXECUTE ON FUNCTION saas.revoke_session(text,uuid,uuid) TO saas_issuer,saas_revoker;
GRANT SELECT ON saas.identities,saas.memberships,saas.action_grants,saas.session_registry TO saas_revoker;
GRANT UPDATE(status,security_version) ON saas.identities TO saas_revoker;
GRANT UPDATE(status,version) ON saas.memberships,saas.action_grants TO saas_revoker;
RESET ROLE;

-- Fixed allowlist: physical bytes only, never business rows or query text.
CREATE FUNCTION saas.measure_database_sizes()
RETURNS TABLE(scope text, metric text, value bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT 'control'::text, 'db.physical_bytes'::text, pg_catalog.pg_database_size('mecanet_control')
  UNION ALL SELECT 'tenant:11111111-1111-4111-8111-111111111111', 'db.physical_bytes', pg_catalog.pg_database_size('mecanet_tenant_a')
  UNION ALL SELECT 'tenant:22222222-2222-4222-8222-222222222222', 'db.physical_bytes', pg_catalog.pg_database_size('mecanet_tenant_b')
  UNION ALL SELECT 'demo', 'db.physical_bytes', pg_catalog.pg_database_size('mecanet_demo')
$$;
ALTER FUNCTION saas.measure_database_sizes() OWNER TO saas_measure_owner;
REVOKE ALL ON FUNCTION saas.measure_database_sizes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.measure_database_sizes() TO saas_measure;
