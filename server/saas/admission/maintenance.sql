CREATE TABLE saas.reconciliation_audit (
  ticket_id uuid PRIMARY KEY REFERENCES saas.tickets(id), owner uuid NOT NULL, generation uuid NOT NULL,
  reference text NOT NULL CHECK (reference ~ '^[a-zA-Z0-9:_-]{1,160}$'), reconciled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT USAGE ON SCHEMA saas TO saas_reconciler;
REVOKE ALL ON saas.reconciliation_audit FROM PUBLIC;
GRANT SELECT ON saas.admission_fence,saas.time_authority,saas.tickets,saas.windows,saas.reconciliation_audit TO saas_reconciler;
GRANT UPDATE(admission_version) ON saas.admission_fence TO saas_reconciler;
GRANT UPDATE(state,reserved_qc,reserved_qt,finished_at) ON saas.tickets TO saas_reconciler;
GRANT DELETE ON saas.windows TO saas_reconciler;
GRANT INSERT ON saas.reconciliation_audit TO saas_reconciler;
