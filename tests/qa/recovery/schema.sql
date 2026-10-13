-- Private forward migration on the identified synthetic source BEFORE backup.
-- No API/session/tenant/measurement grants; the preparer alone uses these tables.
SET ROLE saas_owner;
CREATE TABLE saas.recovery_checkpoints (
  cohort_id uuid PRIMARY KEY, generation uuid NOT NULL, barrier_version bigint NOT NULL CHECK(barrier_version>=0),
  journal_sequence integer NOT NULL CHECK(journal_sequence>=0), journal_hash text NOT NULL CHECK(journal_hash ~ '^[a-f0-9]{64}$'),
  restored_generation uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE saas.recovery_applied (
  operation_id uuid PRIMARY KEY, action text NOT NULL CHECK(action IN ('revoke_identity','revoke_session','purge_product')),
  target_hash text NOT NULL CHECK(target_hash ~ '^[a-f0-9]{64}$'), journal_hash text NOT NULL CHECK(journal_hash ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON saas.recovery_checkpoints,saas.recovery_applied FROM PUBLIC;
RESET ROLE;
