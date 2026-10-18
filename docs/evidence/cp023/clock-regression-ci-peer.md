# Revisión independiente — regresión de reloj y CI genérica L3

**PASS de revisión de código; REQUIRED: 0.** Revisor separado `/root/cp025_l3_peer`, sobre base `42bbf292c038f9185d9006c09a38094e525e5ccb`. Este PASS corresponde al delta de fuentes descrito abajo. No acredita ejecución PostgreSQL nueva, aceptación ARM64, seis criterios L3, POS, integración canónica ni producción. La publicación condicional y la decisión final de gates corresponden a Root bajo la autorización existente.

Se cotejó el manifiesto [clock-regression-ci-source.json](clock-regression-ci-source.json), SHA-256 `39eacaa1397c8ed60dc84d4f6750ea2e97541abc1e977a5ef77559c938d8510b`: sus11 archivos, tamaños y hashes coinciden exactamente con los bytes revisados. Se leyeron workflow, preflight y composición CI, probe, driver, módulos productivos genéricos, seams del preparador y pruebas afectadas. No se editó ninguna de esas fuentes.

## Fronteras y seguridad

- El nuevo job PostgreSQL sólo se habilita con `push`, repositorio exacto `SrEdgarR/MECANET` y ref exacta `codex/verify-p1-l3-continuation`. PR6 conserva su trabajo de transporte, sin arrancar este job PG por el evento PR. El preflight admite exactamente las dos ramas de verificación y sigue exigiendo Linux x64, GitHub-hosted, usuario no root, SHA checkout igual a `GITHUB_SHA`, puertos libres y raíz efímera propia nueva.
- Se preservan `contents: read`, acciones fijadas por commit, checkout sin persistir credenciales, Node24.21/npm11.9, lock e instalación sin lifecycle scripts/cache. No se introducen despliegues, SSH, secretos de infraestructura, VPS, Vercel, Coolify, upload de artefactos o servicios de pago.
- Perfil Docker, imagen/digest, loopback/TLS, ownership/CID y cleanup positivo existentes permanecen. Los presupuestos CI siguen600s,8192 SQL padre,80 HTTP,60 conexiones PG,1CPU/1GiB para PostgreSQL. La limitación histórica de medición separada del SQL API/PG sigue declarada; no se presenta este presupuesto CI como contabilidad CP025 ni como una cota global completa de L3.
- El `continue-on-error` de la ejecución no permite un PASS parcial: las aserciones finales requieren SQL, HTTP, prueba de contención real y cleanup. La limpieza queda en `always()`; un resultado inexistente, incierto o fallido conserva FAIL.
- La selección no incorpora SQL007, schema4, POS, UI, contexto CP025, configuración privada ni material de QA. Los dos módulos de admisión son genéricos. La autoridad del ensayo CI efímero no readopta la QA nativa ABORTED ni consume r03/v2.

## Propiedad causal que deberá probar CI

El probe envuelve la misma conexión medida del reloj. Tras recibir el ACK real de `SELECT set_config` dentro de la transacción SERIALIZABLE, ejecuta una actualización autocommit separada y medida de `admission_version` mediante el rol `saas_api` ya legítimo. El preparador comprueba positivamente el rol y el privilegio: `saas_clock` no recibe ese permiso nuevo.

Cada intento debe registrar PID válido, ACK del contender y error PostgreSQL40001 de la actualización real del reloj; se exigen exactamente tres intentos y tres ACK ROLLBACK. Ningún error sintético se inyecta en el camino CI real. El doble SQL unitario está separado y no es evidencia PostgreSQL.

El driver admite sólo el `AdmissionError ADMISSION_BUSY` enlazado al diagnóstico exacto y nuevo del mismo reloj: tres conflictos agotados, ROLLBACK_ACK positivo, conexión devuelta, owner/generation/transfer/adquisición invariantes, tick/version iguales y estado no incierto ni detenido. No adquiere, reconcilia, duerme, modifica cuotas o cambia retries/timeouts. Los demás errores enclavan el fallo y detienen esa instancia. En particular, un deadline sin ACK de rollback sigue `ROLLBACK_UNCERTAIN` y nunca pasa a rechazo conocido.

Después del rechazo conocido, el probe observa por SQL el estado sin avance y vuelve a invocar el mismo driver tras la cadencia ordinaria120ms. Sólo acepta avance tick+1/version+1 y concordancia SQL entre AdmissionFence y TimeAuthority con el mismo owner y adquisición1. El tiempo programa la llamada; no sustituye la observación SQL o un FIN. La prueba exige el resultado completo tanto al terminar el recorrido como en `assert-pass`.

La comparación con el temporizador anterior es **inferencia del código**: la misma excepción real se observa y se vuelve a lanzar antes de clasificarla; el catch-all anterior se habría detenido. El informe declara `separateLegacyTimerExecuted:false`; no debe describirse como un segundo proceso legacy físicamente ejecutado.

## Contador de artefactos también portado

Los cuatro archivos QA añadidos durante esta revisión coinciden byte por byte con la corrección L3 ya revisada independientemente:

| Fuente | SHA-256 |
|---|---|
| `tests/qa/cp019/continuation-broker.py` | `1f72c29100438b48f84985f7ac85b0f4449826f56856b2a25b91d1c062fa80fd` |
| `tests/qa/cp019/continuation-broker.test.py` | `7f40810c414e3f5cc1ec18ecc2303748aba83a356f00db86bcc038846b7f8404` |
| `tests/qa/cp019/host.py` | `2a15c5797b4b2e8222fca3f757f98b096a01e7e3b6004964e44fc42b28e3f847` |
| `tests/qa/cp019/continuation-host.test.py` | `ebe0452b98e221ec050b279171ef0b0c7e20baa267355a73e022ef7a15d07b7b` |

Se conserva el cargo del temporal en la misma transición durable, al caso explícito, sin recursión, antes del ACK y del efecto. No cambia ninguna cota. `budget-limits.json` se mantiene con valores aprobados y bytes LF cuyo hash es `65cb46844d2b8a78250839ed14b25fca91561cfcdd7d46557ff5b98829f334c2`; su normalización local no es un cambio de presupuesto. Los límites r03, historia raw639/seq44 y bloqueo por la cota inferior no reciben otra interpretación mediante esta CI. Las pruebas Linux del workflow son la verificación física del transporte/fsync del runner efímero; tampoco sustituyen la aceptación del VPS.

## Evidencia de esta revisión y pendientes

- Verificación pasiva del freeze:11/11 hashes/tamaños coincidentes; ninguna fuente funcional fuera de la selección genérica detectada.
- Los35 tests afectados y el self-test CI12 negativas/3 aserciones del autor se conservan como evidencia local; no se repitieron sin cambio. El revisor ejecutó adicionalmente sólo los13 `admission.unit.test.js` afectados por la expectativa de rollback incierto, no incluidos en ese grupo35:13 PASS,0 FAIL/skip/todo,168.291ms. Son dobles locales, sin PostgreSQL, Docker ni red.
- `git diff --check`:PASS. Parser YAML no disponible en este entorno; sintaxis revisada como texto y validación de GitHub pendiente. Dependencias backend del preparador se instalan mediante el paso fijo `npm ci` antes del self-test y del ensayo físico; su ejecución nueva sigue NOT VERIFIED.
- El revisor no realizó operaciones Git, red, recursos ni publicación durante esta revisión; únicamente escribió este informe. Debe fijarse el commit final, conservar resultados fallidos si aparecen y exigir la ejecución CI de ese commit antes de atribuir un PASS PostgreSQL nuevo. No hay permiso de merge o cierre L3 por este documento.
