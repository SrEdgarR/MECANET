# P1-L3 — recuperación reanudable y reapertura verificada

**SUGGESTED / CANDIDATE / NOT APPROVED — v0.2-CP018.** Objeto único propuesto para A: este archivo completo, SHA-256 fijado externamente tras revisión. B es independiente y sólo habilita implementación integral cuando se satisfagan Development/Environment Gates y preflight de cada recurso. No A/B recibidas en CP-018. Base canónica verificada: `86985fe7589032f202ebf0cb057a9b1384217151`, SrEdgarR/MECANET/develop, PR #3/#4 y CI final SUCCESS. Rama de diseño `codex/p1-l3-design`; P1 única fase activa, P0 PARCIAL/RG-001, SaaS general NOT APPROVED.

Antecedente inmutable en esa base: v0.1-CP017-rev1, SHA-256 `03627e96621ef3f3fbf41edcbabb73173142834e3a6dc293b1d4bd8c7226e328`; [revisión CP-017](../docs/evidence/cp017/review-next-lot.md). Esta v0.2 resuelve sus carencias de diseño, sin reabrir L1/L2. [Snapshot protegido L2](../docs/specs/p1-l2-approved/baseline.md), SHA-256 `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71`: garantías de autoridad, cuota, intención, resultado y cierre se preservan. L2 exigió restauración CLOSED, no reapertura. La aprobación futura de A incluiría únicamente los mecanismos de este archivo y el impacto propuesto SC-010/DEC-065/066; no todo el SaaS o borradores externos por referencia transitiva.

## 1. Resultado, límites y propiedades

Resultado: preparar y restaurar una **cohorte sintética L3 nueva**, continuar cada etapa interrumpida sin regenerar material ni adoptar versiones, y habilitar sólo las empresas elegibles después de acreditar cierre del origen, integridad, configuración, reloj y conformidad central/local. Una sesión company nueva del actor original vigente puede consultar un resultado histórico sin volver a ejecutar la operación; UUID no concede autoridad.

Incluido: controlador privado reanudable, registros/migraciones aditivas, custodia de material, transferencia del reloj, promoción individual, barrera única, contrato de readiness y pruebas reales previstas de los seis criterios. Sin nueva pantalla de administración: recorrido de inventario L2 para aceptación y estado de error existente. Preservar PostgreSQL18.6/Node24.21.0/npm11.9.0/React/Express/Compose independiente/UI cuadrada. CP-017 **STOPPED/KEEP**, fuente29/29, cuotas/reservas/historia/roles/tombstones intactos; jamás usarla como fixture positivo L3.

Excluido: producción, datos reales, migración comercial, HTTP público/DNS/certificados públicos/proxy compartido/Coolify, Nexora/EAK, gasto/servicios externos, checkout/pagos/fiscalidad/NCF-eCF, operador/impersonación, POS/precios/cajas, backups externos continuos/RPO-RTO. Preparación P2 es informativa y no parte de A/B L3.

Invariantes verificables:

- I1: jamás origen y destino admiten negocio simultáneamente; source CLOSED/fin positivo precede toda promoción. PG cerrado de control no equivale a writer vivo.
- I2: mismo recoveryId/etapa/DB/rol reutiliza material, owner, gen, epoch, versiones y referencias exactos ya confirmados. Una repetición no incrementa nada otra vez.
- I3: una etapa con ACK/COMMIT/ROLLBACK desconocido no habilita la siguiente ni libera recursos; ausencia de fila no prueba no-efecto sin fin positivo.
- I4: intención/operación/resultados/guardas históricos y namespace de claves no se reescriben. Nueva generación no vuelve ejecutable una clave anterior.
- I5: central/local coinciden con la pareja esperada antes de permitir un efecto. CAS rechaza versión/generación/epoch/owner diferentes; overflow queda cerrado.
- I6: reapertura consume sólo barrera RESTORE identificada de este run. TENANT/IDENTITY/MEMBERSHIP/GRANT/LOGOUT y tombstones conservan eficacia, también al cambiar generación.
- I7: todos los SID copiados quedan permanentemente revocados; claves/credenciales antiguas no autentican el destino. Permisos exactos y cuota siguen requeridos para sesiones nuevas.
- I8: QH/QC/Qt, used/reserved/sumC, productos y balances se conservan; no reset/DELETE/UPDATE de negocio ni aumento de cuota para pasar.

## 2. Identificación, copia y journal

En la fixture se cierra A mediante un RESTORE individual con tenantId y guardas sólo de A; B ya está CLOSED por TENANT y no se incluye en ese RESTORE. Una restricción global que contenga tenants fuera del conjunto elegible no es consumible parcialmente y aborta esta promoción.

Controlador privado de ownership exclusivo; no endpoint público ni montaje de Docker socket en API/worker. Activos: datos/resultados/ACL, registro de migraciones, journal posterior, material de credenciales y pruebas de fin. Amenazas cubiertas: cliente/actor/tenant incorrectos, entrada de manifiesto dañada, copia vieja/incompleta, repetición/crash/ACK perdido, restricción concurrente y mezclas de configuración. Administrador host malicioso/custodia externa/independencia del host no se afirman resueltos. SHA-256 acredita integridad bajo custodia, no firma o autorización.

Manifiesto privado schema `recovery-manifest-v1`, campos cerrados: recoveryId; base/productor/artefacto/digest/controlador/verificador; source y target con project/cohortId, host identity comprobada, CID real/labels/image digest, volume IDs y rutas absolutas realpath sin symlinks, redes internas/IP/socket exclusivo; generation/sysID; copia con lista path relativo regular/tamaño/SHA-256 y cabeza; sourceClosedProof; checkpoints de backup y journal final; conjunto completo de scopes/DB/roles; mapa esperado de gen/epoch/schema/versions/refs/elegibilidad. UUID técnico generado antes de mutar y custodiado, más IDs físicos observados: systemIdentifier o nombre de proyecto solos no distinguen un clon. Target y source no comparten CID, volume/mount raíz, ruta de datos ni namespace de red. No URI con contraseña, cookie ni cuerpo de negocio en reporte público.

Validar forma/campos/versión/tamaño; rutas relativas sin `..`, links/dispositivos ni destinos fuera de raíz propia; inventario exacto sin archivos faltantes/adicionales y copia offline con origen PG detenido. Verificar huella datos/funciones/ACL/owners/HBA/TLS/registros de migración centrales y de cada DB, una operación→un resultado/audit, balances=sum(delta), versiones/counters/sumC y cuotas. Snapshot técnico esperado se captura antes de copia, no se inventa después de restaurar. Mantener journal fuera del cluster copiado.

Journal restrictivo: secuencia contigua desde checkpoint de copia hasta cabeza final sellada; cada intent/action/target/operationId/hash y resultado asociado validado. Un intent sin result se aplica/observa idempotentemente, no se descarta. Repetir canario no duplica tombstone ni versión. No aceptar un prefijo válido sin cabeza final externa ni eventos posteriores perdidos. Replay sólo acciones restrictivas conocidas; unknown/schema/target ajeno abortan. Demo permanece restringida; no purga un producto referenciado por operaciones L2 mediante helper legacy. El ensayo L3 usa revocación de identidad B posterior a copia, no purga de negocio.

Fin positivo: prueba ligada a CIDs/owners originales de ambas API, web/worker/reconciliador, sin restart automático; respuesta/request/client/SQL de cada ticket concluida o dueño/proceso terminado y backend original ausente. Cierre exclusivo de fence acredita cierre de efectos, **no** fin HTTP/SQL ni liberación de reservas. Reconciliar tickets/intenciones y conservar UNKNOWN hasta prueba suficiente. PG origen OFF confirma la frontera de copia; para canario poscopia sólo se permite PG origen con todos los fences CLOSED y procesos de negocio OFF, después se vuelve a detener y registrar fin antes del target. No TTL/sleep/timeout/heartbeat usado como prueba de fin.

## 3. Custodia y continuación durables

Fuera del cluster: manifiesto superior/estado≤256KiB cada uno, bundle privado≤256KiB; índice separado de copia≤4MiB/10000 archivos, referenciado por hash en el manifiesto; journal≤1MiB/1000registros. Directorios0700/controlador exclusivo, archivos0600; no symlinks, ownership/ACL/raíz verificados. Exclusión del controlador con creación `wx`; EEXIST no permite takeover por tiempo. Continuar exige fin positivo del propietario anterior/procesos/SQL y mismo run; prueba insuficiente conserva cierre.

Antes de cualquier SQL del target se crea **una vez** el bundle final: targetGeneration diferente de source; seedClockOwner y workerClockOwner diferentes; expected epochs/versions/refs; las17 credenciales LOGIN+bootstrap del inventario fijo que corresponden, secretos de sesión y material TLS propio/segmentado; salts/verificadores SCRAM exactos si se necesitan para comparar rotación. Usuarios/passwords de negocio del fixture no se regeneran para esquivar revocaciones. Contraseñas/verificadores/huellas privadas no se publican ni pasan en argv/log/Git; no `.env` legacy ni secretos CP017/producción.

Publicación: temporal `wx`0600→write completo→fsync archivo→nombre final **sin clobber** mediante enlace exclusivo mismo filesystem→fsync directorio→releer/verificar bundle. `rename` que sobrescribe un final no basta para creación inmutable. Un temporal fallido sólo puede descartarse por ownership/path y fin positivo, antes de existir final/intent SQL; después de final o primer intent nunca regenerar. Antes de cada efecto append/fsync del intent con operationId fijo por etapa/DB/rol, esperado/ref/hash; después registrar observado probado. Configs API1/API2/worker versionadas se derivan del mismo bundle con write/fsync/rename/fsync de directorio y montaje RO0400/UID propio; publishers no generan otro material. Master/manifiesto/custodia no se montan en API.

Rotación: operar por rol/DB identificados bajo barrera, mínimo privilegio y TLS verify-full. Bootstrap temporal sólo del cluster nuevo; API tiene control/session/issuer/read/write, worker clock/mantenimiento acotado, owner de funciones NOLOGIN/search_path fijo/PUBLIC revocado. No writer DML/DDL libre ni CONNECT ajeno, reader no recibe privilegios nuevos. Una pérdida de ACK exige observar role/verificador/ACL/ref y probar autenticar sólo el material nuevo custodiado; estado viejo más fin/ROLLBACK conocido permite completar la misma etapa. Otra combinación mantiene incertidumbre. No credencial fallback ni SQL con secreto en historial; bootstrap sólo se retira/deshabilita al cerrar ensayo tras conservar el procedimiento privado de continuación.

Etapas del mismo run: `PLANNED → CONFIGURED → CLOCK_ACQUIRED → VERIFIED → PROMOTING → COMPLETE`, con salida restrictiva `ABORTING → ABORTED_CLOSED`; registro de intent/resultado por subetapa, CAS exacto del run. Cada etapa prevé antes/tras SQL y antes/tras COMMIT. Repetición de efecto exacto ya registrado devuelve observado sin mutación; ausencia de efecto sólo permite retry idéntico con fin/ROLLBACK acreditados. Observado distinto de esperado/confirmado aborta; no adoptar versión actual, regenerar secretos, saltar DB o llamar otra vez helpers L2 con defaults aleatorios. Locks/COMMIT/fsync reales se prueban después de A/B; el modelo no los acredita.

## 4. Registros SQL, reloj y promoción

Migraciones futuras **aditivas006-control-recovery.sql /006-tenant-recovery.sql**, no creadas ahora; no editar001…005 ni sus registros. schema_version3 y compatibilidad explícita de readers/directorio/pools/authority/coordinator/readiness/entrypoints. Fuente L3 nueva usa artefacto L3 con006 y modo NORMAL válido antes del backup; no arranque API que migra. Target vuelve a modo RECOVERY cerrado antes de acceso de negocio. L2 puro puede rechazar schema3; rollback nunca finge schema2 ni abre con binario incompatible.

Contratos mínimos normativos, UUID/string decimal bigint/hash en sus formas L2:

- `saas.recovery_runs`: id PK; controller_owner; source/target generation; manifest/journal/custody/resource/endProof hashes; expectedTenants conjunto exacto ordenado, máximo2 en fixture; restoreRestrictionIds exactos; seed/initialWorker/currentClockOwner y clockTransferHash; abortId/abortVersion; stage, version, global_blocked. Run/version/proofs no editable por API.
- `saas.recovery_tenants`: PK(run,tenant); guard source gen/epoch/closedVersion y target gen/epoch/openVersion; directory/schema/ref/credential versiones; eligibility (`OPEN_ELIGIBLE`/`RESTRICTED_CLOSED`), closedReason enum privado, stage/version/proof hashes y abortId/abortVersion fijados antes de compensar. Igualdad exacta con directorio y manifiesto; nunca obtener conjunto vacío de error/filas faltantes.
- `inventory.recovery_guard`: singleton por DB empresarial, tenantId/run/manifest/source gen/epoch/closedVersion/target gen/epoch/openVersion/controllerOwner/stage/version/eligibility/closedReason/sourceResourceHash/targetResourceHash/proof, abortId/abortVersion. Precreado por preparador; negocios no lo escriben.
- `admission_fence.recovery_id` enlaza el run. Única barrera efectiva `admission_fence.barrier`; `global_blocked` es estado del mismo procedimiento actualizado en la misma TX al activar. No dos barreras autónomas. Modo NORMAL bootstrapped/READY o RECOVERY/PLANNED se instala expresamente; fila ausente/desconocida nunca significa NORMAL o conjunto vacío.

Privados: `prepare_recovery(run,expectedRunVersion,proofRefs)` instala registro/guardas cerradas tras validar bindings; `configure_recovery_tenant(run,tenant,expectedGuard,refs)` compara mapa y configura nuevo gen/epoch/ref bajo CLOSED; `prepare_tenant_promotion`, `open_local_recovery_fence`, `confirm_tenant_promotion`, `activate_recovery` reciben recoveryId/controllerOwner/expected run+tenant versions/proof bindings exactos. API sólo EXECUTE observador readiness acotado; mantenimiento sólo esas funciones fijas, no UPDATE libre de estados/grants. Nombres internos pueden ajustarse sin cambiar estas firmas/invariantes; cada función valida pruebas custodiadas autorizadas, no `verified=true` aportado por un request. Owner de funciones no-login y ejecutores fuera del runtime público. Reducir prueba a un hash sin procedencia no es conformidad.

Orden central de locks: AdmissionFence → recovery_run → restricciones de sujeto por orden estable → tenant_writer_state por UUID → recovery_tenants/restricciones correspondientes → scopes/intents/tickets según L2. Local: writer_fence exclusivo → recovery_guard → quota/balances sólo si verificación lo requiere. Nunca sostener lock central durante I/O de otra DB; no 2PC. Publisher/journal fuera de TX; pruebas write-ahead ligan frontera filesystem/SQL sin alegar atomicidad multibase.

Reloj: source worker/CID/owner terminado positivamente y SQL ausente; seed y worker owner nuevos custodiados antes de SQL. Configuración target instala exactamente seed y nueva gen, preservando tick/contadores y versión monotónica. Primera adquisición CAS seed→worker bajo locks AdmissionFence/TimeAuthority, incremento clock_version una vez en ambas filas y tick concordante; guard previa exacta. ACK perdido: fin positivo/observación owner/gen/tick/version exactos→`reconcile` del mismo owner, sin adquirir/incrementar otra vez. Si el mismo proceso perdió ACK, reconcile conserva el owner. Un reinicio real requiere fin positivo del proceso/SQL anterior y una transferencia nueva: transferId/previousOwner/nextOwner únicos custodiados una vez antes de CAS; repetir esa transferencia reutiliza su material/versión exactos, nunca otro owner por startup o antigüedad. No takeover por antigüedad. Observer conserva dos avances comprometidos, misma gen/tick/version y frescura<1000ms del contrato actual; el tiempo sólo detecta falta de preparación, nunca acredita fin o transfiere dueño.

Promoción por empresa, con barrera global true hasta activación:

1. Guardas CLOSED de fuente/target y sourceEnded/custody/config/journal/clock verificados. Sea c=closedVersion acreditada: exigir c≤MAX_BIGINT−2 y reservar p=c+1 y abortVersion=c+2 una vez, sin wrap. Central CAS CLOSED/c→CLOSED/p (`PREPARED`); directorio target refs/epoch/schema exactos. Repetición sólo acepta PREPARED/p del mismo run.
2. Local CAS CLOSED/c→OPEN/p con **nueva** gen/epoch/mismo run/proofs (`LOCAL_OPEN`). La ventana localOPEN/centralCLOSED/globalbarrierTRUE no admite intención ni efecto nuevo. Intenciones históricas permanecen con su versión/gen/epoch original, jamás adoptan p.
3. Registrar y sellar conformidad por tenant (`SEALED`) sólo tras observar local OPEN/p exacto y autoridad/elegibilidad aún vigentes. Central permanece CLOSED/p hasta el COMMIT de activación final. Una restricción nueva central o local eleva versión/cierra y hace fallar el CAS; no abrir usando la versión nueva. Un SEALED del mismo run sólo se observa, no incrementa.
4. B/demo/restringidas se registran `RESTRICTED_CLOSED` con cierre local/central/ACK y tombstones eficaces; no se promueven ni se rotulan elegibles para obtener200. Toda empresa elegible pendiente mantiene run incompleto.
5. Verificado el conjunto completo y reloj/config/ref/fin fuente, una sola TX central bloquea filas, revalida restricciones actuales, consume **únicamente** los IDs RESTORE de este run elegible y realiza CAS de cada elegible central CLOSED/p→OPEN/p y directorio draining→active y fija `COMPLETE/global_blocked=false/admission_fence.barrier=false`, conformidad final en ese mismo COMMIT. B conserva CLOSED/blocked. Restricciones de B/subject quedan vigentes. No `resumeOperationalBarrier` genérico que retire TENANT/ROTATION/SHUTDOWN/POLICY por comodidad.

Restricciones históricas: central/authority/intención usan el mismo predicado eficaz entre generaciones. Restaurar materializa por replay idempotente estado restrictivo actual con vínculo al tombstone original; no cambia generation, guardas o tombstones de las filas históricas para omitirlos. Única excepción explícita: los RESTORE operativos identificados y ACK de este run pasan active=false en el COMMIT final, con sus guardas/generation/epoch intactos y antes/after/proof registrados en la custodia del run. No se crea una tabla alternativa de consumo que deje RESTORE activo ignorado. El mismo predicado central/JavaScript/worker considera activas todas las restricciones pertinentes entre generaciones; sólo omite esos RESTORE cuyo active=false fue confirmado. IDENTITY/TENANT/MEMBERSHIP/GRANT no se desactivan; LOGOUT sigue invalidando sólo su referencia vieja; todos los SID anteriores permanecen revoked. Nuevas sesiones del actor vigente pasan autoridad habitual, no un permiso especial de recovery.

COMMIT aplicado sin ACK no equivale a CLOSED: observar pareja exacta bajo barrier y registrar mismo paso. Aborto después de localOPEN o COMPLETE: adquirir barrera central/cerrar admisión, abortId y abortVersion=c+2 custodiados, CAS central/local compensatorio monotónico mediante cierre exclusivo, esperar/acreditar writers/tickets/SQL/HTTP; conservar efectos/deuda/material. Si las versiones cambiaron por nueva restricción, conservarla y abandonar la promoción de ese tenant; no replanearla automáticamente ni borrar restricción. Una decisión privada nueva documentada requerirá su expected state y proof, fuera del retry. Si ni cierre positivo puede acreditarse, estado UNKNOWN/503 y STOPPED/KEEP, nunca afirmar cierre físico inexistente.

### Coste y firmas de recuperación propuestas

006 inicializa el singleton local antes del backup y contabiliza una sola vez su reserva técnica de4096+256bytes en la cuota, bajo la misma TX y registro de migración; representación lógica constante/tamaño real≤4096. `logical_usage` lo incluye. Central añade run y filas de recovery a `write_barrier_cost`, cota por fila4096+256 y espacio terminal4096 reservado. Se conservan16MiB/2MiB; repetir un paso no inserta historia SQL ilimitada ni reduce QL. Ensayar coste real, último byte/overflow y used=sumC antes de aceptar la salida; no transferir el PASS de las cinco filas L2 a estos metadatos nuevos.

Firmas privadas estables propuestas (no funciones creadas):

```text
begin_recovery(id,controller,sourceGen,targetGen,manifest,journal,custody,
  sourceResource,targetResource,endProof,tenants[],restoreIds[],seedOwner,workerOwner)
enroll_recovery_tenant(run,controller,tenant,sourceEpoch,closed,targetEpoch,
  eligibility,targetDirectoryStatus,readerVersion,writerVersion,readerRef,writerRef,restoreId,guardHash)
configure_recovery(run,controller,manifest,tenant,sourceGen,targetGen,sourceEpoch,targetEpoch,closed,eligibility,closedReason,sourceResourceHash,targetResourceHash,guardHash)
record_recovery_tenant_proof(run,controller,tenant,phase,expectedRunVersion,expectedTenantVersion,proofHash)
configure_recovery_control(run,controller,expectedVersion,configProof)
record_recovery_clock(run,controller,expectedVersion,expectedPreviousOwner,nextOwner,transferHash,proofHash)
prepare_recovery_promotion(run,controller,expectedVersion)
prepare_recovery_open(run,controller,expectedLocalVersion)
verify_recovery(run,controller,expectedLocalVersion,proofHash)
seal_recovery(run,controller,expectedLocalVersion,proofHash)
activate_recovery(run,controller,expectedVersion,activationProof)
begin_recovery_abort(run,controller,expectedVersion,abortId)
abort_recovery(run,controller,expectedLocalVersion,abortId)
complete_recovery_abort(run,controller,expectedVersion,abortProof)
recovery_runtime_guard(generation,run,manifest) -> boolean
```

UUID para id/owner/run/tenant/gen, bigint como cadena decimal para epochs/versions, text técnico acotado para ref/enum y hash64ASCII; conjuntos UUID ordenados/únicos. Funciones locales en inventory, centrales en saas; retornan la imagen de su fila guard/run/tenant salvo runtime_guard boolean. Privadas, ownerNOLOGIN/search_path fijo/nombres cualificados/PUBLIC revocado. API sólo runtime_guard/observador, no preparador/proof recorder. Campo `phase` allowlist CLOSED_CONFIGURED/VERIFIED/LOCAL_OPEN/SEALED/ABORTED_CLOSED. El controlador verifica la prueba externa completa antes de almacenarla; SQL compara guardas/bindings, no demuestra host/fsync por recibir un hash. Configuración central requiere todos los locales CLOSED_CONFIGURED; registra las nuevas refs/epochs/schema3, targetGeneration/seedClockOwner, tick preservado y clock_version anterior+1, SID antiguos revoked, A draining/B blocked, barrier true. La conformidad VERIFIED del conjunto sólo sigue CLOCK_ACQUIRED comprobado. Worker restrictivo normal y open/resume genéricos rechazan bypass y filas históricas source durante recovery; no sólo confiar en que el happy path no los llama.

## 5. Contrato único de salud y autorización

Cambio observable propuesto SC-010, sujeto a A/B. No handler actual modificado en CP-018.

`GET /api/health/live`:200 `{status:"live"}` si responde proceso propio; no prueba DB, recuperación, capacidad o permiso. `GET /api/health/ready`:200 `{status:"ready"}` sólo si instancia no draining; control/config/schema/artefacto/refs/generation coherentes; reloj avanza según contrato L1; NORMAL inicial conformante o RECOVERY COMPLETE con sourceEnded/journal/custody/conjunto exacto; barrera global false y ninguna transición de recuperación/cierre incierta. Cada empresa clasificada OPEN_ELIGIBLE tiene pareja OPEN exacta; cada RESTRICTED_CLOSED tiene pareja CLOSED+ACK legítima. En otro caso, incluido error de consulta/observación:503 `{status:"unavailable"}`, no-store, sin tenantIds/conteos/grants/paths/reasons/SQL.

**No exige una empresa OPEN.** Cero empresas es válido sólo con conjunto inicial vacío custodiado y carga completa exitosa. Todas legítimamente cerradas pueden coexistir con servicio técnico ready. Una empresa elegible CLOSED por recovery incompleto no es cierre legítimo; una DB omitida, huérfana, desconocida o con versiones mezcladas hace503. UNKNOWN de una operación ordinaria con guardas/recursos retenidos no implica por sí solo caída global; UNKNOWN del protocolo de cierre/recovery sí impide readiness.

Health usa observador/consulta central acotada, no pools empresariales ni contenido. Deadline≤1s/consulta≤500ms/una evaluación en vuelo por API, validando inventario completo del fixture≤2. Un exceso devuelve503, no lista parcial. Consumidores actuales: Nginx upstream estático `proxy_next_upstream off`, Compose sin healthcheck ni autoactivación, controlador QA explícito. No existe reinicio/promoción por obtener200. Controlador comprobará ambas API≤20probes/≤5s por fase; ready es señal de conformidad, no mecanismo que concede permisos. La barrera central y funciones empresariales impiden negocio durante promoción aunque Nginx envíe la petición. No configuración del proxy global. Si después se añade healthcheck propio, live es estado de proceso; ready sólo decisión explícita comprobada, sin automatic restart por tenant bloqueado.

| Situación | live / ready previstos | Autorización de negocio |
|---|---|---|
| Cero empresas legítimo o todas RESTRICTED_CLOSED conformantes |200 / 200|Ninguna empresa/acción inexistente o bloqueada se concede |
| A OPEN elegible y B CLOSED bloqueada conformantes |200 / 200|A sólo sesión/acción/epoch/cuota vigentes; B denegada antes de pool/efecto |
| Recovery/cierre incierto, manifest/journal/ref roto, conjunto incompleto, clock incoherente, draining |200 mientras proceso vivo /503|Conservar barrier/deudas; ninguna apertura por probes |
| Empresa/cupo agotado, operación ordinaria UNKNOWN con guarda íntegra |200 /200 si conformidad técnica vigente|429 de cuota o consulta propia; no soltar reservas ni ejecutar otra clave |

## 6. Cohorte nueva, presupuesto y preflight

IDs/rutas futuros exclusivos: proyecto fuente `mecanet-qa-p1l3-r01`, destino `mecanet-qa-p1l3-r01-target`, raíz `/opt/mecanet-qa-p1l3-r01` y target separado; UUIDs/CIDs/volúmenes reales custodiados al crear después de B. Redes internas propias propuestas10.77.61/62/63. Conflicto con red/puerto/path/consumer existente aborta: no alterar lo compartido ni elegir otro recurso silenciosamente. Loopback local18443→SSH→socketUNIX exclusivo, sólo si libre y ownership acreditado; ningún listener TCP remoto o PG público, sin egreso. CP017 y20consumidores anteriores preservados por facts inmediatos, no snapshot histórico de capacidad.

Un PG activo a la vez: fuente nueva→cierre/copia offline→PG fuente sólo para canario restrictivo poscopy→OFF probado→targetPG/config/replay→worker→dosAPI→web/aceptación. No dos presupuestos completos a la vez. Build fuera del VPS; imágenes existentes por digest, `--no-build --pull never`, no servicio externo/gratuidad asumida.

| Perfil exclusivo | CPU techo | RAM techo | Restricción |
|---|---:|---:|---|
| PG+preparador/harness |.60|768MiB|.35/640 PG+.25/128 helper; pool1; sin API/web/worker |
| Copia offline/manifest |.25|256MiB|Helper limitado; PG y negocio OFF |
| PG+2API+worker+web |.95|1568MiB|.35/640+.20/320×2+.10/192+.10/96; sin preparador |
| Runtime+probe |1.00|1696MiB|Probe.05/128/max1lease; no tools adicionales |

Techo del conjunto≤1CPU/2048MiB, PG max_connections60; suma de17roles LOGIN46+bootstrap1 con ownersNOLOGIN, sin ampliar grants/límites. APIcontrol5/session2/issuer1 y pools read/write agregados4pools/8leases por API sujetos a límites de rol/host; contar sesiones/WALsenders/controlador/observer y mantener margen hasta60. Timeout HTTP8s, SQLruntime2s/lock500ms, drainage30s conservados; bootstrap porDB secuencial adquisición≤2s/statement≤3s/max1lease. Artefactos runtime18.6/24.21.0/nginx fijados por digest del compose canónico, no actualizar majors por efecto lateral. Digests exactos: PG `67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129`; Node `ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc`; Nginx `3abad30db61dfb2a339ea21acc9f3e6bbe78e291fcff2f835f4510c8fdfcbd83`. ARM64/pins/versión efectiva y fuente/locks/assets verificados nuevamente en Environment Gate, no afirmados por documentación.

Preflight obligatorio por recurso/etapa: permisos/ownership/cohorte/base/versions/pins/TLS/HBA/ACL, CID/volume/path/symlinks/subred/socket/egreso; compare consumidores originales; CPUbusy<80% en muestra2s; MemAvailable−2048MiB≥3072MiB; freeDisk>max(15GiB,10%filesystem) y además >source+backup+target+WAL/logs medidos+2GiB margen. Fuente/copia≤2GiB; WAL/logs declarados en footprint y medidos, no confundir QL con disco. Muestra puntual no prueba capacidad20empresas. Durante ensayo abortar CPUbusy≥90%, MemAvailable<3072MiB, disco bajo margen, OOM, conexiones>60, suma de límites/perfiles excedida o cualquier cambio de consumer ajeno. Umbrales detienen operaciones propias y conservan evidencia, no autorizan modificar otro servicio o aumentar límites.

Fixture: empresas A active/company y B blocked/company; demo/operador sólo negativos si se usan sesiones emitidas estándar. Antes del backup, actorX de A vigente con membership/role_policy/action_grants exactos catalog.read/catalog.create/inventory.receive/inventory.read; actorY de A para negativo de autor histórico; actorB canario revocado después de copia. Crear exactamente4productos A mediante writer y2recepciones/operaciones históricas del actorX; cotas iniciales max_products300, tenantQL512MiB y centralQL16MiB/barriers2MiB, sin precio/impuesto. B contiene catálogo canario, TENANT ACK/CLOSED y no se reabre.

Medir antes de copia: A activeProducts4 (ni4 ficticio declarado sin SQL ni29/29CP017), used/reserved/sumC por DB y central, tickets/intents/guards, QH/QC/Qt y versiones. Exigir **≥8 plazas** libres, tenant used+reserved≤1MiB/central≤1MiB, y margen independiente≥8×32KiB tenant/8×16KiB central más crecimiento confirmado previsto. No intención/ticket/deuda no-terminal sin prueba positiva. Perfil técnico aprobado inicial permanece durante backup/restore/ensayo; fallo de margen aborta, no aumentar cuotas/resetear uso. Fixture nueva no concede condiciones comerciales distintas ni prueba moneda/POS.

Plan de comandos del futuro controlador privado (firmas a implementar después de B, no comandos existentes): `preflight(manifestDraft)`→`prepareSource(run)`→`captureAndClose(run)`→`copyOffline(run)`→`appendPostcopyCanary(run)`→`restoreClosed(run)`→`configure(run)`→`acquireClock(run)`→`verify(run)`→`promoteTenant(run,A)`→`activate(run)`→`accept(run)`→`rollbackClosed(run)`→`cleanup(run)`. Cada subcomando valida ownership/preconditions/limits/proofs antes de mutar y conserva intent/fsync. `resume(run)` observa la misma etapa antes de cualquier efecto; ningún `up` global ni `reset-db`.

## 7. Seis criterios y plan de aceptación

La matriz documental de Design/F14 puede PASS antes de A por coherencia, modelo y revisión independiente. Las salidas funcionales de los seis criterios permanecen **NOT VERIFIED** hasta implementación y entorno. Cada reporte registra esperado/observado, fecha, SHA/digest, controlador/verificador y provenance; nunca atribuir modelo Windows a PostgreSQL ARM64.

### L3-A1 — baseline, diseño e impacto

- Propiedad: I1…8, un contrato ready, CAS/continuación/roles/fixture/cotas completos; seis criterios únicos y A/B separadas.
- Esperado: candidato único versionado, revisión sin críticos/REQUIRED, F14/Design PASS documental y hash exacto para A; ningún PASS funcional inferido.
- Ensayo y negativas: modelo crash/ACK/CAS y ready con cero empresas/todas cerradas/mixto/UNKNOWN; variantes que exigen OPEN, adoptan versión, reviven SID o ignoran barrera producen contraejemplo. Referencias, historia, SC-010 e impacto inverso verificados.
- Entorno: LOCAL Node24.21.0 Windows x64 sin DB/red/env; lectura focal del código canónico.
- Dependencias: base86985fe/L1L2TERMINAL, snapshotca975, Prompt intacto; A/B antes de código.
- Riesgo y reversión: el modelo omite locks/I/O; declarar límites. Revisar el candidato en la misma ruta/hash antes de A; descartar borrador no afecta producto.
- Evidencia: plan/model/results/hashes, review independiente del objeto final y matriz F14/Design.
- Gate: Design§8.3/F14 antes de presentar A; Specification/A exacta y Development/B separados.

### L3-A2 — integridad, identidad y fin originales

- Propiedad: copia/journal/resultados/grants/contadores/schema/sourceEnd completos, target exclusivo CLOSED.
- Esperado: fingerprint positivo exacto, B poscopia revocado una vez y replay idempotente; todas las corruptelas rechazan sin apertura.
- Ensayo y negativas: manifest/copia/archivo omitido o extra/link/hash incorrecto/journal gap/cabeza vieja/target equivocado/owner SQL vivo/deuda abierta. Replay canario dos veces conserva un efecto restrictivo. Corromper únicamente variantes/copias propias, nunca fuente o backup canónico.
- Entorno: PG18.6 ARM64/TLS, source/target propios secuenciales, helper privado y roles mínimos.
- Dependencias: A/B/Development/Environment/preflight, custodia y fixture con margen.
- Riesgo y reversión: SQL tardío/copia incorrecta; barrier/STOPPED/KEEP, sin restaurar sobre fuente ni borrar canario.
- Evidencia: manifest/copia/fingerprints/closes/journal/roles/counters privados, reporte sanitizado por caso.
- Gate: Environment antes de recurso; aceptación de integridad antes de CONFIGURED/VERIFIED/reapertura.

### L3-A3 — configuración estable y reloj único

- Propiedad: bundle/refs/gen/epoch/roles durables; cada transferencia tiene seed/nextOwner estables; retry no regenera ni confirma por tiempo.
- Esperado: after-image exacta se reconoce sin repetir incremento; before-image más fin positivo completa el mismo paso; otra imagen conserva incertidumbre/cierre.
- Ensayo y negativas: fallo write/fsync/publicación/ACL/link/final modificado; crash antes/tras SQL y COMMIT por DB/rol; old/new credenciales; source clock vivo, owner ajeno, gen/version mezcladas; acquire/advance ACK perdido, reconcile y reinicio real con transferencia nueva previamente custodiada. Hash/config/roles y tick/counters no se resetean.
- Entorno: filesystem Linux real, PG y procesos privados de reloj controlados; sin servicio/algoritmo nuevo.
- Dependencias: A2/sourceEnd, bundle íntegro/006/budgets/proofs.
- Riesgo y reversión: rol aplicado y publisher fallido; observar mapa bajo barrier/reutilizar bundle; sin fallback de credencial.
- Evidencia: intents/results por frontera, permisos/durabilidad/role versions, owner/backend fin/CAS, secretos privados.
- Gate: DG-recovery/clock/custody antes de código; A3 antes de VERIFIED/promoción.

### L3-A4 — promoción por empresa y readiness

- Propiedad: CAS exacto y activación final atómica; A OPEN/B CLOSED y barreras de sujetos eficaces en generación nueva.
- Esperado: negocio bloqueado en toda ventana previa a activación; servicio técnico ready según§5 sin permiso implícito, incluso cero OPEN legítimos.
- Ensayo y negativas: pausa antes/tras cada CAS; POST API2 con localOPEN/globalbarrier; nueva restricción durante promoción; pérdida de ACK final; crash/resume; stale owner/version/epoch/tenant/run/RESTOREid y overflow. Tabla health: cero empresas, todas cerradas, A+B, tenant omitido/duplicado/error de carga/UNKNOWN/drain. Roster0 y allclosed usan variantes fresh separadas; no borrar A/B para obtener200.
- Entorno: PG/dos API/worker/controlador privado target, health HTTP real con Host/TLS propios, sin proxy compartido.
- Dependencias: A2/A3; conjunto/journal/clock/ref/proofs completos; ninguna deuda sin fin al promover.
- Riesgo y reversión: un local puede estar OPEN tras crash; compensación c+2/positivefin sin bajar versiones ni retirar restricción concurrente.
- Evidencia: stage/version/gen/barrier y conjunto antes/después, HTTP200/503/cuerpo mínimo, denegación sin efecto, tombstones/restricciones comparados.
- Gate: DG-ready/consumidores y A4 antes de aceptar negocio nuevo. Health no autoriza.

### L3-A5 — efectos nuevos y resultados históricos propios

- Propiedad: margen prebackup, nuevas altas/recepciones únicas; actorX con sesión nueva consulta resultado original sin reejecución.
- Esperado: 201 nuevos y replay explícito con un producto/movimiento/result/audit; stock/version/sumC/cuotas exactos. Old SID/contexto/epoch/credenciales y otro actor no producen efecto o filtración.
- Ensayo y negativas: dos API, mismo UUID/cuerpo, ACK perdido/reload; distinto actor/acción/input/productId/tenant/epoch403/409 según L2. B/operador/demo/oldSID/autor histórico ajeno denegados antes de pool. GET histórico del actor original usa contexto vigente, resultado conserva dataEpoch original; POST con UUID viejo y epoch nuevo es incompatible, nunca adopta guarda.
- Entorno: navegador→HTTPS local→dos API→PG target, sesiones estándar/grants/CSRF/Origin, UI cuadrada L2.
- Dependencias: A4/COMPLETE/reloj, margen y cuotas documentados, actor original vigente.
- Riesgo y reversión: timeout no equivale a rollback,404 no acredita ausencia de petición tardía; mantener ID/UNKNOWN/recursos hasta fin positivo. Reversión cerrada conserva efectos nuevos.
- Evidencia: HTTP+SQL+browser por fuente/assets/keys/stock/audit/counters y capturas privadas.
- Gate: salida de efectos/UIA5 antes de aceptación conjunta. Copia llena429 no sustituye201; CP017 no se usa.

### L3-A6 — regresiones, reversión, cleanup e integración

- Propiedad: cero críticos/REQUIRED, Quality PASS, rollback cerrado conserva historia, recursos propios STOPPED/KEEP y anteriores intactos.
- Esperado: todas las salidas físicas/matrices PASS antes de PR/CI/merge/canónica autorizados condicionalmente; sólo entonces L3 TERMINAL.
- Ensayo y negativas: regresiones afectadas authority/ready/restricciones/clock/schema/pools/custodia y writer L2;006 falla entre DB/DDL/registro→ROLLBACK o continuación cerrada; binario schema2 deniega schema3 sin mentir sobre versión; drain≤30s más fin positivo; cleanup rechaza CID/path/consumer ajenos. Verificar cero propios vivos/ports/túnel, datos/material KEEP.
- Entorno: LOCAL/CI limpia sin QA física; QA propia para delta/rollback/drain/cleanup; GitHubSrEdgarR/MECANET único, Q42 antes de publicación/merge.
- Dependencias: A1…A5 reales, fuente/provenance/review/locks/audits y autorización Git condicional para el lote aprobado.
- Riesgo y reversión: sin PR1/commits legacy/drop/restauración sobre origen/prune global; conservar rollbackrefs/PR/merge/evidencia. Forward fix bajo cierre si no hay artefacto compatible.
- Evidencia: matriz/reviews/Quality/CI por checkout, pre/postfacts y cleanup; no nuevo tested_code_sha por commit documental.
- Gate: Quality/Phase/Integration§8.5. No cierra P1 general, SaaS o Production Gate.

## 8. Cotas, fallos, reversión y orden de implementación

Cada caso se preregistra con recoveryId/etapa/DB/owner/material/proof, productor/verificador y fingerprint esperado. Casos de crash/rollback usan variantes fresh secuenciales de target del mismo backup, con ownership nuevo acreditado; no reset de target confirmado ni CP017. Un bundle por recoveryId, elegido una vez. Fallos mediante hook controlado, terminación exacta de proceso propio o pérdida de respuesta; sin desconexión global/carga compartida/tiempo usado como prueba de fin.

Cotas por escenario:≤45s,≤80HTTP/≤140SQL/max2leases; SQL bootstrap porDB secuencial, copy offline≤120s≤2GiB, drain30s sin sustituir endProof. Cohorte total≤3000SQL/≤300HTTP/≤2000 archivos de artefacto nuevos/≤1000 journal entries y≤30min de actividad. Source/copia/target≤2GiB cada uno y footprint del§6. Cotas incluyen retry/negativas/observaciones, contadores acumulados sin reset. Exceder aborta/conserva; no ampliar presupuesto para obtener PASS.

Controlador futuro privado, **subcomandos a implementar después de B**, no utilidades existentes listas para ejecutar: preflight→prepareSource→captureAndClose→copyOffline→appendPostcopyCanary→restoreClosed→configure→acquireClock→verify→promoteTenant(A)→activate→accept→rollbackClosed→cleanup. Cada entrada valida ownership/preconditions/cotas y registra intent antes de mutación. `resume(run)` observa la etapa exacta; jamás `up` global/reset-db.

Secuencia de cortes después de A/B:006/registro/funciones/custodia con regresiones puras→cohorte/fixture/cierre/copia/journal→A2/A3→promoción/readiness e intercaladosA4→efectos/navegadorA5→rollback/drain/cleanup/review/QualityA6→PR/CI/merge/CIcanónica si pasan gates y autorización. No otra B por corte del mismo objeto; un cambio material del contrato requiere impacto/revisión/aprobación.

Aborto/rollback antes de activación: conservar barrier y ledger/material; cerrar locales que llegaron OPEN con abortId/c+2/fin positivo, no afirmar CLOSED por crash. Después de activación/efectos nuevos: cerrar admisión central, drenar/conciliar y cerrar fences positivamente sin perder resultados, counters o tombstones. Artefacto anterior sólo puede servir si se acreditó compatibilidad con006/ref/runtime_guard; si rechaza schema3, mantener STOPPED/CLOSED y forward fix. Sin downgrade/drop/restauración sobre fuente ni apertura del origen antiguo.

Cleanup: identidad exacta CLI/project/CID/labels/image/path/consumers, manifest/hash/evidencia antes de parada; detener exclusivamente servicios L3 y el forward SSH propio con executable/commandline acreditados. Verificar cero running/ports/túnel y consumidores anteriores iguales. Source/targetvolumes/copia/journal/material/artefactos=evidencia **KEEP PRIVADO**. Tools efímeros propios DELETE sólo después de fin positivo/manifest; ownership ambiguo impide delete. Sin prune, eliminación por prefijo ni volumes ajenos.

## 9. Impacto, gates y aprobación exacta

SC-010 **PROPOSED**: recuperación reanudable y significado de readiness del servicio en L3; no actualiza ahora baseline protegida. DEC-065 y066 propuestas separadas para esos mecanismos. Reverse-impact: L1 salud/reloj/schema/readers/pools/authority; L2 coordinator/validación restrictiva/results históricos/entry/recovery publishers; QA/Nginx estático/Compose propio; futuras P2 escrituras/caja, P3 onboarding y P4 operador por sus contratos dependientes, sin implementación. PASS L1/L2 sigue válido para sus SHAs; el delta futuro requiere regresiones afectadas, no reensayar toda QA intacta. No editar003–005 aplicadas ni reinterpretar historia.

F14/Design Gate documental en [matrizCP018](../docs/evidence/cp018/design-gate.md), modelo LOCAL y revisión independiente del hash final. **A y B pendientes**. READY FOR DEVELOPMENT L3 y Environment NOT VERIFIED hasta baseline aprobada/autoridad/gates y preflight efectivo; seis salidas funcionales NOT VERIFIED. No exigir funciones inexistentes como entrada ni posponer a P6 propiedades que L3 necesita antes de abrir.

Humanas imprescindibles: **A**, aprobar TODO este archivo P1-L3v0.2-CP018 al SHA-256 final, incluidos mecanismos/impacto SC-010 y DEC-065/066; **B**, autorizar implementación integral y QA propia condicionadas a gates/preflight/cotas/review/cleanup, con integración remota sólo bajo autorización condicional y gates/Q42 satisfactorios. Pueden resolverse en un mensaje como decisiones separadas. No volver a solicitar planes, demo, PostgreSQL, cajas o alcance fiscal confirmados.

Q02/11/33: diseño del lote cerrado documentalmente cuando F14/review pasa; restos globales mantienen gates. Q32 preflight antes de recurso;Q35 salidas L3 antes de depender de reapertura;Q08/23/34 copias externas/coste/capacidad/RPO-RTO antes del uso correspondiente. Q03/18/38/39/41 pagos/fiscalidad/correo/entrada compartida permanecen FUTURE fuera de L3, nunca NOT APPLICABLE/aprobados por no consumirse. Preparación P2 en el documento existente es informativa, no baseline transitiva.

Fuentes primarias consultadas2026-10-13: [bloqueos PostgreSQL18](https://www.postgresql.org/docs/18/explicit-locking.html), [roles PostgreSQL18](https://www.postgresql.org/docs/18/sql-alterrole.html), [fsync/publicación Node24](https://nodejs.org/docs/latest-v24.x/api/fs.html). Respaldan primitivas, no ejecución del protocolo. Verificar secreto fuera de logs ALTERROLE y permisos/fsync reales Linux. No cuenta/proveedor/coste/soporte oficial inferidos. InformeCP018 fija hash externo; el candidato no contiene su propio hash.
