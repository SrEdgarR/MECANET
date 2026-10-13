# P1-L1 — Integration Gate preparado en CP-014

**Borrador local para integración, 2026-10-13.** P1-L1-OUT PASS, ocho cortes COMPLETADA; P1 continúa EN CURSO. No autoriza push, PR, CI remoto, merge, lanzamiento u otro lote. [Auditoría y matriz](../docs/audit/CP-014.md), [registro único](PLANNING_STATE.md).

## Cadena de §8.5

| Paso | Estado | Evidencia / acción pendiente |
|---|---|---|
| Rama y ámbito | PASS | codex/saas-discovery, checkout principal, SrEdgarR/MECANET exclusivamente; base CP-0135624ef0 |
| Código probado | PASS | Matriz8cortes y pruebas porSHA/componentes; runtimefinalF b0f5e19 / digest5950ae7…; no retagging de pruebas anteriores |
| Revisión local | PASS | Revisión independiente, fixesmonotónicos y QA, no hallazgo obligatorio L1 abierto; incidentes históricos sin causa mantienen límite |
| Quality Gate / checkpoint | PASS | qg.json y CP-014; SHA documental resuelto enGit/informe, no autoSHA |
| PR / review de PR | NOT VERIFIED | No creado/enviado; resolver dependencia histórica PR#1 y destino develop antes de abrir; no reconsultado por esta ejecución |
| CI PR | NOT VERIFIED | Sin workflow remoto ejecutado; deberá cubrir cadena aprobada del lote y secretos QA propios, no production/legacy |
| Merge / CI canónica | NOT VERIFIED | Sin merge ni nueva base canónica; requiere autorización y checks anteriores |
| Baseline / lote siguiente | NOT VERIFIED | No transición automática; aprobar alcance y gates del siguiente trabajo, conservando P0generalPARCIAL |

## Texto preparado para revisión

Título sugerido: **Completar la fundación privada PostgreSQL de Mecanet SaaS y su matriz P1-L1**.

El lote añade el recorrido privado de sesión vigente a empresa autorizada y catálogo ficticio, con credenciales y bases lógicas separadas, admisión durable entre dos procesos Express y productor mínimo de observación. Usa React y Compose propio, independiente de Coolify. La revisión CP-014 corrige emisión de sesión al fallar, presupuestos monotónicos y datos tardíos del cliente; cierra último cupo, incertidumbre, discontinuidad, drenaje y rollback con artefactos identificables.

Validación:73pruebas locales sobreD,29frontend/build/navegador15sobreC con componente inalterado, PostgreSQL18.6ARM64 y dosAPI con fallos/carreras/ledger, observación y drenaje reales; rollbackF→A→F conserva sesión/datos/generación sin cambiarPG. TresPASS históricos CP-013 conservados conSHA original, incluido restore físico sintético cerrado. RuntimefinalF `b0f5e199e5df457d7f901ff3a3dca5ab3a8d5701`, artefacto `sha256:5950ae7e519170ebaaf6cf8c99e9187c14b41f32779044e2829e8de5abbac0a6`; controladorcleanup409880a separado. [Manifiesto](../docs/evidence/cp014/runtime-manifest.json).

Límite: fixtures y QA privada detenida; no pagos, POSescritor/fiscal, demo comercial, administración completa, Sentryexterno, capacidad/productiveRPO/RTO o lanzamiento. OchoPASS cierran soloP1-L1, noP1global/SaaS. Sin cambios compartidos/proxy/DNS, secretos reales o datos de negocio. Las capturas/fallos previos se conservan en auditoría; ninguna garantía se rebaja para obtenerPASS.

## Riesgos y continuidad

- El riesgo de retrabajo por dependencias comerciales/fiscales sigue aceptado segúnRG-001; baselines siguientes independientes.
- La operación propia del lote no aprueba integración deHTTPS pública enproxy compartido; Q-41antes deldiff/remoto correspondiente.
- Antes de ejecutar CIdeintegración: comprobar objetivos/pruebas/entorno/versiones y su autorización; no trasladar Atlas/.envlegacy/secretos productivos aQA.
- La reanudación deQA sigue el [runbook](../tests/qa/README.md), no `compose up` indiscriminado sobre la cohorte CP-013cerrada.
