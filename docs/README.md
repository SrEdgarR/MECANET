# Expediente Mecanet SaaS

CP-017 — cierre del mismo checkpoint, 2026-10-13: **P1-L2 TERMINAL**, doce criterios PASS e Integration Gate PASS; P1-L1 TERMINAL conservado. P1 única fase EN CURSO, P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. Baseline completa v0.2-CP016/DEC-061 y B diferenciada DEC-062, snapshot ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71; base de implementación L2 a0098178fc27467bf4c12da0e97723e0b80ce683. Cierre documental en codex/cp017-close sobre develop7ff9a6c41060e186c8e8c6ce475957c53d40de38. Catorce pendientes FUTURE, cero BLOCKING; Q-35 conserva sólo garantías posteriores/reapertura fuera de L2. P1-L3 SUGGESTED/NOT APPROVED, sin A/B ni implementación. Sin lanzamiento público, datos reales o cambios compartidos.

[Integración acreditada](evidence/cp017/integration.json): [PR #3](https://github.com/SrEdgarR/MECANET/pull/3), head `df9219a202542fca173ffba25fe8d523b40e54cb`, merge/develop `7ff9a6c41060e186c8e8c6ce475957c53d40de38`, fusionado2026-10-13T23:05:36Z. [CI push](https://github.com/SrEdgarR/MECANET/actions/runs/38481922405), [CI PR](https://github.com/SrEdgarR/MECANET/actions/runs/38481927763) y [CI canónica](https://github.com/SrEdgarR/MECANET/actions/runs/38482079889) SUCCESS. Checkout real push df9219a202542fca173ffba25fe8d523b40e54cb, PR synthetic merge3bd4dcbe6b44fc78ede161c5b82fc9d640400198 con tree igual al head df9219a, canónica7ff9a6c41060e186c8e8c6ce475957c53d40de38; no se atribuye el checkout del PR directamente al head. Primer checkpoint de aceptación `c7335f9bc24b68b578c2a165bbab341962fa6854`; cierre posterior dentro de CP-017, SHA documental final identificada externamente, sin autorreferencia. [Corrección CI](evidence/cp017/ci-correction.json) conserva primeras ejecuciones255PASS/3FAIL y checkout limpio RED12/15→GREEN15/15; sólo fixture mkdtemp/tmpdir, sin cambiar producto8199 ni helpers/runtime QA2b0. Suite completa258PASS y peer de fixture0 REQUIRED; no se reetiquetan los FAIL iniciales.

Evidencia acotada CP-017: producto `8199a414ff06220e147b062ce37fa55709311627`; artefacto QA `2b0dd67f7f19fa563ae5eae802da533572da7abe` / `sha256:85f959d949897298450b49a705d30b9688bfbaf9573d142fe4e08acae010e75c`. [Regresión local](evidence/cp017/local-canonical.json):258/258, sintaxis134 y Python PASS, con hashes de archivos propios y estado anterior al commit del arnés; no ejecución limpia atribuida al HEAD2b0. Canonicalización real de2b0:14 HTTP/79 SQL PASS acotados, B con huella intacta y readiness global503 esperada; no PASS de salud general. Conflictos40001/40P01 y drain/identity/block B conservan sus fuentes previas. [Navegador](evidence/cp017/browser.md) conserva fuente252 y20 checks/56 HTTP/seis escenarios con assets exactos; no se reatribuye a2b0.

Restore cerrado de2b0: tres fases PASS,20 resultados antes/después,40 llamadas writer antiguas rechazadas,6 sesiones antiguas rechazadas y18 credenciales antiguas rechazadas/18 nuevas verificadas. Generación nueva `90d78c7c-9efd-437e-844a-a134ce84e514`, destino CLOSED, sin reapertura. [Cleanup](evidence/cp017/cleanup.json):6 contenedores propios STOPPED,20 consumidores ajenos intactos, datos/backups/journal KEEP, túnel propio4312 detenido y loopback18443 cerrado. [P1-L3](../.agentic/P1-L3_CANDIDATE.md) es sólo SUGGESTED/NOT APPROVED, sin A/B o recursos nuevos.

[Matriz final](evidence/cp017/matrix.md), SHA-256 `930d208a8f64f8a344251fb271bc2df89595204b8a29823d29184b000a423d0d`: doce PASS por la unión trazada de evidencias, separados de integración. [Review consolidado](evidence/cp017/review-consolidated.json):0 críticos/0 REQUIRED abiertos. [Quality local](evidence/cp017/quality-local.json) PASS:258 contratos/134 archivos de sintaxis/55 pruebas UI/3 sanitizador/4 preload; auditorías SaaS/backend0, assets idénticos y cleanup PASS. Integration Gate PASS acreditado aparte en integration.json/CI por sus checkouts; L2 TERMINAL. Próximo paso: cierre documental del mismo CP-017 y revisión del candidato L3, sin A/B/implementación siguiente.

Antecedente conservado (histórico): **CP-016, 2026-10-13: P1-L1 TERMINAL, ocho salidas PASS y Integration Gate PASS con [PR #2](https://github.com/SrEdgarR/MECANET/pull/2), head `04c5d41299bffc15e201c168677079809feb6a0f`, merge/develop `a0098178fc27467bf4c12da0e97723e0b80ce683`; [CI push](https://github.com/SrEdgarR/MECANET/actions/runs/38440714202), [CI PR](https://github.com/SrEdgarR/MECANET/actions/runs/38440720838) y [CI develop](https://github.com/SrEdgarR/MECANET/actions/runs/38441611717) PASS. Código local probado `0d8285cef117d6174a6053f18ceaac180f8aa1c5`; evidencia remota por sus SHA propios. Q-42/Q-43 resueltas para la lane aprobada; legacy audit FAIL/TD-21 conservado. P1 única fase EN CURSO; P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. P1-L2 v0.2 candidato revisado, A/B pendientes y doce salidas funcionales NOT VERIFIED. Sin despliegues o recursos de infraestructura modificados.**

## Autoridad

1. Instrucciones y decisiones explícitas del usuario.
2. [Prompt Maestro v2.0](methodology/Prompt_Maestro_v2.0.md), copia exacta del adjunto adoptado. SHA-256 `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d`.
3. [Decisiones](DECISIONS.md): APPROVED es vinculante en su alcance; PROPOSED no lo es.
4. Baselines protegidas: [P1-L1](specs/P1-L1.md), DEC-058, S-18/manifiesto L-01 y ocho cortes al commit `3b387b38784907b67e2209a35c3d5f400d70742e`; [P1-L2](specs/P1-L2.md), A exacta DEC-061 sobre el archivo completo v0.2-CP016 y B diferenciada DEC-062. El resto del candidato SaaS sigue sin aprobación; sus borradores no autorizan implementación.
5. Código/evidencia describen lo observado, no convierten el legado en requisito.
6. Documentos vivos y mapa derivados. Ante discrepancias, corregirlos sin alterar evidencia histórica.

## Navegación

| Documento | Propósito | Estado |
|---|---|---|
| [Auditoría CP-016](audit/CP-016.md) | Seguridad, SC-008, integración terminal L1 y candidato L2 de ese checkpoint | Histórica; Integration Gate L1 PASS, A/B L2 pendientes entonces |
| [PROJECT_STATE](PROJECT_STATE.md) | Fase, readiness, restricciones, trazabilidad | Vivo |
| [INVENTORY](INVENTORY.md) | Estado real, brechas, infraestructura y fuentes | DETECTED / REPORTED identificados |
| [CHECKPOINTS](CHECKPOINTS.md) | Decisiones y evidencia por SHA/entorno | CP-001…016 conservados; CP-017 EN CURSO, cierre aún pendiente |
| [ROADMAP](ROADMAP.md) | Dependencias y gates del trabajo | RG-001 APPROVED para el lote; resto conserva gates |
| [DECISIONS](DECISIONS.md) | Registro de decisiones independientes | Mezcla explícita APPROVED / PROPOSED |
| [TECH_DEBT](TECH_DEBT.md) | Riesgos y deuda con resolve-before | Vivo |
| [Planificación](../.agentic/PLANNING_STATE.md) | Preguntas resueltas/pendientes | Abierta |
| [Levantamiento SaaS](../.agentic/SAAS_DISCOVERY.md) | Producto, flujos, datos y criterios candidatos | Borrador |
| [Alternativas de arquitectura](../.agentic/ARCHITECTURE_OPTIONS.md) | Contratos históricos MT/MC y DEP-IND operativo propio | Fragmentos relacionales/Compose aprobados en L1; restantes y capacidad general pendientes |
| [Propuesta de planes](../.agentic/SUBSCRIPTION_PROPOSAL.md) | Catálogo DOP/anualidad, lifecycle y economía recalculable | Catálogo DOP/USD, recurrencia y calendario APPROVED; proveedor/coste final pendientes |
| [Feedback](../.agentic/METHODOLOGY_FEEDBACK.md) | AUD del proceso, separado de defectos del producto | Pendiente de revisión humana |
| [Plan de trabajo](../tasks/plan.md) / [tareas](../tasks/todo.md) | L1 y L2 integrados | Ambos TERMINAL; L2 doce PASS limitados e Integration Gate PASS, P1 general EN CURSO |
| [Mapa local](project-map/index.html) | Vista interactiva del avance y de UI real | Derivado; nunca producción |
| [Datos del mapa](PROJECT_MAP_DATA.json) | Datos estructurados, sin porcentaje inventado | Derivado |
| [Fuentes externas](evidence/SOURCES.md) | Proveedor, consulta, alcance y revalidación | VENDOR-DOCUMENTATION |
| [Candidato de especificación](../.agentic/SPECIFICATION_CANDIDATE.md) | Candidato general v0.12-CP012; referencia histórica del fragmento limitado | SaaS general CANDIDATE / NOT APPROVED |
| [Baseline protegida P1-L1](specs/P1-L1.md) | Versión v0.2-CP012/S-18, manifiesto L-01 y ocho cortes al Git aprobado | APPROVED DEC-058, alcance limitado |
| [Baseline protegida P1-L2](specs/P1-L2.md) | Archivo completo v0.2-CP016 y snapshot byte exacto | APPROVED DEC-061; B/QA/integración condicionada DEC-062 |
| [Auditoría CP-014](audit/CP-014.md) | Matriz integrada, negativas, admisión, ciclo, UI, aislamiento y trazabilidad por versión | Histórica; ocho PASS L1, Integration Gate local preparado |
| [Auditoría CP-013](audit/CP-013.md) | A/B/QA, implementación y pendientes de salida de ese checkpoint | Histórica; cierre L1 NOT VERIFIED entonces, restore cerrado conservado |
| [Auditoría CP-011](audit/CP-011.md) | RG-001 aplicado, S-18 limitado, F14-L1/entorno/A/B separados | Histórico bf28c45; no aprobación del candidato Mongo |
| [Auditoría CP-010](audit/CP-010.md) | Revisión técnica, QA real acotada y solicitudes | Histórica4b2f272; ochoPASS y límites conservados |
| [Auditoría CP-009](audit/CP-009.md) | Respuestas, investigación externa, costes y candidato | Histórica f72bd239; evidencia y límites conservados |
| [Auditoría CP-008](audit/CP-008.md) | SC-004, candidatos completos y condiciones anteriores | Histórica3ec4c1e; límites originales |
| [Auditoría CP-007](audit/CP-007.md) | Contratos y cortes P1-L1 anteriores | Histórica472b685, evidencia conservada |
| [Auditoría CP-006](audit/CP-006.md) | Decisiones directas, MC/CC/DEM/SUB, modelos/fixture y gate preparado | Histórica en 31a854d, reutilizada sin nuevas pruebas |
| [Auditoría CP-005](audit/CP-005.md) | Recomendación multiempresa y evidencia de código/versiones de aquel checkpoint | Histórica en fcd93a8; elección aprobada posteriormente CP-006 |
| [Auditoría CP-004](audit/CP-004.md) | Aclaración humana, SE-001 y propuestas comerciales/demo | Histórica en c936468; nuevas aprobaciones exactas CP-006 registradas por separado |
| [Auditoría CP-003](audit/CP-003.md) | Lagunas técnicas G-01…G-06 y evidencia reutilizada | Histórica en cbb16ce; no nueva prueba técnica |
| [Auditoría CP-002](audit/CP-002.md) | Decisión de hosting e impacto | Histórica en 973fbf3; sin inspección remota nueva |
| [Auditoría CP-001](audit/CP-001.md) | Inventario y pruebas anteriores | Histórica, commit 614a74c; no se reescribe como nueva evidencia |
| [Auditoría CP-012](audit/CP-012.md) | SC-005/006, diseño independiente/PostgreSQL, entorno y límites | Histórica; A y Environment pendientes en ese checkpoint |
| [Entorno CP-012](evidence/CP-012-environment.json) | Metadatos sanitizados VPS/local y limitaciones | REMOTE/LOCAL, lectura sin cambios |

## Registro de especificaciones canónicas del SaaS general

**Baselines limitadas aprobadas para implementación:** [P1-L1 v0.2-CP012](specs/P1-L1.md), S-18, manifiesto L-01 y ocho cortes a la versión exacta `3b387b38784907b67e2209a35c3d5f400d70742e`, por DEC-058; [P1-L2 v0.2-CP016](specs/P1-L2.md), archivo completo al checkpoint fuente `704b4ae22f1af7fe868d3faf6bdf17a227fb0f50`, [snapshot protegido](specs/p1-l2-approved/baseline.md) SHA-256 `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71`, A exacta DEC-061 y B/QA/integración condicionada DEC-062. Las autorizaciones no requieren otra aprobación por corte. L1/L2 TERMINAL; L2 doce criterios de aceptación limitada e Integration Gate PASS. Diseño Mongo/gestión Coolify anterior no incorporado como mecanismo vigente. No se aprueba todo el SaaS ni infraestructura compartida por extensión.

El [candidato v0.12-CP012](../.agentic/SPECIFICATION_CANDIDATE.md) reúne estas áreas con contratos detallados y conserva el antecedente de L1. El SaaS general sigue como borrador revisable. La baseline protegida L1 incorpora únicamente S-18 y las referencias selectivas de L-01/DEP-IND a su versión Git aprobada; L2 se protege por su archivo completo y snapshot exactos del párrafo anterior, sin incorporación transitiva del resto del SaaS. Las revisiones del alcance limitado y sus gates de entrada están acreditados; F14 global permanece PARCIAL. Aprobación del diseño, evidencia de salida e integración conservan sus criterios separados para cada lote.

| Área canónica | Sección del candidato y contrato detallado | Cierre antes de |
|---|---|---|
| VISION.md | S-01; SAAS F0 objetivos y evidencia | Specification Gate |
| PRODUCT.md | S-01/02/04/05; SAAS actores/alcance | Specification Gate |
| BUSINESS_RULES.md | S-02…06; SUB catálogo/calendario/recurrencia y CC/DEM | Specification / DG-PAY |
| USER_FLOWS.md | S-03…06; SAAS flujos y UI | Specification Gate |
| DATA_MODEL.md | S-07/09/18; relacional limitado vigente, MT/CC/DEM/SUB anteriores requieren adaptación antes de su módulo | DG-TENANT/MIGRATION |
| ARCHITECTURE.md | S-08/18 y DEP-IND; MT/MC/G Mongo-Coolify conservados como antecedente | Design Gates |
| SECURITY.md | S-06/09/10; MT/MC/permisos/egreso/restore | Design Gates |
| TECH_STACK.md | S-11/18; runtime y cadena del alcance L1 acreditados, resto antes de su primer uso | Development Gate por alcance |
| UI_RULES.md | S-12; UI-A/D, semántica y accesibilidad | Specification / UI Design Gate |
| DESIGN_SYSTEM.md | S-12; UI-A tokens/patrones sobre stack existente | UI Design Gate |
| UI_SPEC.md | S-12; UI-B15contratos de pantalla | UI Design Gate |
| INTERACTIONS.md | S-03/05/06/12; UI-C estados críticos | UI Design Gate |
| ENGINEERING.md | S-11; ENG-01…05 y AGENTS | Development Gate |
| TESTING.md | S-13; matrices MT/MC/CC/DEM/SUB/UI y P1-L1 | Development / cada Phase Gate |
| ENVIRONMENT.md | S-14/18; Q-32/DEP-IND, entrada QA propia PostgreSQL 18.6 ARM64 acreditada; entornos posteriores pendientes, Mongo histórico no transferido | Development / Environment Gate por recurso |
| DEPLOYMENT.md | S-08/14/18; DEP-IND; [runbook legado](../DEPLOYMENT.md) conserva estado histórico | Diseño P0; ejecución Production Gate |
| ROADMAP.md | S-16 y ROADMAP presente, RG-001 aplicado y P1-L1 completada en su alcance aprobado | Integration Gate y baselines posteriores |
| DECISIONS.md | Registro presente con alcance/estado por ID; DEC-058/059 incorporadas | Cada gate correspondiente |

Ninguna de estas áreas se ha marcado NOT APPLICABLE al SaaS. README/DEPLOYMENT incluyen una nota explícita de SC-001 y preservan el runbook existente como histórico. SYSTEM_WORKFLOW, CHANGELOG y copilot-instructions mantienen contexto previo; divergencias en deuda.

CP-001 y su manifiesto SHA256SUMS.json son evidencia al commit 614a74c, no verificaciones recién ejecutadas. SOURCES y los documentos vivos pueden evolucionar: comprobar los hashes históricos contra ese commit, no atribuirlos al HEAD posterior. [Manifiesto CP-002](evidence/CP-002-SHA256SUMS.json) conserva la evidencia nueva por separado; la copia del Prompt mantiene el hash inmutable en ambas revisiones.

CP-003 reutiliza CP-002 y su manifiesto contra **973fbf31a039b9290278e9c0968b0e258e953af1**. CP-004 parte del HEAD comprobado **cbb16ce628ee081096bfbfe1bf236c017c26fcc4**, conserva las auditorías históricas y registra la aclaración directa actual: mensual/anual, descuento anual y demo limitada APPROVED. SE-001 corrige representación; fórmulas/condiciones DEC-026/027, activación y permisos siguen pendientes. No snapshots/capturas/tests duplicados, ni nuevos artefactos de baseline. SOURCES solo añade referencias para controles de demo; datos/mapa derivados reflejan P0 abierto.

CP-005 parte del HEAD comprobado **c9364688e07612eb172d0fcc03ef99d4ed73f0a9**. Completa lagunas concretas de DEC-012 en el mismo borrador: distribución/autoridad, revocación, conexiones/índices/atomicidad, mantenimiento/restore, comparación A/B y MT-V1…8. Lectura focalizada de código y fuentes primarias SRC-02/32…42, sin inventario remoto ni pruebas funcionales. Propuesta comercial y aprobaciones intactas; Quality Gate documental/mapa, sin promover diseño a baseline ni evidencia histórica a nueva.

CP-006 parte de **fcd93a809d907e06e2ce514f71437827c993c74a**, incorpora las decisiones directas del 7 y completa trabajo autónomo el 8. Catálogo DOP/15%/prepago, registro/30min/10-5-10 demo, arquitectura, operador/cuotas, cierres/crédito y activación ya confirmados. SC-002/003 registran ampliaciones con impacto; SE-001/SC-001/historia conservados. Recomendaciones restantes, matrices MC/CC/DEM/SUB y primer lote condicionado residen en los mismos borradores/tareas.

La ampliación humana permite evidencia experimental local, sin producto: [cash-plan](../.agentic/experiments/cp006/cash-plan.md), [economy-preregister](../.agentic/experiments/cp006/economy-preregister.md) y [demo-plan](../.agentic/experiments/cp006/demo-plan.md). Diez archivos KEEP, procesos terminados, sin DB/remoto/servicios; caracterización de función pura y modelos separados de las 90 pruebas históricas. No baseline nueva ni P1 iniciada. Fuentes SRC-43…58 públicas; no cuenta/contrato ni recuperación acreditados. El mapa deriva de siete documentos vivos y conserva todos los criterios históricos.


CP-007 parte de **31a854db72e6012cc26fcf17ead2287c107a5790**, incorpora el mensaje directo del 8 de octubre: modelo de cuotas y perfiles solo de ensayo DEC-028, gracia siete días DEC-034 y beneficiario individual DEC-035. Completa semántica de admisión, calendario con horas y prueba de derecho/historia como diseños propuestos. El registro único desagrega 13 paquetes anteriores en 32 pendientes sin duplicar respuestas; F14 se prepara y P1-L1 se divide en ocho cortes sin ejecutarlos. Solo documentación/mapa: sin nuevo experimento, tested_code_sha, cambio funcional o infraestructura. No SPEC CHANGE/ERRATA ficticios ni baseline materializada/aprobada.

CP-008 parte de **472b6853173d8fdee46e831ef32ada5319da5578**. SC-004 sustituye alcance persistente DEC-030/035 por cambio inmediato DEC-038; DEC-036 impide extensión recurrente por pago tardío y DEC-037 aprueba acceso posgracia. Q-02/11/31 completos como candidatos, calendario único/condiciones comerciales/permiso/recuperación para decidir. Registro29pendientes; Q-20 resuelta y Q-26/27/29 descartadas por alcance, nunca PASS funcional. SRC-59…69 consultas puntuales; no ensayos/remotos ni baseline/implementación. La revisión final F14 y aprobación conservan sus gates.

CP-009 parte del HEAD comprobado **3ec4c1ea5ab12fdff9c7be42864d708757e93be1**. Incorpora las respuestas del adjunto actual, cierra17IDs humanos y deja14pendientes de selección/presupuesto/condiciones nuevas/revisión/evidencia. Compara pagos AZUL/CardNET y copias B2/R2, verifica oferta pública Sentry/correo y calcula costes sin inventar volumen o tarifa privada. Candidato v0.9-CP009 con revisión F14 efectiva PARCIAL; no baseline ni implementación. Históricos CP-001…008, Prompt y experimentos intactos; Quality Gate proporcional y mapa local.

CP-010 parte de **f72bd2393e26eeaf97f6962baf520a71e50e356b**: revisa contratos completos Q-02/11/31, prepara mensajes externos y seis condicionesQ-38, refina recuperación y registra DEC-053/RG-001 como propuesta. QA-EXP-02 acredita Mongo nativo temporal/auth/aislamientoDB/transacciones y limpieza propios, no aplicación o entorno objetivo.15pendientes incluyendo orden opcionalQ-40; candidato v0.10/F14 parcial, sin baseline/implementación. Sin otra comparación de proveedores o pruebas históricas repetidas.

CP-011 parte de **4b2f272b197619c87e2dff0cd8578da6b9037041**. DEC-053/RG-001 APPROVED, Q40resuelta, dependencias aplicadas antes de primer uso/código/publicación. Candidato limitado S-18 v0.1-CP011 dentro de v0.11-CP011, con contratos selectivos anclados al GitCP010; no SaaS paralelo ni quince pantallas como precondición. Diagnóstico nuevo WSL/Docker negativo sin instalaciones; QA-EXP-02 histórico intacto.14pendientes(5BLOCKING L1/9FUTURE),53DEC(48APPROVED/2PROPOSED/3SUPERSEDED). F14-L1, entorno, A/B y F14global separados; mapa/QG local.

CP-012 histórico parte de **bf28c4538d9a511a79f3c297d7dffb207879f2ea** real. La decisión de ese checkpoint cambia gestión de Mecanet a mecanismo propio junto a Coolify (SC-005), confirma PostgreSQL (SC-006/054), UI cuadrada y NCF/e-CF (055/056), y autoriza implementación/QA condicional (057). El candidato v0.2 reemplaza mecanismos del lote sin heredar PASS Mongo ni requerir aprobar todo el SaaS. Inspección VPS/local solo en lectura; datos reales, producción, Nexora/Mecanet-EAK y Prompt conservados. A seguía pendiente y Q41 localizaba integración compartida; no código ni QA instalada entonces. El informe CP-012 separa revisión de coherencia, entorno, autorización y resultados futuros.

CP-013 histórico incorpora la aprobación humana exacta DEC-058 y el dominio comprado `mecanet.app` DEC-059/SC-007. La distribución pública landing/app/API sigue propuesta, sin DNS. Los ocho cortes de P1-L1 estaban en progreso con QA propia: PostgreSQL 18.6 ARM64, dos API, Nginx y worker, cinco contenedores bajo Compose independiente. HTTPS local `127.0.0.1:18443` → SSH → socket UNIX exclusivo; redes internas aisladas, sin listener TCP remoto ni Coolify como gestor. No se usa `.env` legacy ni datos reales. La entrada QA quedó acreditada; matriz integrada, ciclo y recuperación todavía no acreditaban cierre L1. El registro de ese checkpoint quedó en 14 pendientes: Q-35 BLOCKING de salida y 13 FUTURE; no otra aprobación humana de L1. Producción, Nexora, Mecanet-EAK, recursos actuales y Prompt conservados.

CP-014 parte de la base documental **5624ef0da489d2285534a942bd6ce9eab22f280d** y completa las cinco salidas parciales con QA sintética propia, conservando fixture/roles/restore CP-013 en su alcance histórico. Resultado **P1-L1 COMPLETADA, ocho PASS**, sin cerrar P1 general ni el SaaS. Código funcional D **0257d0d98d0c1444f0897bf4d03a36bb1a846ce2** idéntico en E/F; artefacto final F **b0f5e199e5df457d7f901ff3a3dca5ab3a8d5701**, controlador QA final **409880a513bee1eff909caf68d23325af55e9be4** sin cambio del artefacto F. Auth B/C/D, observación/navegador C, admisión D/E y rollback F/A/F conservan sus SHA/digests/provenance en [CP-014](audit/CP-014.md); no se atribuye un reensayo completo ni el restore histórico a F.

El [registro único](../.agentic/PLANNING_STATE.md) mantiene **14 pendientes,0 BLOCKING y14 FUTURE**,4 diseños/3 evidencias/5 decisiones humanas/2 externas, y59DEC intactas. Q-35 resuelve solo su fragmento L1; reauth sensible5min de DEC-045 queda antes del primer handler operador/P4 DG-ADMIN, no acreditada por las negativas de propósito L1. Próximo paso habilitado: revisión del checkpoint y paquete de Integration Gate local, sin PR nuevo, CI remoto, push, merge, baseline siguiente, otro lote o fase por extensión.

QA CP-014 termina con cinco contenedores propios **STOPPED**, sin URL activa; datos/configuración privada/artefactos propios retenidos. Cohorte CP-013 cerrada y hashes preservados; diez consumidores ajenos mantienen identidad, imagen y estado. Producción, Nexora, Mecanet-EAK, Coolify/proxy/DNS y Prompt se conservan. Aislamiento, inventario y cleanup finales se documentan en la auditoría CP-014; esto no acredita recuperación externa ni capacidad SaaS general.
