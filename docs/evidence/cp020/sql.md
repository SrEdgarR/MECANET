# CP-020 — ensamblador y fin SQL del destino, evidencia local

2026-10-14. **DETECTED / PASS local**, Node24.21.0 Windows x64 y modelos Python. La ejecución física PostgreSQL18.6 ARM64, TLS, Docker, HTTP, restore y cleanup remoto permanece **NOT VERIFIED** en este expediente local. Root conserva la propiedad de Git/SSH/recursos; este agente no realizó ninguna de esas operaciones, ni leyó `.env`, credenciales o material real.

Autoridad: P1-L3 A/B integrales DEC-067/068; SC-011/DEC-069 APPROVED según fuente humana «Apruebo SC-011». Pareja exclusiva r02/r02-target; r01 y evidencia STOPPED/KEEP. P1 única activa, L1/L2 TERMINAL, P0 PARCIAL y SaaS general NOT APPROVED. Baseline protegida SHA-256 `4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec` y Prompt `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d` medidos e intactos. HEAD inicial `82569344118307d0165912f11ddc94bd93d9ee2d` comunicado por Root; ninguna comprobación Git independiente ni atribución de estas pruebas a un commit posterior.

## Cambio concreto

`target-prepare.mjs` ofrece dos comandos cerrados, sin conexión, selección de secreto ni acceso durante import:

```text
node tests/qa/cp019/target-prepare.mjs copy-before-target
node tests/qa/cp019/target-prepare.mjs assemble
```

El primer comando requiere proceso Linux UID999, proyecto exacto destino e input400 `/run/qa-secrets/target-prepare.json`. Usa el `copyOffline` existente y hace una segunda copia independiente de backup a `/run/qa-target/18/docker`; fuente `/run/qa-source` RO, backup `/run/qa-backup/source-copy`, journal `/run/qa-journal/copy-index.json`. No monta ni lee master. Antes y después exige mailbox `/run/qa-live/target-copy-host.json` con paquete exacto `{receipt,receiptHash}`, UID999/400/700/NOFOLLOW/fstat, edad≤5s, fuente/destino PostgreSQL apagados, SOURCEFIN positivo y control-data `shut down`/SID exacto. Usa el lector especializado de runtime: acepta un FD original completo y sellado cuando Root publica atómicamente un inode distinto válido; una carrera previa a open se reabre como máximo tres veces. No relaja los lectores privados inmutables. Rechaza target preexistente, symlink/hardlink, alias/inode, inventario incompleto, hash o frontera cambiados; una copia parcial permanece KEEP.

**Distinción de presupuesto conservada:** baseline§223 limita a2000 los archivos de artefacto nuevos; PGDATA se mide separadamente con el inventario≤10000/índice≤4MiB y tamaño≤2GiB, como el `copyOffline` existente. PGDATA no se reclasifica como artefacto. El ledger carga el índice y las publicaciones de metadata; el nuevo helper revalida antes de efectos los30min y3000SQL/300HTTP/1000journal/2000artefactos acumulados, con ambas copias≤120s en conjunto, sin alias de caso, reinicio o aumento de cota. Los archivos/bytes de ambas copias se reportan expresamente. La corrección eliminó cargos por archivo físico añadidos durante desarrollo; no se ejecutaron en un recurso real.

`assemble` consume archivos originales fuente400 UID999: material elegido una vez, foundation/writers/correctives, NORMAL manifest, SOURCEFIN capture y source-live-end. Exige12 hashes externos de inputs, raw-hash JSONL, cada plan/head original del journal y checkpoints completos/copiar/final. El archivo `source-live-end.json` conserva su `{endProof,observedEnd,hash}` exacto; no se sustituye por un par elegido en cfg. El source fixture se deriva mediante `makeSourceRuntimeFixture`; captura proporciona directamente guardas, fingerprints central/A/B, imágenes locales, reloj, hashes de18 verificadores y versión del canario. Se llama `makeTargetConfigBundle` y al codec ya existente: header≤256KiB, índice≤4MiB, hasta5 chunks de200 registros, full-hash y header-hash externos. Publica sólo material controlador400, SOURCEFIN capture400 y piezas inmutables en secrets del destino; las credenciales/refs/generaciones del destino provienen de material r02 ya elegido. Las configuraciones API/worker segmentadas se publican en el paso frío `clock-plan` existente, sin autoridad master en los consumidores.

`target-end.mjs` añade un productor propio de fin real:

```text
node tests/qa/cp019/target-end.mjs
```

Lee únicamente input fijo400 `/run/qa-secrets/target-end-input.json`, material/bundle/capture y, si aplica, contexto de restart custodiado. Recibe inventario Docker positivo y usa el broker existente: un pool/lease bootstrap target, TLS estricto, SELECT read-only medido, timeout≤2s, cierre positivo antes de publicar. La consulta comprueba SID/IP/versión/generación/run/barrera/reloj y ausencia real de **todos** los consumidores `saas_%` y `qa_bootstrap`, excepto su propio PID. Un flag metadata no produce SQLFIN.

Perfil `worker-end-v1`: sólo inventario real `['worker']`, PROMOTING6/barrier true y propietario original, sin reinicio, sin API/web ni reportes HTTP. Perfil `source-end-v1`: cuatro CIDs reales y COMPLETE7 (o9 del restart custodiado); admite barrier false antes de `closeAdmission`, evitando una dependencia circular. Para los cuatro servicios exige los tres reportes terminados `target-history`, `target-write`, `target-negatives`, más sus CREATED/END propios con hashes externos, proyecto/owner/Node digest/comando/CID exactos, exit0 y tiempos posteriores a reportes. Los nueve aliases de metadata400 UID999 conservan los bytes/hashes de sus originales protegidos. No usa un booleano manual para afirmar ausencia HTTP. Resultado privado fijo `/run/qa-secrets/target-live-end.json` contiene `{endProof,observedEnd,createdServices}`; el FIN del reinicio usa exclusivamente `/run/qa-secrets/target-live-end-after-restart.json`, sin sobrescribir el anterior ni elegir otra ruta. stdout sólo hashes/metadatos sanitizados.

`target-lifecycle.py` es un módulo pasivo importado por el bridge Root con verificación de bytes contra artifact. Su inventario Root400 actual exige la misma versión inmutable `runtime-created-<hash>.json` y cada CREATED individual de CID/owner/pin/config/run/generación, persistidos antes del START. `stop_runtime` reinspecciona los CIDs exactos antes de detenerlos y exige EXIT/PID0/exit0/fecha real; no bloquea una parada propia por un nuevo sample de capacidad. Conserva una versión Root400 de la parada y su pointer atómico. `target_end` liga los tres reportes y los nueve aliases originales, publica un input inmutable por invocation y exige el hash del par real producido por Node; Root no escribe arrays de ausencia SQL.

`worker_restart` requiere el FIN completo original medido y todos los procesos originales detenidos. Conserva el inventario/input/journal/checkpoint originales; invoca el productor Node propio de Root después del preflight frío, verifica sus cuatro publicaciones400 y copia el contexto derivado a custodia Root400. Elimina únicamente el OLD worker exacto tras verificar nuevamente su salida positiva y registra DELETE. Exige el recibo real prepare COMPLETE8 antes de publicar y fsync el marker Root del nuevo dueño. Docker CREATE usa Node/pin/UID999,0.10CPU/192MiB, red data interna y mounts segmentados fijos; el CREATED individual y el snapshot de inventario se fsync antes de START. El recibo record COMPLETE9 se valida antes de devolver metadata. Una interrupción después del marker y antes del CREATE reanuda esa misma custodia; un resultado confirmado no vuelve a elegir IDs, crear proceso ni ejecutar fases. Los API/web originales permanecen detenidos. La evidencia local no acredita una transferencia real del reloj.

Root amplió el registro cerrado antes de bootstrap a116 casos semánticos: distingue PG/worker/business starts y stop/end inicial, reiniciado o prefijo. Python selecciona stop/end por el inventario real y el dueño custodiado; la existencia de un contexto previo al handoff no convierte el inventario original en reiniciado. NodeEND usa el caso end correspondiente. Las mutaciones y compensaciones originales conservan sus casos; cada caso sigue45s/140SQL/80HTTP y las cotas acumuladas intactas. Ningún alias de retry ni tercera cohorte se añade.

`target-witness.mjs` conserva todos los fingerprints históricos, ACL/funciones, IDs/generaciones permanentes, guardas, quotas y contadores originales; no resetea ni usa TTL. Cambia sólo el contrato de fin: compensación de prefijo preactivación admite el perfil worker existente y prueba inventario original exacto; después de activación/restart exige cuatro salidas. En ambos casos rechaza CIDs de fuente reutilizados y hace observaciones/SQL/rechecks positivos antes y después del testigo.

## TDD y verificaciones

RED inicial: módulo `target-prepare.mjs` ausente; implementación GREEN6/6, luego prueba adicional de original SOURCEFIN RED→GREEN7/7. Contrato de inventario worker RED29/30→GREEN30/30. `target-end.mjs` ausente RED→GREEN4/4, ampliación de reportes/END HTTP RED→GREEN5/5. Corrección de clasificación PGDATA RED2/7→GREEN7/7 con negativas por presupuesto, conteo, tamaño, enlaces y origen vivo.

Lifecycle: ausencia de worker_restart RED3 errores→GREEN; retry después de marker durable RED1/12→GREEN12/12. Preflight frío del chooser RED3/12→GREEN12/12,12ms. Dos parsings AST PASS. El selector de los seis casos stop/end y el retorno al mismo inventario están cubiertos por modelos sin Docker/PG/Linux real. La salida fija post-restart END suma la séptima prueba Node.

```powershell
$taskTests = @(rg --files -g '*.test.mjs' tests/qa/cp019)
& 'C:/Users/thede/Desktop/Proyectos de programacion/MECANET-develop/.qa-private/runtime/node.exe' --test @taskTests
python tests/qa/cp019/target-lifecycle.test.py
python tests/qa/cp019/target-host.test.py
```

Última corrida Node sobre las fuentes de la tabla: **275/275 PASS**,0 FAIL/skip/todo,16.3137941s; incluye browser/restart y registro116 de otros propietarios. Python lifecycle12/12 PASS12ms y core UI24/24 PASS48ms; dos syntax AST PASS. Incluye los contratos existentes, codec, control, custodia, budgets, protocolos, source-final, driver y runtime, todos locales con dobles de frontera donde aplica. No ejecutar el CLI contra PostgreSQL desde estas pruebas. El PASS previo256/256 se conserva como corrida anterior a sourceLiveEnd/clasificación PGDATA final,257/257 de16.1398715s anterior a peer END y258/258 de17.0076675s anterior al reader especializado/restart/browser/registro116; no se reatribuyen a la versión final.

| Fuente local | SHA-256 |
|---|---|
| `tests/qa/cp019/target-prepare.mjs` | `3fc19346ca4da33c057a3caff5afbc6816ff780700cbc6b8535a584b8461b3a4` |
| `tests/qa/cp019/target-prepare.test.mjs` | `470e1669f51b80548f8eede2ee1672401462136067096a5bb4859b08c20c1c67` |
| `tests/qa/cp019/target-end.mjs` | `47695f44dc42d414082a4bfe85602ac8a89098e9a2e3c9cdc8b4f1153d8c514a` |
| `tests/qa/cp019/target-end.test.mjs` | `e03104bcdcc1b3400845c14a2cf3248baac546e3dbc79aaff556d9e54c2d2c1d` |
| `tests/qa/cp019/target-witness.mjs` | `fd71188af34eb5a2fb4a43d635414194d3b4e5369e2171ec752c7807325061d8` |
| `tests/qa/cp019/target-witness.test.mjs` | `31f38a6d0892e014b0a36da4fa651b60be0809c2f1cb530de21fa0dd9ffc9716` |
| `tests/qa/cp019/target-lifecycle.py` | `2ad9811e68bd71f7925286c5fb7182ff1ced956cef46dfc5c1bb55b5a5d11362` |
| `tests/qa/cp019/target-lifecycle.test.py` | `bb32aa2c87a80a08f2eb0ba6da7a04a48e9cb263b723b156e7a747ab502adba3` |

Revisión independiente: este agente revisó runtime/driver de l2_service, con0 REQUIRED en su foco de hot mailbox, binding inmutable, credencial de rotate sólo ante28P01, fin positivo de pool, lease único y contratos worker1/cuatro; también cerró el delta de reader atómico/producer acceptance con0 REQUIRED. l2_service revisó prepare/witness con0 REQUIRED y detectó un REQUIRED en la API exportada END: el `main` validaba el full hash mediante loader pero la fábrica sólo validaba su formato. Corregido antes de recurso: la fábrica exige `sha256(bundle)===configBundleHash` y `sourceSha===plan.sourceSha` antes de cualquier pool/SQL. Reproducción RED5/6→GREEN6/6, negativas0query/0pool; corrida entonces258/258. Peer0 REQUIRED confirmado por l2_service sobre esa versión:13/13 prepare7/end6 PASS927ms y delta witness5/5 PASS2.122s. Se registran como sus corridas independientes, sin reatribuirlas al delta posterior ni a ejecución física.

Peer Node restart propio de Root (`4d8d24f6f54b8251a63005b4a46bf085ba2d7f05d1dc6714237f006f3a8ac776`, test`2859261d54f3ed0d74624c1644d8296ea64a867767f5f52a74c2157f52e3f768`):0 REQUIRED focal en query único/FIN/journal/custodia/retry; end7+restart5 PASS894ms. Mutación sólo en copia temporal: retirar TLS===true produce4/5 PASS y1 FAIL por chooser despachado pese a TLS falso; los bytes originales no se editaron y el directorio temporal propio se retiró. Prueba el guard relevante sin conexión física.

Peer de host solicitado por Root: el foco de `host.py` conserva IDs/pins, whitelists/cotas/UID, SOURCEPGFIN real y codebytes de `target_bridge`; checkpoint declara validación full diferida a Node. El REQUIRED de canario quedó resuelto por `verify_copy_completed`: exige recibo real `target-copy.json`, índice/job/checkpoint y verificación de backup/destino completos antes de reiniciar la fuente. UI corrigió también invocation nueva de transporte para retry, sin cambiar IDs SQL, y sellado600→400 por FD tras jobprovenance de los reportes acceptance. Peer focal del core final `fff61296510fb5bb0d479c7ff4b4afad2924afca2f34cf8ac29a222da8053fa3`/test`0c9046d49cbea8d7e5864ba5bf7503349a57188da6ae497c0324194f51870684`:0 REQUIRED y24/24 modelos PASS. **UI peer lifecycle final0 REQUIRED STATIC focal** sobre los hashes finales de la tabla;12/12 modelos PASS11ms+2syntax Windows, incluyendo preflight frío antes de stamp, FIN/custodia/DELETE exacto, prepare8/marker/CREATED antes de START, record9/retry. Su anterior7/7 PASS se conserva atribuido sólo al corte previo stop/end. No se editó target-host.py ni host.py desde este agente.

## RESUMEN PARA AUDITORÍA

PASS local de ensamblaje, identidad, transporte privado, copias de archivos en directorios temporales y testigos con dobles; **NOT VERIFIED** de PostgreSQL/auth/TLS/restore físico/HTTP/browser/cleanup remoto. No cambio SQL006, snapshot/Prompt, recursos reales, cuotas originales, datos legacy/producción, compartidos/Coolify/Nexora/EAK/DNS, Git o SSH. Las pruebas borraron únicamente sus directorios temporales propios verificados dentro de `tmpdir`; no backups/material reales.

Pendiente antes del primer efecto: integración Root de hashes/cfg/mounts, registro116 cerrado/preflight r02, SOURCEFIN original y JSONL con planes/heads, frontera apagada actual/control-data, bundle/material/SID real y publishers UID/mode del VPS. Root agregó los directorios target-heads/target-plans700 UID999 previos a begin-enroll; los directorios no se reclasifican como archivos de artefacto. El gate siguiente exige evidencia física nueva por cada recurso y las seis salidas L3-A1…A6; estos contratos locales no acreditan Integration, SaaS READY ni P2 funcional.
