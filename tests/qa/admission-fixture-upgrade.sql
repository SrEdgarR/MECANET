-- Exact private QA fixture correction; not a product migration or quota reset.
-- Run only after preflight verifies the isolated QA cluster identity. Preserve live usage.
BEGIN;
UPDATE saas.admission_fence SET admission_version=admission_version+1 WHERE id=1;
UPDATE saas.policies SET limits=jsonb_set(limits,'{qh1}','20'::jsonb),base_limits=jsonb_set(base_limits,'{qh1}','20'::jsonb) WHERE scope_key='entry:auth';
UPDATE saas.policies SET limits=jsonb_set(limits,'{qh1}','10'::jsonb),base_limits=jsonb_set(base_limits,'{qh1}','10'::jsonb) WHERE scope_key='entry:operator';
INSERT INTO saas.policies(scope_key,version,limits,base_limits)
SELECT 'tenant:33333333-3333-4333-8333-333333333333:demo',1,base_limits,base_limits FROM saas.policies WHERE scope_key='tenant:33333333-3333-4333-8333-333333333333'
ON CONFLICT(scope_key) DO NOTHING;
INSERT INTO saas.admission_scopes(scope_key) VALUES('tenant:33333333-3333-4333-8333-333333333333:demo') ON CONFLICT DO NOTHING;
COMMIT;
