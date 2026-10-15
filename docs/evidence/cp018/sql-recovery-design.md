# CP-018 — propuesta SQL de recuperación y promoción

**SUGGESTED / NOT APPROVED; diseño únicamente.** Lectura LOCAL sobre la base `86985fe7589032f202ebf0cb057a9b1384217151`, comunicada por el coordinador, en `codex/p1-l3-design`. El revisor no ejecutó Git, SSH, PostgreSQL, migraciones, ensayos, builds ni servicios; no leyó configuración privada. Este documento alimenta el candidato único que integra root; no constituye una segunda baseline aprobada ni declara Design Gate PASS.

Se leyeron íntegros el [candidato L3 previo](../../../.agentic/P1-L3_CANDIDATE.md), su [peer CP017](../cp017/review-next-lot.md), la [baseline L2 protegida](../../specs/P1-L2.md) y su snapshot, y §§5.1/8/9 del [Prompt Maestro](../../methodology/Prompt_Maestro_v2.0.md). Se conserva P1 única activa, P0 PARCIAL, SaaS general NOT APPROVED, CP017 STOPPED/KEEP y todas las decisiones comerciales. A/B L3 siguen pendientes. Todas las verificaciones físicas que siguen son **NOT VERIFIED**.

## 1. Estado real y REQUIRED que debe cerrar el candidato

| ID de revisión local, no nueva Q/DEC | Carencia exacta del candidato CP017 | Resolución propuesta antes de A/implementación |
|---|---|---|
| SQL-R1 | No hay registro durable de recovery en el runtime. `admission_fence.barrier` existe; un `recovery_barrier` independiente no existe. La copia no identifica por sí sola otro recurso | Registro completo A/B, manifest/custodia/recursos, guardas esperadas y CAS; enlazar la barrera existente al recovery |
| SQL-R2 | El coordinador normal puede reabrir LOGOUT/IDENTITY/MEMBERSHIP/GRANT y `resumeOperationalBarrier` admite incluso TENANT. No es un preparador seguro de recovery por extensión | Preparador privado específico; prohibir que un callback genérico de promoción consuma TENANT o una restricción ajena al recovery |
| SQL-R3 | `authority.js` filtra restricciones por generación; `validate_write_authority` observa las activas sin ese filtro. Una RESTORE antigua activa puede bloquear el writer, y una restricción de sujeto no debe perder eficacia al cambiar generación | Semántica única de tombstones y lista cerrada de RESTORE consumibles; conservar los sujetos/grants/guardas históricos |
| SQL-R4 | `recovery.mjs` es un ensayo cerrado con candidatos aleatorios y DML privado, no un procedimiento canónico reanudable de apertura. Falta clasificar COMMIT perdido y el intervalo local OPEN/central CLOSED | Material write-ahead elegido una vez; tabla de estados observables y continuación sin recapturar una versión o regenerar secretos |
| SQL-R5 | Schema 2 está codificado en autoridad, coordinador, pools y helpers. Abrir schema 3 con los consumidores anteriores no tiene PASS | Migraciones nuevas006; contrato explícito schema 3, BIGINT como cadenas, compatibilidad/refusal y regresiones del delta |

Estos REQUIRED son lagunas de **diseño L3**, no revocación del PASS limitado de L2. No se modifican003/004/005 aplicadas, Prompt, snapshots, producto o infraestructura. La incorporación coherente al candidato y el peer de ese candidato preceden su aprobación humana.

## 2. Invariantes y decisión de clasificación propuesta

1. Recuperar **todo el conjunto manifestado A/B**, registrar y verificar ambos; promover únicamente A. B permanece bloqueada, local/central CLOSED, TENANT ACK y tombstones efectivos. No es suficiente omitir B de readiness.
2. `generation`, `data_epoch`, hash, actor, acción, ticket, dueño e intento de `write_intents`, y época/resultados de `inventory.operations`, permanecen históricos. Nunca remapearlos a la generación o época del destino para reejecutar. PK/idempotency namespace no se reinician.
3. Sólo cambian las guardas **actuales** de `tenant_writer_state`, `tenant_directory`, `inventory.writer_fence`, admisión/reloj y los registros nuevos de recovery. Época/versión de credencial avanzan exactamente una vez desde el material custodiado; no desde el último valor leído para adoptar un estado desconocido.
4. No hay transacción atómica entre central/A/B. Mientras se configuran/promueven DB separadas, `global_blocked=true` y `admission_fence.barrier=true`. Un fence local OPEN no basta para registrar/reclamar una intención nueva.
5. Fin de efectos, fin de recursos y fin de procesos son propiedades separadas. Source se copia sólo con todos los fences CLOSED, cero intención no terminal, reservas SETTLED/tickets terminales y pruebas positivas de fin de HTTP/SQL/worker. Ninguna ausencia, timeout, TTL o booleano del cliente reemplaza esas pruebas.
6. Ready del **servicio** puede ser200 con cero OPEN si todos los tenants esperados están legítimamente CLOSED/clasificados y recovery global concluyó. No equivale a permiso de negocio. Un UNKNOWN operacional, hueco de journal o cierre sin prueba mantiene503. Esto sustituye como propuesta el requisito previo «al menos uno OPEN», sin aprobar silenciosamente el cambio de readiness.

La QA L3 propuesta tiene exactamente A/B. Una función pura puede comprobar un conjunto vacío declarado/custodiado, pero ese caso no sustituye ninguna aceptación de esta fixture ni autoriza provisión de tenants.

## 3. Migraciones aditivas y filas propuestas

`006-control-recovery.sql` y `006-tenant-recovery.sql`, versiones/hash/registro por DB; futuro `tenant_directory.schema_version=3`. Inicializar la **nueva fuente L3** con006 y artefacto candidato después de A/B/gates, antes de sus operaciones y backup. No aplicar006 a CP017 para conseguir otro positivo. La copia incluye los registros006; no hay migración automática al arrancar API.

Todas las UUID son canónicas, hashes SHA-25664 ASCII, enteros `bigint` no negativos/positivos según campo y DTO de entero como cadena decimal. Campos/ref técnicos acotados; ningún cuerpo, stock, SKU, motivo, sesión/cookie, password o JSON libre entra en estas tablas.

| Tabla propuesta | Campos y restricciones relevantes |
|---|---|
| `saas.recovery_runs` | `id uuid PK`, `controller_owner uuid`, `source_generation`, `target_generation`, `manifest_hash`, `journal_hash`, `custody_hash`, `source_resource_hash`, `target_resource_hash`, `end_proof_hash`, `expected_tenants uuid[]` ordenados/únicos, `restore_restriction_ids uuid[]` ordenados/únicos, `seed_clock_owner`, `initial_worker_clock_owner`, `current_clock_owner`, `clock_transfer_id`, `clock_transfer_hash`, `stage`, `version bigint>0`, `global_blocked boolean`. Un único recovery activo por destino; IDs, conjuntos, generaciones y hashes iniciales inmutables. Sólo helpers CAS cambian stage/version/owner actual/id-hash de transferencia/bloqueo |
| `saas.recovery_tenants` | PK `(recovery_id,tenant_id)`, FK run/directorio; `source_generation`, `source_epoch`, `source_closed_version`, `target_generation`, `target_epoch=source_epoch+1`, `closed_version=source_closed_version`, `open_version=closed_version+1`, `eligibility=OPEN_ELIGIBLE/RESTRICTED_CLOSED`, `closed_reason`, estados esperados de directorio, referencias lector/writer objetivo y versiones exactas `before+1`, `restore_restriction_id` nullable, `guard_hash`, `proof_hash`, `stage`, `version`. La elegibilidad se fija después del replay final; no puede elevarse por conveniencia |
| `inventory.recovery_guard` | Singleton precreado `id=1`, `tenant_id`, `recovery_id` nullable sólo en NORMAL, `manifest_hash`, `target_resource_hash`, `controller_owner`, source/target generation/epoch, closed/open version, eligibility/closed_reason, proof_hash, stage/version. No FK a otra DB. Su imagen exacta corresponde a la fila central manifestada |
| `saas.admission_fence` | Añadir `recovery_id` nullable y FK local al run. Se reutiliza `barrier`; no segundo mecanismo booleano desconectado. NORMAL tiene null; target se liga al run antes de cualquier cambio generacional |

Stages globales: `PLANNED → CONFIGURED → CLOCK_ACQUIRED → VERIFIED → PROMOTING → COMPLETE`; salida restrictiva `ABORTING → ABORTED_CLOSED`, sin volver atrás. Stages por tenant: `ENROLLED → CLOSED_CONFIGURED → VERIFIED → PROMOTING → LOCAL_OPEN → SEALED` para A; B omite apertura y llega a `SEALED` conservando CLOSED. Source `recovery_guard=NORMAL` no declara recovery concluido.

Las guardas esperadas están presentes en el material privado **antes** de insertar el run. Funciones rechazan campo/contexto desconocido, una colección distinta, overflow o una imagen que no sea exactamente before/after de la etapa. No aceptan `verified=true` desde HTTP.

**Crecimiento, SUGGESTED:** mantener techos16MiB/2MiB y las cuotas de la fixture, sin ampliarlos. Central incluye run/filas por tenant en `write_barrier_cost`, con cota por fila4096+256 y margen terminal4096. No historial SQL ilimitado: continuación del mismo paso no inserta otra fila. Precrear el singleton local y contabilizar su reserva técnica fija4096+256 al inicializar006 en la fuente nueva; añadirlo a `logical_usage` con representación lógica constante y tamaño real≤4096. Cargar ese delta una sola vez en la transacción de migración, verificando `used_after=used_before+delta`, no asignar cero ni reconstruir para borrar deuda. Después del backup su actualización no reduce ni reinicia QL; productos/operaciones/windows/QH/QC/Qt permanecen intactos. Medición SQL/costas nuevas son NV y deben demostrar esta representación antes de salida; si no cabe, aborta cerrado, no purga registros.

## 4. Firmas privadas propuestas y semántica

Firmas **de diseño**, no funciones existentes. Owner NOLOGIN, `search_path=pg_catalog,saas` o `pg_catalog,inventory,catalog`, nombres cualificados, no SQL dinámico y EXECUTE revocado a PUBLIC. API/writers/readers/issuer no reciben preparador ni ALTER ROLE. Reutilizar maintenance privado existente para EXECUTE acotado; provisioning/rotación cluster queda en preparador offline propio con allowlist de roles de la cohorte, sin montar bootstrap en API/web/worker normal.

```sql
saas.begin_recovery(
 p_id uuid,p_controller uuid,p_source_gen uuid,p_target_gen uuid,
 p_manifest text,p_journal text,p_custody text,p_source_resource text,
 p_target_resource text,p_end_proof text,p_tenants uuid[],
 p_restore_ids uuid[],p_seed_owner uuid,p_worker_owner uuid
) RETURNS SETOF saas.recovery_runs;

saas.enroll_recovery_tenant(
 p_run uuid,p_controller uuid,p_tenant uuid,p_source_epoch bigint,
 p_closed bigint,p_target_epoch bigint,p_eligibility text,
 p_target_directory_status text,p_reader_version bigint,p_writer_version bigint,
 p_reader_ref text,p_writer_ref text,p_restore_id uuid,p_guard_hash text
) RETURNS SETOF saas.recovery_tenants;

inventory.configure_recovery(
 p_run uuid,p_controller uuid,p_manifest text,p_tenant uuid,
 p_source_gen uuid,p_target_gen uuid,p_source_epoch bigint,
 p_target_epoch bigint,p_closed bigint,p_eligibility text,
 p_closed_reason text,p_target_resource text,p_guard_hash text
) RETURNS SETOF inventory.recovery_guard;

saas.record_recovery_tenant_proof(
 p_run uuid,p_controller uuid,p_tenant uuid,p_phase text,
 p_expected_run_version bigint,p_expected_tenant_version bigint,p_proof_hash text
) RETURNS SETOF saas.recovery_tenants;

saas.configure_recovery_control(
 p_run uuid,p_controller uuid,p_expected_version bigint,p_config_proof text
) RETURNS SETOF saas.recovery_runs;

saas.record_recovery_clock(
 p_run uuid,p_controller uuid,p_expected_version bigint,
 p_expected_previous_owner uuid,p_next_owner uuid,
 p_transfer_id uuid,p_transfer_hash text,p_proof_hash text
) RETURNS SETOF saas.recovery_runs;

inventory.prepare_recovery_open(
 p_run uuid,p_controller uuid,p_expected_version bigint
) RETURNS SETOF inventory.recovery_guard;

inventory.verify_recovery(
 p_run uuid,p_controller uuid,p_expected_version bigint,p_proof_hash text
) RETURNS SETOF inventory.recovery_guard;

inventory.seal_recovery(
 p_run uuid,p_controller uuid,p_expected_version bigint,p_proof_hash text
) RETURNS SETOF inventory.recovery_guard;

saas.prepare_recovery_promotion(
 p_run uuid,p_controller uuid,p_expected_version bigint
) RETURNS SETOF saas.recovery_runs;

saas.activate_recovery(
 p_run uuid,p_controller uuid,p_expected_version bigint,p_activation_proof text
) RETURNS SETOF saas.recovery_runs;

saas.begin_recovery_abort(
 p_run uuid,p_controller uuid,p_expected_version bigint,p_abort_id uuid
) RETURNS SETOF saas.recovery_runs;

inventory.abort_recovery(
 p_run uuid,p_controller uuid,p_expected_version bigint,p_abort_id uuid
) RETURNS SETOF inventory.recovery_guard;

saas.complete_recovery_abort(
 p_run uuid,p_controller uuid,p_expected_version bigint,p_abort_proof text
) RETURNS SETOF saas.recovery_runs;

saas.recovery_runtime_guard(
 p_generation uuid,p_run uuid,p_manifest text
) RETURNS boolean;
```

- `begin_recovery`: sólo destino exclusivo y cerrado, source tuple/gen/manifest exactos, cero recursos pendientes, conjuntos custodiados; crea run PLANNED y liga `admission_fence.recovery_id` dejando barrier true. Mismo ID/cuerpo devuelve la misma fila; distinto cuerpo es conflicto. No se apropia de otro controller por timeout.
- `enroll`: verifica source directorio/fence y versiones originales; inventario total A/B, la fila se crea antes de actuar sobre esa DB. Sólo A cuyo estado/restricciones finales lo permiten puede ser OPEN_ELIGIBLE. TENANT/demo/estado ajeno da RESTRICTED_CLOSED; un snapshot pendiente no se transforma en legítimo cierre.
- `configure_recovery` local: bloqueo exclusivo del writer_fence, comprobar CLOSED/source tuple/versión y tenant_id ya precreado; comprobar que eligibility/closed_reason/resource binding son los del material y fila central previamente inscritos, mediante el controlador privado. Cambiar únicamente generation/epoch a los valores elegidos, conservar closed_version y toda la historia. Same-run/after-image exacta es replay; otra imagen falla sin corregirla automáticamente. SQL local no puede por sí solo comprobar una FK al directorio central ni que un hash de recursos corresponda al host; esa parte requiere la prueba del controlador antes de llamar.
- `record_recovery_tenant_proof`: el controlador privado valida realmente roles/ACL/migraciones/integridad/conexiones/guardas y prueba de fin antes de esta llamada. Almacena hash por phase allowlist `CLOSED_CONFIGURED/VERIFIED/LOCAL_OPEN/SEALED/ABORTED_CLOSED`, comprueba stage/versión de run y tenant y guardas esperadas; no considera que un hash por sí solo demuestre el mundo externo. El último VERIFIED puede avanzar el run CLOCK_ACQUIRED→VERIFIED si todo el conjunto cumple; incrementa su versión dentro del mismo COMMIT y devuelve la imagen resultante. No recaptura una versión desconocida del caller.
- `configure_recovery_control`: exige todos los locales CLOSED_CONFIGURED y custodia completa. Una transacción configura directorio schema3/ref/versión/epoch, states nuevos CLOSED, fence/time_authority nueva gen y seed_owner, clock_version exactamente previous+1, tick preservado y todas las session_registry antiguas revoked. A queda draining; B sigue blocked. Barrera y run siguen bloqueados. No cambiar security_version/grants a active ni guards históricos.
- `record_recovery_clock`: comprueba transferencia materializada y owner/gen/tick/version reales de fence/time_authority concordantes. Initial acquire usa el owner privado elegido; restart requiere nueva transferencia custodiada con expectedPreviousOwner y prueba positiva de fin del proceso/SQL anterior. Guarda el owner actual observado y hash de transferencia, nunca adopta «el que encontremos».
- `prepare_recovery_promotion`: requiere conjunto total VERIFIED, fuente OFF y clock/custodia coherentes. Para elegibles prepara central CLOSED/open_version exacta; B no aumenta versión para simular apertura. Mantiene barrera y pasa run PROMOTING. El permiso de abrir no se deriva de readiness.
- `verify_recovery`: local CLOSED_CONFIGURED→VERIFIED, después de controles de integridad/ACL/metadata y guardas exactas; conserva fence CLOSED. `prepare_recovery_open` requiere esa stage: exclusivamente OPEN_ELIGIBLE del run, CAS CLOSED/closed_version→OPEN/open_version, nueva gen/epoch exactas. No acepta TENANT o fila distinta. `seal_recovery` requiere LOCAL_OPEN para A o VERIFIED/CLOSED para B, verifica before/after permitido y conserva OPEN A/CLOSED B con prueba custodiada. No consume restricciones centrales.
- `activate_recovery`: único COMMIT central después de observar los locales SEALED exactos, fuente OFF, cero deuda/ejecutores y todo el conjunto clasificado. Actualiza A central OPEN y directorio active; B sigue CLOSED/blocked. Desactiva **sólo** los source RESTORE IDs en el run, ACK/generation/tenant/source guard exactos, nunca TENANT u otro motivo. Run COMPLETE/global_blocked=false y admission barrier=false en la misma transacción; incremento CAS de versión. No reabre en función del tiempo.
- `recovery_runtime_guard`: EXECUTE mínimo para API; devuelve booleano sin lista/manifest/refs públicos. NORMAL sólo con recovery_id null y generación/configuración normales acreditadas; recuperación sólo con run/config esperados, COMPLETE/global_blocked=false/barrier=false. Se comprueba en composición/admisión/autoridad de negocio, independientemente del endpoint health. El classifier de servicio añade reloj, conexiones y conformidad total; esta función sola no es un PASS físico de readiness.

Errores fijos internos: `RECOVERY_CONTEXT_CONFLICT`, `RECOVERY_STAGE_CONFLICT`, `RECOVERY_PROOF_REQUIRED`, `RECOVERY_RESTRICTION_CONFLICT`, `RECOVERY_CLOSED`, `RECOVERY_BUDGET_EXHAUSTED`. Ningún detalle de query/input. Handler público conserva sobre seguro/503 para recuperación no concluida; un error de falta de fin SQL no se degrada a4xx para devolver recursos.

## 5. Locks, continuidad y ventana de apertura

Central: AdmissionFence UPDATE/CAS → run → estados tenant por UUID → restricciones/guardas por ID → directorio/cupos → intenciones/tickets si se verifican; replay restrictivo conserva el orden L2 identidad/sesión/tenant/membership/grant/scopes/intenciones/tickets. Local: writer_fence exclusivo → recovery_guard → cuota → filas de operación en el orden L2. Nadie sostiene un lock central mientras espera otra DB. El controller único está ligado a owner/cohorte/recursos y prueba de fin; no leasing por TTL ni archivo RAM como única protección.

| Etapa persistida | Central / locales esperados | Ante ACK/crash perdido |
|---|---|---|
| PLANNED / ENROLLED | source-gen CLOSED; target cerrado; admission barrier true | Observar misma run+hash; fuente/local before exactos permiten continuar el mismo paso, no regenerar material |
| CLOSED_CONFIGURED parcial | Algunos locales new-gen/new-epoch/CLOSED y otros source-gen/CLOSED | Cada DB acepta sólo su before o after custodiados. No actualizar la fila inconsistente para «alinearla»; no abrir ningún runtime de negocio |
| CONFIGURED | Todos new-gen/CLOSED; directorio3; old SID revoked; seed owner; barrier true | Observar COMMIT central exacto y config privada; si aplicado, registrar ACK, no volver a incrementar epoch/ref/gen |
| CLOCK_ACQUIRED / VERIFIED | Owner nuevo acreditado; clock puede avanzar normalmente; locales CLOSED y sets exactos | El acquire incierto se reconcilia por owner/gen/tick/version; no se llama acquire con otro owner para ocultar incertidumbre |
| PROMOTING | Central elegible CLOSED/open_version; local puede CLOSED/closed_version u OPEN/open_version; B CLOSED; barrier true | Local OPEN no afirma central activado. Observar y completar el mismo CAS tras fin de SQL previo; ninguna intención nueva puede ejecutarse |
| COMPLETE | A central/local OPEN/open_version; B CLOSED/blocked; restricciones de sujetos/TENANT vigentes; barrera false | COMMIT perdido: leer el run y todas sus postcondiciones, registrar ACK duradero. No repetir activation ni generar nuevas guardas; el runtime empieza sólo después de esta conformidad |

Para cada SQL de efecto de preparación: fsync del intent/material antes de SQL, COMMIT síncrono, fsync del ACK después. Pérdida de COMMIT **o** ROLLBACK deja UNKNOWN; no retry hasta probar fin SQL y consultar el estado durable. `before exacto` permite el mismo paso; `after exacto` permite sólo su ACK; cualquier tercera imagen mantiene bloqueo. La mera terminación de una consulta con error no prueba ROLLBACK. Las pruebas de fin del controller anterior preceden cualquier relevo de owner.

Aborto después de local OPEN: no bajar a closed_version anterior. Preparar un identificador compensatorio durable. `begin_recovery_abort` liga ese ID al run, central barrier true/CLOSED y stage ABORTING; A fija `abort_version=open_version+1` (v+3 respecto del source abierto), B no cambia. `inventory.abort_recovery` bajo exclusivo admite sólo las imágenes CLOSED/closed_version, OPEN/open_version o replay CLOSED/abort_version del mismo run y fija CLOSED/abort_version; saltar versiones no usadas conserva monotonicidad, nunca reduce la versión central preparada. Los campos `abort_id/abort_version` son aditivos en las filas del plan y se fijan una vez antes del SQL compensatorio. `complete_recovery_abort` exige todos los closes y pruebas de fin/recursos, guarda ABORTED_CLOSED, global_blocked/barrier true. Reservar desde begin el margen de bigint para open y abort; si `closed_version>MAX_BIGINT-2`, recovery no empieza. Si activation ya ocurrió y hay API/SQL en vuelo, primero ejecutar cierre restrictivo/fin de recursos L2 con su identificador compensatorio y esperar sus pruebas; no marcar ABORTED simplemente por detener un proceso. Un nuevo intento de apertura requiere nuevo plan ligado a la versión cerrada real y revisión/custodia explícitas, no incremento/adopción automática. Rollback del artefacto conserva esquema/datos y cierre; un binario schema2 rechaza schema3 sin servir ni reabrir.

## 6. Restricciones, sesiones y reloj

**No removibles por recovery:** TENANT, IDENTITY, MEMBERSHIP, GRANT y LOGOUT activos; estados revocados, security/versiones y sus tombstones. LOGOUT está ligado a writer_session_ref antiguo, de modo que no prohíbe por sí solo una sesión nueva legítima de otra referencia. Identidad/membresía/grant/tenant siguen efectivos al cambiar generación. Alinear autoridad JavaScript y SQL en006; no reescribir generación de una restricción histórica para hacerla visible. Un RESTORE ajeno, EPOCH/ROTATION/POLICY/SHUTDOWN activo no se consume como recuperación: clasificarlo o mantener cierre según su protocolo propio.

`processRestriction` normal no corre sobre filas históricas del source ni reabre durante PLANNED…PROMOTING. El worker del destino puede adquirir/avanzar reloj con barrera, pero el loop restrictivo normal se habilita sólo tras conformidad COMPLETE. Funciones normales `open_writer_fence` y entradas de `resumeOperationalBarrier` deben rechazar bypass de recovery o consumo de TENANT: sólo el preparador del run puede ejecutar sus etapas. Old worker/source roles rotados no conectan y la vieja generation tampoco satisface CAS actual. Negative directo de bypass privado es obligatorio, no sólo ausencia de llamada en el happy path.

Material privado elegido una vez: recoveryId/controllerOwner, targetGeneration, epochs y refs/versiones nuevas, passwords/verifiers de roles propios y sessionSecret, seedClockOwner/initialWorkerClockOwner, manifest/checkpoints/journal final y hashes de recursos. Incluye API/issuer/session/clock/maintenance/readers/writers/bootstrap propios; no secretos ajenos. Identificadores de rol permitidos están fijados por cohorte, no se interpolan desde una petición. La rotación reutiliza mecanismo estándar existente; no algoritmo criptográfico nuevo.

`createClock({owner: initialWorkerClockOwner,generation:targetGeneration})` recibe el owner custodiado; no el default random generado por startup. Acquire sólo desde seedClockOwner/version exactos, tras source clock muerto y ausencia SQL. Source tick nunca se reinicia; clock_version avanza en preparación y acquire. Si acquire ya aplicó y perdió ACK en el mismo proceso, reconcile observa su owner exacto; no repetir acquire. Si el proceso murió, elegir un **transferId y owner nuevos una sola vez**, write-ahead/final checkpoint, previous owner/version/tick explícitos y proof de exit+SQL absent. El retry de esa transferencia conserva su transferId/owner/version esperados; registrar current_clock_owner/clock_transfer_id sólo después de observar el CAS. El conjunto de transferencias permanece en la custodia/journal acotado y su hash final, sin regenerar por cada arranque. No simular first-start con tick/clock_version distintos de0 ni usar TTL para obtenerlo.

Todos los SID anteriores revoked, store/secret antiguos no habilitan sesión; nueva sesión company necesita identidad verificada/security_version/membership/acción vigente. El actor original consulta su resultado histórico por GET con nueva sesión/contexto **actual**, mientras el resultado conserva dataEpoch histórico. Otro actor, operador/demo o acción revocada no lo obtiene. POST con epoch viejo se deniega; misma clave con nuevo epoch/hash no se vuelve ejecutable. No modificar result.dataEpoch ni copiar la versión actual a una intención vieja para que parezca nueva.

## 7. Reverse impact y ensayos requeridos

Impacto a incorporar al candidato único: `authority.js` restricción generacional y enteros schema3; service/coordinator/SQL checks schema2; descriptors/readers/pools allowlists schema3; composición privada/readiness/healthcheck/clock-owner explícito; migraciones006/registries/ACL/costas; preparador/versionado/continuación/journal propio, frontend consulta histórica con envelope actual/result histórico. Schema3/readiness/reapertura constituyen propuesta de **SPEC CHANGE**, no SPEC ERRATA del producto L2 ni aprobación heredada. La A exacta futura debe incluir ese impacto y B diferenciar la implementación; el snapshot L2 no se reescribe. Revisar solamente los cambios y regresiones afectadas; PASS L2 intactos conservan fuentes, sin repetir toda QA por añadir diseño.

| Fallo/negativa preregistrable | Propiedad y evidencia futura requerida |
|---|---|
| False resource binding con mismo systemIdentifier, tenant omitido/extra, journal truncado/cambiado o material faltante | No SQL/promoción, todos CLOSED/barrier; hashes/cotas/owner intactos |
| Fallo antes/después COMMIT localA, localB, central/config/clock y activation; ROLLBACK perdido | Reanudar con mismo material; observar before/after exactos sin doble epoch/password/version, préstamo/deuda no devueltos por ausencia de ACK |
| Interrumpir local A OPEN antes de central activate | No intención nueva/efecto; global guard y permisos niegan negocio; B permanece CLOSED. Compensación v+3 si se aborta |
| Inyectar generic processRestriction/open/resume con restricciónTENANT o guard source/vieja/otro run | Rechazo antes de mutar; active/TENANT/grants/guardas/counters/biz iguales |
| Dos preparadores, otro owner, source aún ejecutable/SQL viejo vivo; clock acquire y restart inciertos | Sin takeover ni aceptación por TTL; CAS único, prueba positiva de fin, owner persistido y reloj/fence iguales |
| Todos legítimamente CLOSED/0OPEN y, por separado, UNKNOWN/no-close-proof/manifest incompleto | Ready200 sólo para el primero con COMPLETE; segundo503. Ningún handler de negocio usa el health200 como autorización |
| Old SID/cookie/password/gen/epoch y otro actor/acción/tenant | Rechazo real HTTP/SQL; permisos actuales revalidados y cero efecto, sin datos de otros sujetos |
| GET de operación original autorizado, POST incompatible con misma clave, alta/recepción nueva con margen prebackup | Resultado histórico exacto/efecto único; claves nuevas confirman una vez y replay dosAPI/reload; sumC/stock/audit/guards/quotas exactos |
| Fuente006 fixture NORMAL, consumidor schema3/lector, oldartifact schema2 y crash de distribución de config | Compatibilidad nueva acreditada; artefacto anterior rechaza/cierra; ninguna apertura con descriptor/ref parcial |
| Metadata peor caso/último espacio técnico, versiones bigint máximas, pasos repetidos | Presupuesto mismo16MiB/2MiB y singleton contabilizado una vez; overflow falla cerrado sin reset/QH/QC/Qtrefund |

Los tiempos/comandos/leases/conexiones, tamaño/espacio source/copia/WAL/target, fallos por etapa y cleanup se fijan numéricamente en el plan común CP018 antes de A/ensayo. Este documento no elige valores extras ni declara que caben dos presupuestos completos en el host. Cada nuevo recurso conserva Environment Gate; no implementamos ahora estas funciones ni ejecutamos SQL para demostrar el diseño.

## 8. Provenance del corte leído

| Fuente | SHA-256 | Uso |
|---|---|---|
| Candidato L3 CP017 | `03627e96621ef3f3fbf41edcbabb73173142834e3a6dc293b1d4bd8c7226e328` | Objeto previo completo, no aprobado |
| Peer L3 CP017 | `6da5894462561be12996f003f7f9ba891d6b91f1f9d9edd70cce4d87aa9c74e5` | Lagunas Design/A/B/fuente nueva |
| Snapshot L2 | `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71` | Guardas, debt, versiones, restore cerrado |
| Prompt | `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d` | Gates, SPEC CHANGE/ERRATA y provenance |
| coordinator.js | `ae14c70b24eefca6a6f30b5981cc2dea56811ee16456fe7b44c03d9484ca39f4` | Reopen genérico/clock-independent private maintenance |
| clock.js | `08e9d880a2445e5daf3a034d6e00c03f535e278c37a2a549f84f8b1cb98aa0d9` | owner/acquire/reconcile/CAS reales |
| transfer.js | `4b28e40ad72792f5314e1ccbb7c37a7f2cb9210bef573a102e3955795b4782e8` | Prueba de transferencia trusted, no request |
| admission/schema.sql | `554c5bf6c979f510d59997f65e0a7aeb54f9a7f8913e9d57dbabe4eecf78ec19` | Barrera existente/ledger/reloj |
| authority.js | `5ecc04bdbb570f40a9bac6a2a370676bc37e74e547cc3fa9687d281e34baebdb` | Filtro generación/schema2 |
| service.js | `6643afd4dfcbd2ba7ae5efeabe05206f920c36cf6280d6e07d22f43a641751da` | Consulta histórica/resultado/ref actual |
| 003-control-writers.sql | `c5036db5fd1a71ea94e7d7feee25e299dcb074e25108465304ac6dff92955d07` | Restricciones/guardas/costas, no editar |
| 003-tenant-writers.sql | `5fe454b89dbc5f821f742456deb2ebde08b9142048b2eac33ef9352eb87bce06` | Fences/cupo/results, no editar |
| recovery.mjs CP017 | `344281ec4e0f8c54f49682453eecf47b69b52aa37c38753602cd7fc20ad6bc65` | Ensayo cerrado; no procedimiento canónico de reapertura |
| journal.js | `56f8c7a9dca488bb283edbc4cfe80ca789394283cd2e7d6285c14c5ed0e31ca3` | Integridad/write-ahead existente. Su acción purge_product no se permite en L3 |

La SHA base proviene de root; hashes de archivos y observaciones estáticas son LOCAL. Evidencia física CP017 permanece en sus reportes/SHA y no acredita estas funciones nuevas. No contrataciones, infra, secretos ni decisiones humanas adicionales emitidas. Próximo paso independiente: root integra esta propuesta y los diseños de custodia/readiness/entorno en el **mismo candidato L3**, revisión F14/Design/Specification y A exacta; B/Development/Environment antes del código o recurso. Si el candidato deja algún REQUIRED sin cubrir, se mantiene NOT APPROVED en ese fragmento, sin fabricar PASS.
