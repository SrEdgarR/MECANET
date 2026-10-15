# CP-020 — Puente de host TARGET

Estado: IMPLEMENTADO / REVISIÓN FOCAL ESTÁTICA PASS LIMITADO. Evidencia física: NOT VERIFIED.

## Alcance y procedencia

Implementación limitada al puente privado de QA autorizado para el namespace SC-011 `mecanet-qa-p1l3-r02` y su TARGET. No modifica producto, gates, presupuesto, proxy, DNS ni recursos ajenos. El módulo Python es pasivo al importar; solo el controlador raíz puede invocarlo sobre sus recursos acreditados. No se ejecutaron SSH, Docker ni SQL en esta contribución.

Código congelado para revisión independiente (antes del commit del controlador):

| Archivo | Bytes | SHA-256 |
|---|---:|---|
| `tests/qa/cp019/target-host.py` | 49731 | `fff61296510fb5bb0d479c7ff4b4afad2924afca2f34cf8ac29a222da8053fa3` |
| `tests/qa/cp019/target-host.test.py` | 15117 | `0c9046d49cbea8d7e5864ba5bf7503349a57188da6ae497c0324194f51870684` |

La fuente Git del artefacto ejecutado será registrada por ROOT después del commit. Estos hashes identifican archivos locales, no un despliegue.

## Contrato del puente

- `target_copy` ejecuta el copiador Node UID999, red `none`, perfil 0.25 CPU/128 MiB. SOURCE PG y todo runtime deben estar apagados y `pg_controldata` debe acreditar `shut down`/SID. Usa mounts cerrados SOURCE RO, backup/journal/TARGET propios y el mailbox `target-copy-host.json`.
- `verify_copy_completed` liga resultado Node, CREATED/END del job, checkpoint de copia original, material y fin SOURCE. Verifica el índice propio de hasta 4 MiB/10000 archivos/2 GiB, inventario completo, hashes y ausencia de hardlinks/symlinks en backup y TARGET. Se exige antes del canario SOURCE y antes del primer PG TARGET.
- `target_pg_start` no adopta un PG existente ni arranca dos PostgreSQL. Exige ambas copias, observa CID/perfil y SID positivo; no declara readiness.
- `target_resource` observa CID, etiquetas, digest fijado, bind/inodo, red/IP interna, SID y hash de identidad del host. No revela `machine-id` ni Docker Env.
- `target_prepare` carga los originales privados, journal/heads y captura SOURCE; consume el ensamblador Node cerrado. La CA TARGET es independiente. Se verifica el header del codec y el alias del mismo material antes de aceptar la publicación.
- `phase` mantiene el template y crea una configuración inmutable de invocación con UUID nuevo por intento; los IDs SQL, planes, caso, cuotas y counters permanecen. Monta el alias fijo esperado por Node. La lectura caliente utiliza publicaciones atómicas `{receipt,receiptHash}` 0400/UID999 y siempre observa fin real de job; timeout conserva KEEP.
- `runtime_start('worker'|'business')` exige el recibo real de `clock-plan` o `activation`. Cada CID creado tiene recibo root400; el inventario completo y su snapshot se fsync antes de cualquier START. Se reinspecciona el CID exacto inmediatamente antes del efecto. Worker y API usan secretos segmentados; no montan el master.
- `acceptance` admite exclusivamente `target-history`, `target-write` y `target-negatives`, usando los sockets HTTPS privados existentes. Un reporte previo válido se devuelve solo con CREATED/END originales; no se repiten sus HTTP por extensión.
- `stop_runtime` y `target_end` delegan al módulo pasivo `target-lifecycle.py`, cuyos bytes se comprueban contra el artefacto. El fin posterior al restart usa exclusivamente `target-live-end-after-restart.json`; el original permanece intacto y nunca sirve como fallback. Docker apagado no sustituye el fin SQL: el productor Node debe observar las sesiones propias realmente vacías.
- `expected_target_worker_owner` conserva el propietario original hasta una selección custodiada ligada a addition, viejo FIN, eliminación del viejo CID, prepare8 y nueva configuración. El wrapper `worker_restart` delega solamente al lifecycle validado por el artefacto. Su implementación física concreta continúa bajo propiedad ROOT/SQL y requiere revisión del delta; no hay aprobación ampliada ni PASS de reinicio por este wrapper.

## Presupuestos y fallos

Se conservan 30 min/3000 SQL/300 HTTP/2000 archivos de artefacto y 45 s/140 SQL/80 HTTP por escenario. Los archivos PGDATA se acreditan mediante su índice y límite separado. No se reinicia ningún counter, reloj ni case por retry. El registro técnico previo separa `target-pg-start`, `target-worker-start` y `target-business-start`: corresponden a efectos distintos ya autorizados, con las mismas cotas y sin aliases de retry. El módulo fija esos tres selectores; ROOT debe acreditar el nuevo registro cerrado antes del bootstrap. `enter_runtime_case` debe actualizar el caso activo predefinido sin reset antes de la operación caliente. La demanda real de worker/API puede impedir el recorrido dentro de esas cotas: solo medición física futura puede resolverlo.

Toda colisión, owner desconocido, ruta no propia, cambio de hash/inodo, prueba parcial, copia incompleta o deadline vencido falla cerrado y conserva evidencia. No se fabrican `sqlOwnersPresent=[]`, slots, ACK ni capacidad a partir de fixtures.

## Pruebas locales y sus límites

Python 3.14.3, Windows; 24/24 modelos causales PASS y sintaxis de ambos archivos PASS. Prueban namespace, rechazo antes del efecto, envelopes, budget previo a escritura, timeout que no se convierte en FIN, salida parcial del copiador, inventario real de archivos pequeños, hashes, hardlinks, path traversal, selector cerrado, gate de recibo y CREATED antes de START.

RED → GREEN focal: dos negativas de envelope/deadline fallaron contra el núcleo inicial; el validador de salida parcial aún no existía. Tras el cambio, 11/11 pasaron. El sellado requerido del reporte HTTP conserva los bytes originales 0600, exige CREATED/END positivo y cambia solo el modo a 0400 mediante descriptor validado. La fixture Windows acredita lectura400 rechazada antes del sello y bytes idénticos después; UID/fchmod/fsync son dobles de frontera, no custodia Linux. El gate de runtime y la negativa de ausencia del recibo CREATED se introdujeron antes de sus helpers y pasaron después. No se atribuye esta evidencia a PostgreSQL, Docker ARM64, custodia Linux, restauración física, browser ni los seis criterios funcionales L3.

La carrera real prevista entre `os.replace` y lectura de un mailbox fue comunicada a los productores Node. El lector especializado conserva archivo sellado viejo o nuevo completo y reintentos de apertura acotados; los lectores privados generales no se relajaron. Revisión estática del lector corregido: sin REQUIRED adicionales; sus pruebas son evidencia de service, no ejecución por este agente.

## Pendientes antes de ejecución física

1. Revisión independiente focal de service y SQL: 0 REQUIRED; SQL revisó el core actual `fff61296…/0c9046d4…` y ejecutó 24/24 modelos. Service preserva su revisión del corte22. Lifecycle final fue revisado por este agente sobre SHA `2ad9811e68bd71f7925286c5fb7182ff1ced956cef46dfc5c1bb55b5a5d11362` y test `bb32aa2c87a80a08f2eb0ba6da7a04a48e9cb263b723b156e7a747ab502adba3`: 0 REQUIRED estáticos, 12/12 modelos PASS y dos sintaxis PASS. Su fuente anterior `3a51151e…/5e3669bb…` conserva exclusivamente el alcance histórico de 7 modelos, sin atribuirle restart.
2. Acreditar en el paquete el wiring `enter_runtime_case`, worker restart y fin positivo completo; fuente Git, hashes y preflight del paquete exacto.
3. ROOT confirmó la separación semántica prebootstrap de PG start, shutdown precopy/postcanario y worker/business start, para evitar timers45 caducados entre subfases distintas. La definición y hash del registro cerrado serán acreditados por ROOT antes del bootstrap; no se autorizan aliases de retry ni ampliar cuotas.
4. Preflight por efecto en el entorno propio r02 y medición real de cotas; todas las aceptaciones físicas L3 siguen NOT VERIFIED.

Recursos creados/modificados por esta contribución: ninguno. P1 única fase activa; P1-L1/L2 conservan sus cierres históricos. Este documento no declara P1-L3 TERMINAL ni Integration/Quality físico PASS.

Registro de versiones de revisión: el primer core `5cf1a589…/cbf36900…` tuvo 19 modelos; el correctivo de sellado `a019e32f…/83d329a4…` tuvo 21; el delta final `b08d22d6…/3aa248d0…` incorpora la ruta exclusiva de fin tras restart y tuvo 22. No se sustituyen hashes históricos por el actual. Los hallazgos del lector mailbox y del reporte0600 fueron correcciones locales; ningún FAIL físico fue reproducido aquí.

Delta final del core: `fff61296…/0c9046d4…`, 24 modelos PASS y dos sintaxis PASS, añade exclusivamente los tres nombres semánticos de arranque confirmados por ROOT y el wrapper pasivo de restart. La prueba del sellado0600→0400 usa bytes reales de una fixture pequeña y dobles Windows explícitos de UID, fchmod y fsync.

Revisión browser independiente del ejecutor `d7b7998ffafec630ed00be20a544ccad375f9db5ac61467cb4e13a4cdddd953f` y prueba `1b6e1d76a82c25bbc7eb5f7db1f2f331fe686bafa24ea6a1a670dca8e7a06941`: dos REQUIRED corregidos (esperaResponse sin manejador inmediato y efectoDB0 sin witness posterior). Recheck 0 REQUIRED, 7/7 contratos locales PASS en Node24.21/Windows. El GET de stock después de GUI exige7/version2; no sustituye el witness SQL de auditoría/cuotas/efectos. No se ejecutó Chromium ni tráfico real en esa revisión.
