# CP-021 — revisión independiente de presupuesto y fronteras físicas

Fecha: 2026-10-15. Revisor: agente `cp021_provider`, distinto del autor de la propuesta SC-013 y de los cambios Root en `host.py`, `target-host.py`, `target-lifecycle.py` y `target-commit-host.py`. Entorno: Windows x64 local, Python y Node fijado v24.21.0 para las verificaciones Node y de paridad. No se usaron SSH, Docker, PostgreSQL, `.env`, credenciales reales, túneles ni recursos QA. No se ejecutaron operaciones Git de escritura.

**Resultado: propuesta apta para revisión humana como cambio pendiente; suficiencia e infraestructura NOT VERIFIED.** El presupuesto vigente sigue en 2000 artefactos acumulados y 2000 por caso. SC-013/DEC-071 no está aprobada ni aplicada. Ningún resultado de este documento permite iniciar r02.

## Propuesta examinada

Archivo: [P1-L3_ARTIFACT_BUDGET_CHANGE.md](../../../.agentic/P1-L3_ARTIFACT_BUDGET_CHANGE.md). SHA-256 final revisado: `acd92b9ddb980a6bd0731610eb60b340601873ba39c981a21015c61d2514acf0`.

La propuesta cambia exclusivamente el límite global acumulado de artefactos de 2000 a 8192 para la pareja r02/r02-target, incluidas sus cinco variantes dentro del mismo TARGET. Conserva 2000 por caso, 135 nombres/scopes sin alias, SQL8192/caso y200000 global, HTTP80/caso y300 global, 45s/caso y1800s global, journal1000 registros/1MiB, índice4MiB/10000 archivos, 1CPU/2048MiB/60 conexiones agregados, dos leases por escenario, copia offline120s y drenaje30s. Los ámbitos de datos/copia/destino mantienen sus límites originales de2GiB; el destino incluye la suma de variantes, metadata y negativas KEEP. Los límites temporales no sustituyen FIN.

La motivación es comprobable: el snapshot contado contiene un mínimo cerrado de2020 y una ampliación conservadora incompleta de2414 creaciones cargadas. No se confunde ese mínimo con consumo físico, máximo ni capacidad acreditada. Las reducciones propuestas de53 archivos de dependencias y39 configs no bastan: el mínimo ampliado quedaría2322 antes de omisiones. No se han aplicado esas reducciones ni eliminado cargos de directorios.

Dos precisiones REQUIRED detectadas en el texto previo quedaron resueltas en el hash final:

- El margen restante se **propone** para familias omitidas y contingencias; no se afirma que las cubra de forma demostrada.
- 3600 muestras es la ilustración de1800s/0,5s, no un máximo formal. Faltan redondeo de intervalos por job, publicaciones iniciales, otros productores y una lista cerrada de invocaciones/materializaciones. El subtotal6014 tampoco es una cota superior.

No queda un REQUIRED de redacción pendiente en esa propuesta. Antes de una entrada física siguen siendo necesarios el controlador integral y una proyección por familia. Aprobar el global no demuestra que cada caso quepa en2000 archivos/45s ni que el resto de cotas se cumpla. Ante agotamiento se conserva evidencia, no se reinicia el ledger ni se crean alias, material nuevo o una tercera cohorte.

## Informes de presupuesto congelados

| Documento | SHA-256 |
|---|---|
| [artifact-budget-review.json](artifact-budget-review.json) | `b76559c9aeb6d24a6915ed039bc3cd19ea9066df57a70fbc1995c66a6716762b` |
| [artifact-budget-review.md](artifact-budget-review.md) | `07b0850be0629fc390db787c0bbb34ed731d8274e51a79e4846666ce29c1138c` |

Se conservan sus mínimos2020/2414 y los hashes originales de las fuentes del snapshot contado. La única precisión posterior es cambiar la supuesta cota de muestras a ilustración explícita sin máximo formal. Esos informes son una fotografía anterior a más cambios locales; no se retaggean como conteo de una release futura. Cualquier programa final exige otra revisión por sus bytes/llamadas concretos.

## Revisión de guards y custodia

Lectura de las fronteras Root y pruebas locales focales: PASS para los contratos modelados; operación física NOT VERIFIED.

- `host.py` conserva hechos globales completos antes de validar. La delegación particiona únicamente CIDs exactos con referencias Root400; no adopta contenedores por labels ni oculta consumidores activos. Permite PostgreSQL detenidos en KEEP y sigue rechazando más de un PostgreSQL activo o cohortes físicas activas simultáneas. La suma CPU/RAM usa los perfiles reales observados y la proyección del próximo efecto.
- `target-host.py` valida bind de datos y red/IP PostgreSQL mientras el contenedor sigue CREATED, publica referencia Root400 antes de START y coteja el CID/owner/perfil. La ruta física de variante difiere del proyecto canónico; la referencia mantiene ambos ámbitos sin cambiar globals del host. La observación valida sus hashes contra el contexto de lineage Root400 antes de publicarlos.
- El proveedor fija cinco rutas hijas del único TARGET aprobado. El material SOURCE permanece igual; los IDs/secretos nuevos pertenecen sólo al TARGET efectivo, se eligen una vez y no se reutilizan entre variantes. Las cinco copias proceden del backup/index originales y usan inodos independientes. El walker de footprint estricto no sigue enlaces ni admite hardlinks en datos/configs de variantes.
- El anchor prospectivo normaliza un `startedUptime` integral de Python100.0 a JSON100 para coincidir con `JSON.stringify`. La prueba Python→Node reprodujo RED y luego PASS. No modifica el ledger original, su valor numérico, secuencia, cargos o comienzo de reloj.
- La precustodia/copia de las cinco variantes pertenece a la única ventana original `copy-verify`, antes del main. La verificación posterior de copia es sólo lectura bajo el caso real de la variante. Las fases de cada variante conservan su caso cerrado y su comienzo original; cierre/stop/end A5 conserva membership/identity si ese caso ya fue abierto, sin volver a grant.
- `target-lifecycle.py` y cleanup usan inventarios/referencias sellados para seleccionar los CIDs propios. Un timeout o un guard de presión no se transforma en FIN. Esta lectura no acredita el comportamiento del daemon ni la ausencia física de SQL/HTTP.

## Fallo COMMIT/ACK y FIN

El orden revisado es consistente con FIN: CREATE identifica el CID real; los drafts no confirmados se finalizan en los mismos inodos, se fsync y se hacen400 antes de START. La inyección suprime el resultado sólo después de que COMMIT haya respondido; el occurrence conserva pid y backend_start originales. No se atribuye a esto una caída real de red.

El fallo exige los CREATED/END Root reales, log y occurrence durables, estado EXITED/PID0 y salida1. Retirar ese CID detenido sólo libera el slot; el END mantiene `sqlAbsence: NOT VERIFIED`. Un probe independiente exige la ausencia positiva del par pid+backend_start y del application_name del owner, con TLS, SID e IP esperados. El retry valida la pareja original y se limita a reconciliar el efecto sin repetir el mutador. Un fallo al cerrar el pool impide publicar la ausencia positiva.

Quedan dos condiciones de integración antes de conectar el helper a `phase()`: no publicar previamente el mismo archivo de invocación que el helper debe crear como draft, y retirar del conjunto de mounts del caller el bind anterior al mismo destino de config antes de añadir draft/retry. Se comunicaron al autor Root. En la fuente leída el helper aún no estaba conectado; por tanto esta revisión no declara el flujo completo ejecutable ni probado.

## Readiness y negativas de copia

La preparación empty usa una DB nueva literal `mecanet_control_empty` dentro del SID copiado original. Ejecuta las fuentes reales001/admission/003/005/006 ahí; no borra ni reescribe tablas de control/A/B/demo copiadas. Cambia credenciales y CONNECT sólo en la copia propia. Coteja fingerprints originales central/A/B antes/después; esa comprobación no cubre por sí sola toda metadata ni acredita físicamente el cluster. Configs API/clock segmentadas excluyen bootstrap y DB originales. Allclosed/A5 usan el coordinador real con restricción/versiones prospectivas; no adoptan una fila posterior observada. No apareció otro REQUIRED en esta lectura.

La cota de negativas de copia suma un footprint Root sellado de todo TARGET excepto main data y negativas, más main/negativas medidos en cada efecto, copias aún pendientes y reserva metadata4MiB. Las bindings incluyen código, material, índice, copia y END SOURCE; `allConsumersStopped` es atestación Root, no deducción por antigüedad. Una negativa con1,7GiB retenidos que antes cabría por medir sólo main ahora rechaza antes de copiar. Journal negativas preceden a copy negativas; las intencionales symlink/hardlink quedan KEEP al final y no se borran para obtener PASS ni se someten después al walker estricto como si fueran PGDATA válido.

## Verificación local reproducida

| Prueba | Resultado |
|---|---:|
| `python tests/qa/cp019/host.test.py` | 78/78 PASS |
| `python tests/qa/cp019/target-host.test.py` | 31/31 PASS |
| `python tests/qa/cp019/target-lifecycle.test.py` | 15/15 PASS |
| `python tests/qa/cp019/target-variant-host.test.py` con Node24.21 en PATH | 28/28 PASS |
| `python tests/qa/cp019/target-commit-host.test.py` | 7/7 PASS |
| `python tests/qa/cp019/target-readiness-host.test.py` | 11/11 PASS |
| Node24.21 `--test` commit-fault-hook, commit-fault-probe y copy-negatives | 27/27 PASS |
| Node24.21 `--test tests/qa/cp019/readiness-variant.test.mjs` | 16/16 PASS |

Son modelos puros y filesystem temporal local. Las pruebas Windows de metadatos modelan UID/custodia Linux cuando corresponde; no prueban ACL, fsync, Docker ARM64, PG18.6, HTTPS, navegador, throughput ni FIN físicos.

Fuentes leídas al terminar esta revisión; los cambios posteriores requieren revisar el alcance afectado:

| Fuente | SHA-256 |
|---|---|
| `host.py` | `e1005843dcba9b65517fd320b0253bb50be9f07ab8294179ebf59bb3b9579fa3` |
| `target-host.py` | `3ef0bbb776a41cbbbfd7bb504e09fc3a12269b5bf023e2ddb5d1695cd3515a20` |
| `target-lifecycle.py` | `26cc15ae2ca8d762989953e7f34a6e33fdb7086718c1d090e92086e991642407` |
| `target-variant-host.py` | `e9a942bdd6b1a44878241d8da272d6493f2a138ba7cdce2e8ccc2b44b4c0d013` |
| `target-readiness-host.py` | `bc459b6952c6575e8290eb6bcd24eb72ba0596430307d066db2bca785c737d9f` |
| `target-commit-host.py` | `26e8cacbfa35c06136ed8f73f00823205c2a35786ac7d16ed09d3190a194184a` |
| `commit-fault-hook.mjs` | `f0bc5d5421008fe3a45354d17623238debc7686ce09e8c33988a8532ad900520` |
| `commit-fault-probe.mjs` | `7c8a089e1de4fc29d1fd13f40c4c849051077dabebc95d80e26a2b1e81bebc60` |
| `readiness-variant.mjs` | `0bdd6a2c3640a75e6e31d6163436377686451f5e257d01f33ce5397995bc078c` |
| `copy-negatives.mjs` | `6a60f0a2a8855885a81b0a578b5674c80647448d6cf1a55c093f0b07beee3453` |

## RESUMEN PARA AUDITORÍA

CONFIRMED: SC-013 cambia sólo el global propuesto; sus límites de suficiencia están explícitos, los informes congelados muestran que2000 no alcanza para el programa contado y los modelos focales enumerados pasan. DETECTED: la integración completa conserva trabajo pendiente y los mínimos no son máximos. NOT VERIFIED: presupuesto integral por caso/global, infraestructura, capacidad, PG/SQL/HTTP/GUI, recuperación y FIN físicos. No se alteraron cotas ni se crearon recursos. Gate siguiente: decisión humana sobre SC-013; aun aprobada, completar implementación, revisión integral y Quality/Environment/preflight fresco antes del primer recurso QA. No hay PASS de salida SaaS ni de Integration Gate por extensión.
