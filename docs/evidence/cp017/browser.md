# CP-017 — navegador real de P1-L2

**Resultado actual:** recorrido privado A9 **PASS acotado** con producto `252b089343ccb5d91c0cd111471c69c4371c8924`, runner0189/ee796 y assets corregidos:20checks/56HTTP más revisión visual de las seis combinaciones320/768/1440×100/200%. La sección final fija fuentes, digest, hashes y límites. Los FAIL anteriores permanecen íntegros. No constituye cierre de los doce criterios ni Integration Gate.

## Antecedente1783: provenance y conclusión delimitada

**DETECTED:** el runner `tests/qa/cp017/browser.mjs` SHA-256 `54b8ff19b5a6f543cbe373d1c92562e99457fdd37bef7b7ba6fdc7993af2449f` terminó **20 checks automatizados PASS / 0 FAIL**, con **56 requests / límite150**, contra el producto `1783fd40f26104ed1dd2d8c36f02abafd5e05e3f`. Ventana **2026-10-13T19:56:08.802Z–19:56:28.030Z**. Entorno: Node24.21.0 y Chromium156.0.8078.4 dedicados en Windows → HTTPS exclusivamente `app.mecanet.test:18443`/loopback → API/PostgreSQL reales de la cohorte sintética CP017. Root acreditó runtime propio y túnel; esta ejecución no inspeccionó ni cambió infraestructura.

El resultado automatizado **no cierra L2-A9**: la inspección visual posterior encontró una deficiencia real de legibilidad de la tabla con320px/texto200%. Tampoco constituye PASS global de L2-A1…A12 ni Integration Gate. La corrección responsive posterior requiere sus propios hashes, build y verificación.

Resultado sanitizado: SHA-256 `cd5b23edd4fa0105728a7d6ed471040a782075f66ce26457fd1222242e067ce3`. Copia privada inmutable respecto a nuevos ensayos: `.qa-private/cp017-browser-history/1783fd40-runner54b8-pass/result.json`; doce archivos preservados (resultado y once capturas). SHA-256 del stdout privado de esta corrida: `edba18727a176b7d59e5c623d7785b5728becf14d203945c65fd38f0eb85ac5e`. No se versionan los archivos privados, credenciales, cookies, cabeceras ni trazas.

## Comprobaciones automatizadas de esa corrida

| ID | Comprobación observada | Resultado |
|---|---|---|
| B01 | TLS: CA propia, hostname y SPKI exactos | PASS |
| B02 | CA ajena y hostname incorrecto rechazados | PASS |
| B03 | Login por teclado, selector e inventario del owner A | PASS |
| B04 | Validación del alta, error asociado y foco sin POST | PASS |
| B05 | Alta201, stock0, versión1 y referencia conocida | PASS |
| B06 | Recepción201, stock7/versión2; movimiento de la misma operación/producto | PASS |
| B07 | ACK201 perdido sólo hacia cliente; UNKNOWN/pista, recarga GET confirmado sin nuevo POST | PASS |
| B08 | Cambio de empresa oculta contenido; referencias y operaciones de B reciben403 | PASS |
| B09 |320px: radios0, documento contenido, controles/foco de la secuencia inicial | PASS automatizado; límite visual indicado abajo |
| B10 |768px: mismas comprobaciones | PASS |
| B11 |1440px: mismas comprobaciones | PASS |
| B12 | Contraste de texto y foco del tema claro | PASS |
| B13 | Tema oscuro, contraste y movimiento reducido | PASS |
| B14 |320px/texto200%: sin overflow del documento/controles superiores | PASS automatizado; legibilidad de tabla FAIL visual |
| B15 |768px/texto200%: mismas comprobaciones geométricas anteriores | PASS; no atribuir la futura ampliación del test |
| B16 |1440px/texto200%: mismas comprobaciones geométricas anteriores | PASS; no atribuir la futura ampliación del test |
| B17 | Miembro sólo inventory.receive: formulario sin GET de stock/movimientos; recepción201 lleva saldo a10 | PASS |
| B18 | Ese miembro recibe403 sin items para stock/movimientos y B | PASS |
| B19 | Logout200 de ambos contextos elimina pistas/contenido; consulta posterior401 | PASS |
| B20 | Sin excepción JavaScript ni petición a otro origen; presupuesto respetado | PASS |

La pérdida de ACK se produjo mediante un único transporte Node HTTPS al loopback, con CA/SNI/SPKI exactos y cabeceras/cookie únicamente en memoria: recibió201 completo y abortó sólo la entrega al navegador. **No demuestra COMMIT incierto del servidor, ni reconciliación/liberación de deuda sin fin positivo.** Ésas son pruebas SQL/protocolo independientes.

Hubo dos POST productos201 (alta ordinaria y efecto del ensayo ACK), dos POST recepción201 (owner y miembro), GET movimiento200, GET resultado200; negativas403 y consulta401 posterior al logout. No hubo503 ni429 en la corrida exitosa. La recuperación explícita transitoria del runner **no se ejercitó y permanece NOT VERIFIED**.

## Tres archivos compilados frente a dos fingerprints browser

El manifiesto SC008 previo registra tres archivos compilados. El navegador fingerprintó los **dos assets JS/CSS realmente recibidos**, idénticos a ese manifiesto. El HTML no fue fingerprintado por este runner; su hash siguiente procede del build histórico local, no de una medición HTTP de esta corrida.

| Archivo | SHA-256 | Fuente |
|---|---|---|
| `saas.html` | `081c7c22bf2c1df6ad66354b792dad65a2c40fa39bfdd2262a48fd2d4bed5848` | Manifiesto SC008 anterior; build fuente ff79d979; entrega HTML no fingerprintada |
| `assets/saas-LdbSFy8I.css` | `65fab55c745b0667cb74c5bbc4c07c9d0eae9d888529f9ee8ba72b4937676504` | Respuesta browser real1783fd40 y manifiesto anterior coinciden |
| `assets/saas-RPQxwTiP.js` | `17eacdb66d1e9adc0f2f1d2f5335a9017efc8ba251eb02d757d69873f01a5d92` | Respuesta browser real1783fd40 y manifiesto anterior coinciden |

## Fallos preservados y limitación responsive

1. **bdaa349:** alta y recepción201 precedieron a GET movimientos503/ADMISSION_BUSY; el contenido fue ocultado y se mostró recuperación explícita. El harness agotó su espera del movimiento. Resultado/capturas están en `.qa-private/cp017-browser-history/bdaa349-failed/`. La recepción no se interpretó como rollback ni se repitió para recuperar esa lectura.
2. **Primer intento1783fd40:** `route.fetch` usaba DNS Node, que no heredaba el MAP de Chromium; ENOTFOUND interrumpió el callback del ensayo ACK y no finalizó result.json. No atribuirle el result.json anterior. Marcador sanitizado y dos capturas de ese intento en `.qa-private/cp017-browser-history/1783fd40-failed/`. El stdout contiene cabeceras de la sesión QA sintética y es **privado/no publicable**. No quedó Chromium propio activo. Se corrigió el transporte y la captura de errores; la posterior corrida54b8 se registra separadamente.
3. **Revisión visual de la corrida20PASS:** `inventory-text-200-percent-320.png` mide320×9885px. SKU/nombres/cabeceras se comprimen en líneas de casi un carácter, y la región recorta parcialmente acciones de fila. El test previo comprobaba el documento y controles superiores, sin medir legibilidad ni foco de acciones con200%. **L2-A9 permanece FAIL en este subalcance visual** hasta verificar la corrección; no se cambia el resultado automatizado histórico.

La corrección autorizada dentro de la baseline limita sus cambios a presentación/foco y afirmaciones de navegador: tabla con anchuras legibles y scroll horizontal contenido en la región ya etiquetada/focusable; SKU/nombre con espacio mínimo de12caracteres por línea; encabezados no fragmentados, acciones apiladas, anillo interior y desplazamiento `inline: nearest` al enfocar sus botones. El test comprueba acciones completas y foco visible con100%/200% en320/768/1440, teclado capaz de desplazar la región y radios0. No modifica permisos, flujos, efectos, APIs ni infraestructura. RED visual acreditado por esa captura; GREEN browser real del nuevo artefacto **NOT VERIFIED** aquí. La verificación local de layout se registra separadamente abajo.

Once capturas sintéticas de la corrida54b8, privadas: alta, recepción, ACK incierto,320/768/1440, oscuro, texto200%320/768/1440 y miembro receive-only. Se revisaron visualmente oscuro y320/texto200%; ninguna captura contiene formulario de contraseña. No usar datos reales para completar la evidencia.

## Corrección A9: verificación local independiente, sin API/PG real

**DETECTED:** en2026-10-13T20:14:35.715Z–20:14:37.219Z el fixture privado `.qa-private/l2-ui-layout-check.mjs` cargó el React compilado SC008 con respuestas HTTP simuladas sólo dentro de Chromium, sin listener ni conexiones a servicios. El CSS antiguo real de la corrida1783 produjo RED con la nueva afirmación de legibilidad320/texto200%; la corrección pasó los seis casos320/768/1440×100%/200%, con columnas/cabeceras legibles, scroll de región por ArrowRight y cada botón completamente visible al recibir foco. Catorce peticiones simuladas, cero mutaciones y cero orígenes inesperados. La captura local320/texto200% también se inspeccionó: la tabla conserva columnas legibles mediante desplazamiento horizontal interno; el documento conserva su ancho. Las capturas locales vuelven la región al inicio para mostrar la primera columna, después de comprobar foco/acciones; no representan el estado de foco medido.

Esto es **PASS de layout local RED→GREEN**, no integración browser→API→PostgreSQL ni PASS nuevo de L2-A9. El fixture no usa cuentas/credenciales, secretos, `.env` ni datos reales. Resultado y siete capturas permanecen privados en `.qa-private/l2-ui-layout/`; la pista de prueba es sintética y no pertenece a la cohorte QA remota.

La ejecución SC008 local final terminó PASS:55tests frontend (incluido foco de acción sin crear/recibir/leer),3sanitización documental,4guards, auditorías completa/runtime sin hallazgos y cleanup propio PASS. El manifiesto reporta HEAD `1783fd40f26104ed1dd2d8c36f02abafd5e05e3f` **más delta UI sin commit**; fingerprint de entradas `bb07cb6959557ef75f019d89a8a839450190f1c39dea090c831fd10bd262d0d4`. No atribuir estos assets a1783 sin ese delta. Se eliminaron únicamente los cuatro assets generados anteriores/intermedios, tras comprobar el destino literal bajo `client/dist-saas`; la historia privada de browser quedó intacta. El directorio final contiene exactamente tres archivos:

| Archivo final | Bytes | SHA-256 |
|---|---:|---|
| `saas.html` |525| `c7687b27d7359c17eb49d1ea13ba54c46228152d48cfda32e9e16447157bd4b2` |
| `assets/saas-BJsNePUp.js` |182756| `bd0a3ceeeb89aa8bc145432269820613b907eb97f35221be94183f21a1e78d9d` |
| `assets/saas-mSB78BVf.css` |7470| `ad6fe416fc0d157c3b762c9ff580c962178d3ddeb5cc2e5c3af6d516bbe0ca27` |

La ampliación inicial de runner fue `887fed0f6d70c36a49cd07f47b7687fa881acb4b7c7e655cfdadb405c7b28b44`; después se sustituyó el foco programático de las acciones por Tab real, SHA-256 `e3842ca45ee3e63fa09d7e22d34c945d02cd7135e9152c066ae0cc318311ba07`. El fixture local volvió a verificar RED antiguo→seis GREEN con ArrowRight/Tab en2026-10-13T20:17:11.545Z–20:17:12.962Z; resultado privado SHA-256 `2c1718ccd87cd3b406e5924db88c59c9d7bce6fd849deed6bc24f8de524a11b0`. No se elevan cuotas, no se repite POST para recuperar lecturas y no se reutiliza la corrida histórica como PASS del delta.

## Primer ensayo del artefacto corregido6101: fallo acotado de acceso

**DETECTED:** producto `6101dc684a7662f5c0961c1fac8ce4827ca1da55`, digest QA reportado por root `e7a666d6f3bd751421efe4a4addd094677eca41de218addd5cd26ebbab517b4e`, runner `e3842ca45ee3e63fa09d7e22d34c945d02cd7135e9152c066ae0cc318311ba07`: dos comprobaciones TLS PASS y entrada selector→inventario FAIL por TimeoutError2, diez requests. UTC2026-10-13T20:29:08.773Z–20:29:26.913Z. Login200; GETtenants503→200; activity200/catálogo200; segundo activity503 y ningún GETinventario. Root confirmó código seguro ADMISSION_BUSY en ambos503 y coincidencia temporal con su ensayo SQL (terminado20:29:25). No hay producto defectuoso demostrado por este timeout; tampoco PASS de acceso/función ni de la nueva legibilidad. Cero POSTtenant: no se crearon productos ni recepciones en esa corrida.

Los JS/CSS recibidos coinciden exactamente con los assets finales `bd0a3cee…`/`ad6fe416…` indicados arriba. Resultado sanitizado SHA-256 `e516212effd7362b4bfc6593fd613fbbc9e6f3e222c718e20fbbb6c3d139d721` y stdout privado `527bc43a644b5dc7c80f31f84c370f28d4c5d3126f038c3a639ac4f47021732e`, preservados en `.qa-private/cp017-browser-history/6101dc68-runnere384-failed/`. No se tomaron capturas nuevas; no atribuirle las capturas de1783 que siguen en el directorio de trabajo.

La causa del harness se acotó en el código: `readJson` permite recuperación GET acotada, mientras `selectInventory` envía una sola activityPOST interactiva y, al recibir503, `fail()` vacía directorio/contenido y presenta RetryAccess. El test esperaba directamente H1Inventario y omitía la pantalla correcta de error/recuperación. **No se cambió el producto.** Runner revisado SHA-256 `887cabb33ae7802f3f6c9ce30d1b07b752c4871cb6a563300a47c71c1565f11a`: admite una sola recuperación explícita de acceso por corrida, sólo503/ADMISSION_BUSY, Retry-After válido, ventana total8s y límite150HTTP. Comprueba contenido oculto, botón temporalmente deshabilitado, sesión/directorio frescos y grants reales; luego navega explícitamente el deep-link, con lecturas autorizadas y sin repetir activityPOST ni ningún POSTtenant. Cambio de permisos o fallo persistente conservan FAIL.

Fixture causal privado `.qa-private/l2-ui-access-recovery.mjs`, compilado actual y helper exacto del runner,2026-10-13T20:33:15.709Z–20:33:27.984Z: tres comprobaciones **PASS locales HTTP simulado**. Recuperación1 en1463ms/17peticiones simuladas, dos activityPOST originales (segunda503), cero reenvíos y una lectura inventario; grant modificado denegó antes de leer inventario; fallo persistente siguió FAIL dentro8s con tres intentos GET. Cero POSTtenant/orígenes ajenos. No representa integración real. Queda **NOT VERIFIED** el nuevo runner contra la cohorte QA sin concurrencia del ensayo SQL; requiere fuente/digest/config propios, y posterior revisión visual de las seis combinaciones. Se mantienen separados los FAIL históricos, el PASS local y cualquier resultado real futuro.

## Intento299 con runner887: fallo de finalización del harness

Producto `299ce3c0b6c821f03d0383b7da4d394af1e36475`, digest informado por root `bb0a1871c171a05d73155112bc79e9a08b2a2da4fa8ac263b153e1ff5d0e676f`, runner `887cabb33ae7802f3f6c9ce30d1b07b752c4871cb6a563300a47c71c1565f11a`: exit1 por rechazo de `waitForResponse(activity)` sin observador mientras otra acción UI todavía estaba en curso. No se finalizó result.json. El archivo anterior6101 **no pertenece a299**. No se adjudican PASS parciales por el orden del código ni por disponer de capturas.

Historia privada `.qa-private/cp017-browser-history/299ce3c0-runner887c-failed/`: marcador sanitizado, stdout privado y tres capturas nuevas identificadas por metadatos del intento (alta/recepción/ACK incierto); no se copiaron capturas viejas. Metadatos UTC del archivo stdout20:39:51.3342750Z–20:40:12.3582307Z, no ventana emitida por un reporte final. La causa subyacente del evento activity ausente permanece por precisar con una nueva ejecución que finalice su evidencia; el stack sitúa el waiter durante el retorno al selector, sin probar por sí solo un defecto del producto.

Corrección **sólo de harness**, SHA-256 `ee796f884576e9f0506f2fbebcd92ba6815112e325a870733e5753bc72bddc2e`: observa inmediatamente el rechazo del waiter pero lo conserva para su await/FAIL, comprueba H1selector y entrada catálogo visible antes de crear el waiter, y captura en caso de error únicamente path/H1/links de empresa/número de tablas/botón RetryAccess. No almacena identidad, cabeceras, cookie ni payload. No ignora timeouts, no deduce grants y no cambia producto/assets.

Fixture local ampliado,2026-10-13T20:45:22.356Z–20:45:37.173Z: **seis PASS HTTP simulado / cero unhandled rejections**. Además de las tres ramas anteriores, cubre retorno desde `/app/tenant/catalogo` mediante CambiarEmpresa, ausencia de grant catálogo (FAIL antes de esperar/enviar activity), y fallo de foco después de crear un waiter (FAIL conservado, rechazo pendiente observado al cerrar el contexto). Dos recuperaciones positivas en1470/1443ms, siempre dentro8s, sin POSTtenant ni activity repetida. Las negativas permanecen negativas; no son un PASS de integración ni una relajación del criterio de acceso. La próxima corrida deberá registrar producto299 y hash/fuente del runner **por separado**, porque este runner posterior no forma parte del manifiesto299.

## Ensayo299 con runner0189: reporte final FAIL de acceso, sin crash

Producto299/digestbb0a anteriores, runner commit `0189ec0161ae305d9606a3c2f2d96d08bdf5eaa6` y SHA-256 `ee796f884576e9f0506f2fbebcd92ba6815112e325a870733e5753bc72bddc2e`: **2TLS checks PASS / entrada inventario FAIL**, diez HTTP, cero POSTtenant. UTC2026-10-13T20:47:35.367Z–20:47:47.966Z. Login/tenants/activity200; catálogoGET503 dos veces. El estado final seguro fue `/app/A/catalogo`, H1ServicioNoDisponible, cero tablas/links de empresa y RetryAccess visible. No hubo ensayo SQL concurrente reportado por root en esta corrida; la causa operativa de las respuestas503 persistentes requiere diagnóstico propio, no se presume un fallo visual ni se relajan cuotas/criterios.

El harness finalizó result.json sin excepción no manejada; la observación de promesas no convierte el error en PASS. Su recuperación explícita anterior sólo contemplaba activity503, por lo que no ejercitó RetryAccess al agotar la lectura del catálogo. No se alcanzaron alta/recepción/ACK ni las seis mediciones responsive, y no se atribuyen capturas antiguas a esta corrida. Los dos fingerprints JS/CSS recibidos conservan sus hashes finales. Resultado y stdout privado están preservados en `.qa-private/cp017-browser-history/299ce3c0-runner0189-failed/`. La integración real nueva de A9 sigue **NOT VERIFIED**; el PASS del layout simulado y el FAIL visual histórico conservan sus alcances.

## Corrida252 corregida: A9 PASS del recorrido aprobado

**DETECTED / BROWSER→API→POSTGRESQL REAL:** código producto `252b089343ccb5d91c0cd111471c69c4371c8924`; digest aceptado reportado por root `sha256:6b46bda6aae7d4aa34075ce808702f6f288e2f2df6919ef25847bebd033ec70f` (972archivos/4680662bytes). Runner commit `0189ec0161ae305d9606a3c2f2d96d08bdf5eaa6`, SHA-256 `ee796f884576e9f0506f2fbebcd92ba6815112e325a870733e5753bc72bddc2e`; producto/harness registrados por separado, sin atribuir este runner posterior al manifest299. Ventana **2026-10-13T21:07:48.364Z–21:08:08.987Z**. Node24.21.0, Chromium156.0.8078.4 dedicados en Windows, HTTPS loopback con CA/hostname/SPKI exactos y dos API/PostgreSQL18.6ARM64 de la cohorte sintética propia según entrada acreditada por root. Root suspendió otros ensayos SQL durante esta corrida.

**20checks PASS / 0FAIL,56requests≤150**. Resultado sanitizado SHA-256 `973baf94c83f9cb6eb901b51e8aba89818c1610b58356a77924692333a880d34`. Historia preservada antes de futuras ejecuciones: `.qa-private/cp017-browser-history/252b0893-runner0189-pass/`, con resultado, stdout privado, once capturas y manifiesto de hashes. Hash stdout `edba18727a176b7d59e5c623d7785b5728becf14d203945c65fd38f0eb85ac5e` (resumen corto sanitizado). No se versionan imágenes, credenciales, cookies, cabeceras o trazas.

Las20comprobaciones cubren TLS positivo/negativo; login/selector por teclado; validación y foco sinPOST; alta201/stock0/versión1; recepción201/stock7/versión2 y movimiento opaco coincidente; ACK perdido sólo hacia navegador y recarga GETconfirmado sin rePOST; cambio de empresa/contenido oculto/negativasB; tres anchos con radios0, teclado y controles contenidos; contraste claro/oscuro/reduced-motion; tres anchos con texto200%; miembro sólo inventory.receive sinGETinventario/movimiento y recepción201 que lleva saldo a10; negativas403 sinitems; logout200 de ambos contextos con hints/contenido vacíos y401 posterior; sin excepción JavaScript ni origen externo. Las dos altas y dos recepciones son efectos exclusivamente sintéticos autorizados, no datos reales ni un inventario comercial completo.

**Afirmaciones nuevas de legibilidad/foco realmente ejecutadas:** para320/768/1440 tanto100% como200%, SKU/nombre disponen de al menos12caracteres aproximados por línea, cabeceras no se fragmentan más allá de tres líneas, no hay overflow del documento, la región2D responde a ArrowRight y Tab real recorre cada acción comprobando que el botón/anillo completo queda dentro de su región. Esto supera la carencia de la medición histórica1783 sin reescribir su FAIL.

Se inspeccionaron las seis capturas correspondientes. La tabla conserva scroll horizontal interno para columnas legibles y las capturas terminan enfocadas en Movimientos; por eso las primeras columnas pueden estar fuera de la ventana horizontal en la imagen. Éste es el desplazamiento contenido de una tabla2D, no la compresión de datos en columnas de un carácter del FAIL1783. En320px el rótulo Movimientos ajusta en dos líneas y permanece completo/accionable con anillo visible; mejora estética opcional, sin defecto funcional REQUIRED detectado. Los controles superiores/formularios/paginación refluían, sin recorte documental; los temas y datos son exclusivamente sintéticos. Los cuadros visibles en un nombre de prueba son el vector permitido de200controles escapados, no datos comerciales ni un error de renderizado.

| Captura revisada | Dimensiones reales | SHA-256 |
|---|---|---|
| `inventory-320.png` |320×4616| `751b4c89604d4e35971c58b6007eb34d9ac48b078053115ee1fc55ca130edc60` |
| `inventory-768.png` |768×4063| `c95c8030bfbdcf24ab3731d175f27d749305bc5594b0ca3faa558236348d1dfd` |
| `inventory-1440.png` |1440×4032| `501e44393bdb08eb7eec022991dcd80b309f71fa5540e2a72f333704f5872989` |
| `inventory-text-200-percent-320.png` |320×9863| `5ce4c1bccfe385c18b4109da83033884f36807d52f87c1aed339db24670d8d77` |
| `inventory-text-200-percent-768.png` |768×8465| `38a76a97c95178bd8f8264538927a14c10174f88244e986e598bbce2f106f3c3` |
| `inventory-text-200-percent-1440.png` |1440×8011| `d2e2a29af7c55b7e333660cd653bc545aab422dec0795351a155db49f5f382d2` |

**Fingerprints realmente recibidos:** JS `assets/saas-BJsNePUp.js` / `bd0a3ceeeb89aa8bc145432269820613b907eb97f35221be94183f21a1e78d9d`, CSS `assets/saas-mSB78BVf.css` / `ad6fe416fc0d157c3b762c9ff580c962178d3ddeb5cc2e5c3af6d516bbe0ca27`, iguales al manifiesto de tres assets finales. HTML `c7687b27d7359c17eb49d1ea13ba54c46228152d48cfda32e9e16447157bd4b2` es identidad de build aceptada, no una medición HTTP HTML nueva del runner.

No hubo503/429 en esta corrida; las ramas de recuperación explícita de acceso/movimiento **no se ejercitaron en el PASS real** y conservan sólo la evidencia local simulada y sus FAIL históricos. ACK201 perdido se limita a la entrega al cliente; no demuestra COMMIT desconocido del servidor ni reconciliación de deuda. El fix de cierre de lectura/SQL incierto, costo/ledger, SKU concurrente, último cupo, restore/drain/rollback y la integración Git tienen evidencia independiente. Root informó después del navegador que la integración252 aún tenía8PASS/2FAIL/3NV; este PASS UI **no los resuelve ni cierra el lote**. A9 se acredita para este recorrido/artefacto, con55frontend SC008 por sus hashes; la accesibilidad global/POS/pantallas comerciales/fiscales/operador y producción no se aprueban por extensión.

## Aportación a los doce criterios aprobados

Objeto exacto: `docs/specs/p1-l2-approved/baseline.md`, SHA-256 `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71`; wrapper/DEC061–062 acreditan A/B. El plan previo `browser-coverage-plan.json` es histórico de preparación, no un resultado actualizado ni una nueva baseline.

| Criterio | Aportación browser1783fd40 | Límite/resolve-before |
|---|---|---|
| A1 | Flujos/contratos ejecutados | Baseline/Design Gates se acreditan aparte; no aprobación por browser |
| A2 | Ninguna migración | Ensayos SQL de migración antes de writer |
| A3 | Negativas de lectura por grant | HBA/CONNECT/DDL/DML/rotación/pools antes de salida credenciales |
| A4 | Owner/miembro y empresa B,403 sin items | Propósitos/forjados y cero pool/deuda requieren HTTP+SQL completos |
| A5 | Logout ordinario y401 posterior | Intercalados/fences/restart/COMMIT y cierre antes de salida protocolo |
| A6 | Alta201 y validación sin POST | Concurrencia/cupo/idempotencia/canonical SQL antes de salida escritor |
| A7 | Recepciones7+3, movimiento opaco y recuperación ACK cliente | COMMIT servidor/reinicios/overflow/concurrencia se acreditan aparte |
| A8 | No replay automático; presupuesto56/150 | No prueba del ledger/coste/reserva/fin/reconciliación |
| A9 |20 checks previos y flujo real; defecto visual identificado | **Corregir/reverificar legibilidad y foco200% antes de salida UI/ciclo** |
| A10 | Source y fingerprints JS/CSS | ARM64/digest/health/drain/rollback/productores: evidencia root separada |
| A11 | Ningún restore | Segundo destino/journal/epoch/counters antes de salida recuperación |
| A12 | Artefactos sanitizados/historia conservada | Review/CI/Integration Gate/checkpoint/cleanup son independientes |

Siguientes límites UI: no ampliar este flujo a POS/NCF/e-CF, reservas, métricas operador, precios, unidades fraccionarias o soporte global. Los gates y diseños de esas partes siguen en su roadmap. No hay aprobación A/B nueva ni cierre P1-L2 en este documento.

Recursos de infraestructura creados/modificados por esta contribución: **ninguno**. Git/SSH/despliegues: **ninguno**. Los efectos fueron exclusivamente los productos/recepciones sintéticos autorizados del runner, mediante la API propia.
