# P1-L1 — Integration Gate preparado en CP-015

**Paquete local,2026-10-13.** Autorización humana actual admite Git/CI bajo condiciones; no deploy. Ocho salidas L1 PASS conservadas. Rama limpia **codex/integrate-p1-l1** desde develop `010aab670c638d168c971df3e3e53b97e72ff443`, código local probado `a89cc2eee43a8f60f3464bea26a6ea4f9ddfc867`. Fuente9fc y PR1 preservados. [Auditoría](../docs/audit/CP-015.md), [registro único](PLANNING_STATE.md).

| Paso §8.5 | Estado | Evidencia/límite |
|---|---|---|
| Rama/base/alcance | PASS | Desde develop, sin3deccdf/f5afaa2; expediente/código L1 únicamente |
| Código y regresión integrada | PASS |73backend/29frontend/3sanitizer/3controller/syntax64/build;104objetos y3assets F exactos |
| Baseline protegida/checkpoint/revisión local | PASS | SE-002/CP015/review independiente; no approvalGitHub |
| Seguridad antes de publicar | NOT VERIFIED | Q42:Vercel flags no observables; conservar integraciones, no previews autorizadas |
| Audit completo / seguridad CI | FAIL | Q43:5high/2moderate tooling; runtime0 no sustituye este gate |
| PR/review GitHub/CI PR | NOT VERIFIED | No publicado/creado; workflowtests/build/audit propio preparado sin deploy |
| Merge/CI canónica/base siguiente | NOT VERIFIED | develop010aab no cambia; L1 noTERMINAL, sin next_phase_base_sha |

## PR preparado, todavía no creado

Título: **Integrar la fundación aislada PostgreSQL de Mecanet SaaS sin despliegues heredados**.

El lote incorpora sesión vigente→empresa autorizada→catálogo ficticio, bases/credenciales aisladas, admisión durable entre dos API y observación privada. React/Express/PostgreSQL con Compose propio, independiente de Coolify. La base es develop y no incorpora los commits del PR1Vercel/Coolify. SE-002 conserva la baseline exacta aprobada en una representación portable.

Validación local sobre `a89cc2eee43a8f60f3464bea26a6ea4f9ddfc867`:73backend,29SaaS,3sanitizador,3controller,64sintaxis y build. Dos patches selectivos DOMPurify/source-map-js; bundle idéntico al F previamente probado. Evidencia histórica PostgreSQL18.6ARM64/dosAPI/browser/restore/rollback conserva sus SHA y límites; no se presenta como ejecución nueva de CI. Runtimeaudit0; fullaudit FAIL5high/2moderate. CI remoto/reviewGitHub/merge no realizados.

**Bloqueos:** acreditar Gitsettings Vercel antes de push/PR/merge(Q42) y resolver fullaudit(Q43). Sin waiver, cambio de integración ajena, forcepush, bypass o deploy. QA STOPPED/KEEP y sin recursos nuevos. Pagos/POSescritor/fiscal/demo comercial/panel completo/Sentry externo/capacidad/lanzamiento fuera del lote. El candidato siguiente permanece en la rama fuente de planificación, separado del PR funcional L1.

No se vuelve a pedir A/B de L1. P1-L2 necesita su A exacta y B diferenciada/gates; un roadmap o PR mergeado no la concede. [Runbook QA](../tests/qa/README.md) solo si una prueba nueva justifica reanudación y preflight; no abrir QA para estos documentos/Git.

## Continuación CP-016 — gates locales satisfechos

CP-016, 2026-10-13: P1-L1 TERMINAL, ocho salidas PASS y Integration Gate PASS con [PR #2](https://github.com/SrEdgarR/MECANET/pull/2), head `04c5d41299bffc15e201c168677079809feb6a0f`, merge/develop `a0098178fc27467bf4c12da0e97723e0b80ce683`; [CI push](https://github.com/SrEdgarR/MECANET/actions/runs/38440714202), [CI PR](https://github.com/SrEdgarR/MECANET/actions/runs/38440720838) y [CI develop](https://github.com/SrEdgarR/MECANET/actions/runs/38441611717) PASS. Código local probado `0d8285cef117d6174a6053f18ceaac180f8aa1c5`; evidencia remota por sus SHA propios. Q-42/Q-43 resueltas para la lane aprobada; legacy audit FAIL/TD-21 conservado. P1 única fase EN CURSO; P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. P1-L2 v0.2 candidato revisado, A/B pendientes y doce salidas funcionales NOT VERIFIED. Sin despliegues o recursos de infraestructura modificados.

Las secciones anteriores conservan el paquete histórico CP-015. Snapshot documental premerge Git 54da15c05b781d531e5156766f3831d91c3fa0ca permanece sin reescritura; head publicado/CI 04c5d41299bffc15e201c168677079809feb6a0f se registra por separado. El head incorpora la corrección workflow-only para instalar npm11.9 explícito; no es el SHA de pruebas locales ni de generación del QG documental64. Este resultado posterior se registra solo en primary.

Decisión A exacta P1-L2 v0.2/ajuste P1-P2 y B diferenciada; después Design/Development/Environment del lote antes de código/recursos. No P2 o lanzamiento por extensión
