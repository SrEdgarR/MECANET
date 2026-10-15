# CP-021 — revisión del presupuesto de artefactos

**FAIL local: mínimo cerrado 2020 > 2000 artefactos.** No es un fallo de PostgreSQL ni autoriza una cota nueva. No se creó tar, ledger, contenedor, base, túnel o recurso QA.

El [JSON](artifact-budget-review.json) conserva SHA-256 por archivo, HEAD sólo leído, Node fijado v24.21.0, inputs, fórmulas y omisiones. El código aún en edición no se presenta como una release acreditada.

## Programa real contado

Se ejecutó `makeTargetConfigBundle` con el fixture sintético real de su test. Las fases se ordenaron mediante el export real `TARGET_PHASES`, no las claves alfabéticas de su objeto canónico. Hasta activation hay42 pasos: begin-enroll=3, rotate=18, canary=1, configure=5, clock-plan=1, post-worker-verify=6, promotion=7, activation=1. La rotación tiene18 roles.

Se cuentan cuatro programas hasta activation (main, allclosed, commit-interrupted y A5) y un prefijo hasta VERIFIED más una sola mutación de promoción:35 pasos. Total203 efectos distintos, sin abortos. Se añaden siete efectos SOURCE obligatorios: close B, initialize A/B/control, prepare clock, record clock y normal ACK. Son210 efectos/420 registros. Cada efecto usa before/after; cada registro carga dos artefactos, plan y head. Reconciliar el mismo operationId no duplica el efecto. El job separado del ACK perdido sí cuenta porque su FIN precede la nueva invocación.

## Cota inferior por llamadas reales

| Componente | Cargos mínimos | Derivación |
|---|---:|---|
| stage | 589 | 83 HEAD-selected sources + 8 known untracked selected sources + 494 installed runtime package files + 3 frozen UI assets + artifact.json |
| variant-preparation | 151 | 5 * 30 charged creations + shared variants directory |
| journal-plans-heads | 812 | 203 distinct effects * 2 records(intent/observed) * 2 artifacts(plan/head) |
| job-created-output-end | 135 | 45 jobs * 3 charged files |
| journal-locks-and-logs | 45 | 40 run jobs * 1 lock + 5 initial target journal logs |
| phase-and-invocation-configs | 84 | 39 stable phase configs + 45 invocation files |
| successful-phase-receipts | 39 | 39 successful run phase receipts; failed ACK attempt excluded |
| minimum-mailbox-publications | 90 | 45 jobs * 2 publications before START; all watch-loop samples excluded |
| source-bootstrap-control-journal | 28 | 7 fixed SOURCE effects * 2 records * 2 artifacts(plan/head) |
| source-bootstrap-jobs-only | 27 | 9 exported SOURCE_PHASES * minimum 1 job * 3 Root files (plan-selection jobs excluded) |
| target-segmented-config-publications | 20 | 5 configs clock-plan jobs * 4 files(api1/api2/worker/acceptance) |
| **Total** | **2020** | **Excede en 20, con muchas omisiones conservadoras** |

Stage: 83 fuentes de HEAD, 8 nuevas fuentes locales conocidas, 494 archivos de dependencias instaladas, tres assets UI y el manifiesto. Se enumeraron nombres con el selector real; no se creó paquete ni se acreditó closure de una futura release. El cargo es literalmente `len(members)`.

El proveedor actual carga30 creaciones por variante más el padre compartido. Incluye directorios porque las llamadas actuales los cargan; el informe no quita cargos. `artifactFiles` es acumulado: retirar locks o jobs tras FIN no devuelve presupuesto. Los dos mailbox por job se publican antes de START; todas las muestras posteriores se omiten.

El mínimo SOURCE sólo cuenta un job por cada fase exportada; selección del plan y otras invocaciones quedan fuera. Los configs clock-plan publican tres configs segmentados y acceptance por cada uno de los cinco programas TARGET. Se omiten todos los abortos, assemblers/bundles, creación/FIN de servicios, readiness vacío, HTTP/browser, fault probes extra, negativas, TLS y metadata inicial. El subtotal que omitía estos tres componentes obligatorios era1945, por sí solo insuficiente para declarar FAIL; el resultado entregado2020 sí supera la cota por llamadas comprobadas.

## Otras cotas y riesgos residuales

- Journal: mínimo incompleto420/1000; falta SOURCE final, abortos y reintentos. No es PASS del presupuesto completo.
- SQL8192/caso y200000 global: fondo sano nominal CP0203975 por45s y159000 por1800s; quedan41000 nominales para control, HTTP, DDL, probes, fallos y reintentos. Es dimensionamiento, no máximo ante conflictos ni prueba de capacidad.
- HTTP300: no hay aún una lista integral ejecutable de todos los jobs nuevos. NOT VERIFIED.
- Tiempo:45s desde el primer cargo, sin reset por fase. Precustodia y cinco copias comparten el inicio original de `copy-verify`; no hay throughput ni latencia física acreditados. NOT VERIFIED.
- Disco: main y cinco variantes implican6D; cinco negativas KEEP elevan a11D más metadata. Tras reserva4MiB, D debe ser inferior a185.82MiB antes de otra metadata. Root debe medir todo lo retenido con los consumidores detenidos; el input sellado suma variantes/metadata a main/negativas observados. Medición real NOT VERIFIED.

## RESUMEN PARA AUDITORÍA

CONFIRMED local: al menos 2020 artefactos frente a2000 en el código contado. Environment no puede declararse PASS. NOT VERIFIED: SQL/HTTP/journal/tiempo/disco integrales, PG, HTTP, GUI, recuperación y salidas físicas. Próximo gate: reducir trabajo o materializaciones reales conservando custodia, closure, journal y pruebas; repetir por nuevos SHA antes de Quality/Environment/preflight. No se propone una ampliación automática de otra cota. El JSON conserva las correcciones de los borradores internos de orden y subtotal anteriores a esta entrega.

## Ampliación conservadora del programa completo

El mínimo2020 anterior omite trabajo obligatorio visible. La siguiente ampliación suma llamadas separadas y conserva omisiones; todavía no es una cota superior que garantice terminar.

| Componente adicional | Cargos | Derivación |
|---|---:|---|
| source-bootstrap-config-jobs | 27 | 9 source-config jobs * 3 Root files; these are separate from 9 atomic source jobs already counted |
| source-bootstrap-templates-plan-result | 36 | 9 templates + 9 fresh atomic invocation files + 9 selected plans + 9 run receipts |
| source-bootstrap-journal-locks | 9 | At least one journal lock publication per each of 9 atomic source jobs; initial journal log extra excluded |
| source-prepare-fixtures | 12 | 3 prepare jobs * (Root created/output/end3 + published source-stage fixture1) |
| initial-custody-tls-config | 38 | 4 ledger/owners/preflight + 6 material/master/ref/alias/job files + 28 source/target TLS/config/compose files |
| target-assembly-minimum | 50 | 5 assemble jobs * (Root job3 + input config1 + host prepare receipt1 + material/capture2 + header/index/chunk minimum3) |
| postgres-custody-and-end | 22 | Main PG reference+SID2; 5 variant PGs each provider ref, bridge PG ref, SID and stop receipt4 |
| runtime-service-references-inventories | 49 | 17 main/variant standard service refs + 13 provider variant service refs + 18 immutable/current inventory writes + main runtime directory1 |
| target-stop-end-minimum | 35 | 5 programmed target service cohorts * (stop immutable/current2 + end input1 + Root job3 + Node END pair1) |
| empty-readiness-minimum | 26 | 4 bounded readiness jobs * Root3 + 4 job inputs + 3 segmented configs + prepared/completed/clock proof3 + 4 empty service refs |
| main-http-acceptance | 12 | 3 target acceptance modes * (Root job3 + report1) |
| browser-known-artifact-reservations | 6 | browser-login1 + browser-replay5; other screenshot/report artifacts excluded |
| copy-and-journal-negatives-minimum | 17 | Copy-negative cfg1, Root job3, plans5, report1, footprint1; journal-negative cfg1, Root job3, plan1, report1 |
| main-abort-three-phases | 55 | 7 extra effects*4 journal artifacts28; 3 jobs*3 Root files9; 3 stable+3 invocation configs6; 3 locks; 3 receipts; 6 initial mailboxes |
| **Total ampliado, sin muestras periódicas** | **2414** | **Exceso414; aún hay omisiones** |

Se detectan53 archivos bajo test/tests/example/examples dentro de las494 dependencias seleccionadas. Excluirlos exigiría demostrar closure, imports/exports y provenance del paquete resultante, preservando licencias/locks. El ahorro máximo39 del primer archivo de invocación propuesto por Root daría2322 cargos incluso con esa poda, antes de las omisiones. Un hipotético descuento de los96 cargos actuales de directorios todavía dejaría2226; este informe no cambia esa política ni aplica un descuento.

Siguen fuera SOURCE finales/live/FIN, copia main, reinicio de reloj, pruebas de credenciales/schema, metadata extra del fallo COMMIT, los nuevos planes/inventarios HTTP por variante, otros abortos, browser adicional y toda publicación de mailbox del polling. Con1800s compartidos, una cadencia cada500ms ilustra3600 muestras: no es un máximo formal ni una predicción de latencia. Falta contar redondeos por job, publicaciones iniciales y otros productores. Reducir sólo paquetes de ejemplo y configs iniciales no cierra el presupuesto con margen. Hace falta un plan de invocaciones/materializaciones realmente más pequeño, probado con las mismas garantías y contadores, antes de autorizar recursos.
