# CP-018 — revisión focal del candidato P1-L3

**PASS DE REVISIÓN DOCUMENTAL DEL DISEÑO CORREGIDO;0 críticos/0 REQUIRED abiertos.** No aprobación humana, baseline ejecutable, Development/Environment PASS ni aceptación funcional. Los seis criterios de salida L3 permanecen **NOT VERIFIED**. P1 única activa, P0 PARCIAL/RG-001, SaaS general NOT APPROVED; A/B L3 pendientes.

Objeto leído íntegro inicialmente: [.agentic/P1-L3_CANDIDATE.md](../../../.agentic/P1-L3_CANDIDATE.md), v0.2-CP018, SHA-256 `a7dfe9dbe530f9e3d506b1a892869d1bcc792749cd180008dcb1bbf7754eec76`,43327 bytes. Versión corregida revisada en su delta y conjunto coherente: `4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec`,44202 bytes. No se reetiqueta la primera revisión como PASS anterior a las correcciones.

Revisor: l2_ui, diferente de root, autor de v0.2. Se declara participación previa del revisor en la preparación/revisión v0.1-CP017: esta independencia corresponde a la versión nueva de otro autor, no a ausencia absoluta de participación histórica en L3. Se aplicó `agent-skills:code-review-and-quality` sobre corrección, claridad, arquitectura, seguridad, límites y evidencia. Sólo este informe se escribió; sin edición de candidato/modelo/producto/cánones, Git, SSH, secretos o infraestructura.

## Hallazgos y correcciones conservados

| ID | Severidad inicial / disparador | Corrección y verificación final | Estado |
|---|---|---|---|
| IND-R1 | REQUIRED de evidencia abstracta. `model.mjs:ready` inicial usaba `!s[k]` como ausencia aceptable, sin roster esperado/carga completa. En un estado promovido, omitir A dejando B cerrada permitía ready=true; el positivo vacío borraba A/B sin declarar un inventario inicial vacío distinto. Contradice el candidato§5 y la negativa de omisión de L3-A4. | Root añadió expectedTenants/expectedAnchor custodiado, loadedTenants/loadComplete e igualdad exacta/única con estados presentes. Cero legítimo declara explícitamente tres conjuntos/anchor vacíos con carga completa. Omisión, duplicado, carga fallida, extra y vacío por error rechazan. `ignore-expected-roster` conserva contraejemplo, y `--unsafe-roster` permite sensibilidad del guard. Revisor leyó la corrección y contrastó fuente/informe; no ejecutó PostgreSQL ni reescribió resultados. | RESUELTO en fuente/evidencia abstracta; ejecución funcional NV. |
| Correcciones de peer SQL comunicadas por root, no hallazgos propios atribuidos ni IDs nuevos | La incorporación al contrato único debía transportar elegibilidad/razón/binding físico local y precisar consumo RESTORE ante el predicado real que considera `active` entre generaciones. | Delta4d1 añade eligibility/closedReason/sourceResourceHash/targetResourceHash a guarda local y firma configure_recovery. Define RESTORE individual de A, B cerrado por TENANT fuera de ese RESTORE; una restricción global no se consume parcialmente. Sólo IDs operativos RESTORE de este run/ACK pasan active=false en el COMMIT final, manteniendo guardas/generation/epoch y antes/after/proof; TENANT/sujetos quedan intactos. Contraste con `validate_write_authority` confirma por qué dejar RESTORE activo e ignorarlo mediante otro registro sería insuficiente. | RESUELTOS documentalmente por root/peer SQL y corroborados; sin SQL implementado. |
| Copia/index del delta root | Compatibilidad entre manifiesto superior acotado y lista física completa de archivos. | Índice separado≤4MiB/10000 archivos, vinculado por hash al manifiesto≤256KiB. Límites de artefactos/footprint no son prueba de tamaño/capacidad; Environment y aceptación física siguen requeridos. | Diseño aclarado; presupuesto físico NV. |

IND-R1 no es vulnerabilidad ejecutada del producto ni revocación de PASS L2. El modelo inicial13 casos/40 estados/230 aristas/4 mutantes no acreditaba la distinción roster vacío/omitido. La evidencia corregida14 casos/40 estados/230 aristas/5 mutantes tiene su propio hash; sólo a ella corresponde el cierre del hallazgo. El resto de riesgos concretos se asigna a gates posteriores sin retirar una garantía crítica del diseño.

## Contraste de diseño y código real

El [snapshot L2](../../specs/p1-l2-approved/baseline.md), ca975dc…, exige restore CLOSED y no reapertura. La propuesta L3 preserva intención/hash/actor/operación/dataEpoch históricos, cuotas/reservas, ticket original y restricciones; ningún nuevo generation vuelve ejecutable una operación anterior. CP-017 fuente29/29 queda STOPPED/KEEP; positiva L3 exige fixture NUEVA con margen antes del backup. L3 no aprueba POS, precios, fiscalidad, pagos, recursos compartidos ni decisiones comerciales por extensión.

`writes/service.js` llama hoy `saas.writer_readiness`;003 exige schema2 y OPEN. `authority.js` y el coordinador tienen dependencias de generación/schema y promoción normal. Candidato§4/9 reconoce explícitamente ese delta:006 aditivas/schema3, predicado restrictivo único entre generaciones, runtime_guard y rechazo de bypass normal. Estas funciones nuevas no existen ni están probadas por esta revisión; preservar hashes001…005 no significa que schema3 ya sea compatible. Un binario schema2 que rechaza se conserva cerrado; rollback compatible o forward fix requieren su ensayo, nunca downgrade ficticio.

Admisión global permanece cerrada durante configuración y ventana localOPEN/centralCLOSED. Activación final central revalida conjunto y restricciones y liga estados/barrier/run en un COMMIT; no 2PC ni lock central durante I/O empresarial. Custodia write-ahead/una-vez, before/after exactos, fin positivo y abortVersion monotónico impiden convertir ausencia de ACK/TTL en apertura. SQL no acredita filesystem/host por recibir un hash: controlador y pruebas ligadas a recurso/owner/generación son parte explícita del protocolo.

Readiness separa servicio y permiso:200 puede ser legítimo con roster inicial vacío declarado, o todos RESTRICTED_CLOSED conformantes; no exige≥1OPEN ni concede acciones. Elegible todavía CLOSED, carga parcial, combinación de versiones o cierre/recovery UNKNOWN producen503. B bloqueada sigue denegada antes de pool/efecto. El observador central acotado no abre pools empresariales; respuesta pública no revela IDs/conteos/grants/motivos. Nginx estático/proxy_next_upstream off y health no disparan promoción o reinicio.

Roles privados/NOLOGIN/search_path/PUBLIC revocado, material fuera del cluster y sin mount maestro en API, cohortes/redes/volúmenes propios y PG activo secuencial respetan la arquitectura existente. Presupuestos y umbrales se presentan SUGGESTED, no capacidad medida. Cotas incluyen retry/observaciones; superación aborta sin ampliar cuotas o modificar consumidores ajenos. Se comprueba diferencia entre fin de efectos, recursos y procesos; un fence CLOSED no sustituye fin HTTP/SQL.

## Matriz por criterio: diseño distinto de función

| Criterio | Revisión Design/F14 del contrato | Aceptación funcional | Evidencia y límite |
|---|---|---|---|
| L3-A1 | PASS de coherencia documental | NOT VERIFIED | Objeto único, seis criterios, I1…8/impacto y A/B separadas; modelo abstracto corregido y revisado. No READY FOR DEVELOPMENT por este PASS. |
| L3-A2 | PASS de diseño de integridad/cierre | NOT VERIFIED | Manifiesto/índice/journal/cabeza externa/fin y bindings source-target explícitos; corruptelas/copia/replay requieren fixture PG real. |
| L3-A3 | PASS de diseño de custodia/continuación/reloj | NOT VERIFIED | Material estable, intents fsync, observación before/after y transferencias preregistradas; fsync/ACL/SCRAM/COMMIT/reinicio reales no ejecutados. |
| L3-A4 | PASS de contrato readiness/promoción | NOT VERIFIED | Roster cero/allclosed no confunden omisión; RESTORE A-only, barrera única y restricción concurrente/abort monotónico. Modelo no prueba locks, functions006 ni HTTP200/503. |
| L3-A5 | PASS de recorrido propuesto | NOT VERIFIED | Margen prebackup, actor original con sesión nueva, resultados históricos/201 y negativas por contexto; dos API/navegador/stock/audit posteriores pendientes. |
| L3-A6 | PASS de diseño de verificación/reversión | NOT VERIFIED | Regresiones por delta/rollback cerrado/cotas/cleanup/CI por fuente e Integration antes de TERMINAL. Sin recursos/review de código nuevo/CI L3 ejecutados. |

Design Gate final de root puede usar esta revisión documental; no reemplaza Specification/A humana, B diferenciada, Development/Environment antes de código/recurso o Phase/Integration Gate posteriores. Preparación P2 y servicios externos conservan sus propios resolve-before. No se crean gates o aprobaciones nuevas.

## Evidencia, hashes y provenance

Entorno del revisor: lectura LOCAL Windows/PowerShell, sin ejecutar modelo o módulos de producto. Root ejecutó el modelo bajo su plan previo en Node24.21.0 Windows x64; el revisor comprobó que results.modelSha256 coincide con la fuente corregida y que su reporte declara ausencia de PG/HTTP/browser/restore físico. Resultado abstracto fechado `2026-10-13T23:57:39.681Z`; reporte7473…:14 casos,40 estados,230 aristas,5 mutantes. Ninguna propiedad física se cierra por esos números.

| Entrada revisada | SHA-256 |
|---|---|
| Candidato inicial completo | `a7dfe9dbe530f9e3d506b1a892869d1bcc792749cd180008dcb1bbf7754eec76` |
| Candidato corregido | `4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec` |
| Modelo inicial leído | `a22befb8e11be7182128699885b2af595c6cd6df7e975993c331caa9caeaeda0` |
| Reporte inicial leído | `49746141fe4d010447592ed888955b23969af9864a6b08315308f7827c5adcc7` |
| Modelo corregido | `f211a552ee872f4bc49ae2d75ec215fa7b3748301c28460625c15aaa3188b414` |
| Reporte corregido | `7473aada512364f46b060c1277c5552da2d9cf9a84c47bb4f87c9a05827fc578` |
| Plan previo observado tras corrección | `a59b32deb0061b34dccf55fd0919473bf69a52181fa98f0d83a0379ccc8e9f7e` |
| Propuesta SQL | `26a3db9f6acf02b28af4d5c2347e2746444bca1dfd892b0c94a51d2d9ef2918f` |
| Propuesta readiness/custodia | `11e377fe5fd148a4a7bd788d667a5a318c3fb2f0e087f3dca2ebfe19ba221983` |
| Snapshot L2 protegido | `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71` |
| Prompt Maestro protegido | `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d` |
| service.js / coordinator.js | `6643afd4dfcbd2ba7ae5efeabe05206f920c36cf6280d6e07d22f43a641751da` / `ae14c70b24eefca6a6f30b5981cc2dea56811ee16456fe7b44c03d9484ca39f4` |
| authority.js / clock.js | `5ecc04bdbb570f40a9bac6a2a370676bc37e74e547cc3fa9687d281e34baebdb` / `08e9d880a2445e5daf3a034d6e00c03f535e278c37a2a549f84f8b1cb98aa0d9` |
| transfer.js /003-control-writers.sql | `4b28e40ad72792f5314e1ccbb7c37a7f2cb9210bef573a102e3955795b4782e8` / `c5036db5fd1a71ea94e7d7feee25e299dcb074e25108465304ac6dff92955d07` |

Base/rama REPORTED por root: `86985fe7589032f202ebf0cb057a9b1384217151`, `codex/p1-l3-design`, worktree `C:/Users/thede/.codex/worktrees/p1l1-integration/MECANET-develop`. No consulta Git/HEAD del revisor, tested_code_sha nuevo, checkpoint propio o SHA autorreferencial. Código probado/evidencia física CP-017 conservan su fuente y no se transfieren a esta propuesta.

Veredicto limitado: **revisión documental PASS después de las correcciones identificadas**, sin REQUIRED abierto confirmado. A/B siguen pendientes y los seis criterios funcionales NV; no SQL, servicios, CI, build, browser o recursos nuevos. No modificación de Prompt ni defecto de metodología nuevo confirmado; R1 era carencia de evidencia, no AUD inventado. Root mantiene cánones/mapa/cierre y decide F14 del objeto final por hash.
