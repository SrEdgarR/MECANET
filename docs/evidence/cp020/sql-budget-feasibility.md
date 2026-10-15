# CP020 — viabilidad del presupuesto SQL antes de r02

Estado: **FAIL de viabilidad local del pipeline actual bajo §223**. No constituye fallo observado de PostgreSQL. Root confirmó que r02 y su ledger todavía no se crearon. Este análisis no modifica la baseline, el registro de escenarios ni ninguna cota.

La baseline protegida `4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec` exige 140 SQL/caso y 3000 SQL acumuladas, incluidos retry/negativas/observaciones. `ledger.mjs` carga cada `pool.query` y cada `client.query` antes de enviar la orden, incluyendo BEGIN, configuración y COMMIT/ROLLBACK. No se excluyen consultas de fondo ni se cambia el significado de la unidad.

## Mínimo determinista reproducible

`runtime-budget.test.mjs` invoca los módulos reales de admisión, reloj, runtime de recuperación y coordinador con filas sintéticas y cuenta cada llamada SQL. No abre PostgreSQL, red, archivos privados ni procesos Docker.

```powershell
& 'C:/Users/thede/Desktop/Proyectos de programacion/MECANET-develop/.qa-private/runtime/node.exe' --test tests/qa/cp019/runtime-budget.test.mjs
```

Resultado local: **3/3 PASS**, 0 skip/todo, 83.7479ms. Una petición de empresa con cuatro scopes, primer claim elegible, ningún conflicto/retry/heartbeat y ticket terminado cuesta:

| Camino real | SQL |
|---|---:|
| observeClock inicial | 1 |
| admit | 22 |
| observeClock de la primera espera obligatoria | 1 |
| claim | 29 |
| startWork | 16 |
| consumeBytes | 16 |
| finish o transición UNCERTAIN equivalente | 12 |
| **Mínimo de admisión por petición** | **97** |

Cada transacción usa BEGIN + SELECT set_config + COMMIT, además de las órdenes del callback. Los cuatro scopes conservan los locks ordenados y las consultas independientes de ventanas/tickets. `respond` siempre recibe WAITING de `admit` y ejecuta al menos un claim antes del trabajo. El contador excluye autenticación, sesiones, recuperación, operación de negocio, observer, mantenimiento y reloj. No es una estimación de latencia.

Un subconjunto cerrado de las peticiones actuales ya rebasa 3000:

| Productor | Peticiones de empresa incluidas | Mínimo SQL de admisión |
|---|---:|---:|
| SOURCE fixture: 4 productos + 2 recepciones + 1 replay | 7 | 679 |
| TARGET history: 6 GET históricos propios | 6 | 582 |
| TARGET writes: create/replay, receipt perdida, resolve/reload/replay | 6 | 582 |
| Browser: history 6 + reload 1; product GET/POST 2; receipt GET/POST 2; reload/GET 2; inventory/receipt GET 2 | 15 | 1455 |
| **Subconjunto total** | **34** | **3298** |

Se omiten deliberadamente login/session, Y404, hash409, negativas, todas las peticiones automáticas adicionales de UI, observaciones SQL, DDL, credenciales, reloj, reinicio y las variantes. La recepción con respuesta perdida ya ha consumido admisión y bytes antes de recibir headers; su transición FIN/UNCERTAIN sigue costando al menos12. El PASS exige resolver ese mismo ID y sus deudas; no autoriza omitir su coste. Por ello ralentizar el ensayo o eliminar lecturas redundantes no convierte este pipeline en ejecutable dentro del presupuesto actual.

El caso único `browser-history` contiene los seis GET históricos y un GET más al recargar: **7×97=679>140 SQL** antes de autenticación, negocio y fondo. No basta corregir únicamente el techo global. El código real de `browser.mjs` ejecuta esos siete GET dentro del mismo `scenario`; no se dividen en alias.

## Coste de fondo y dimensionamiento

El segundo modelo confirma **5 SQL por avance comprometido**: BEGIN, set_config, UPDATE AdmissionFence, UPDATE TimeAuthority, COMMIT. `advance` conserva el mínimo100ms desde el commit anterior y el worker conserva el poll25ms. El tercer modelo confirma **5 SQL por pass idle COMPLETE**, incluido el guard real de recuperación; un pass pendiente cuesta1. El worker comprueba el coordinador cada200ms. Cada una de las dos API observa el reloj cada150ms con una consulta; su startup también consulta.

Ruta sana quiescente, suponiendo latencia despreciable: reloj50 SQL/s + coordinador25 SQL/s + API13.333 SQL/s = **88.333 SQL/s**. Una ventana45s consume nominalmente3975 SQL de fondo; siete GET de empresa suman al menos679 más, dando **4654 antes de auth/business**. El presupuesto140 se agotaría nominalmente en1.58s de idle y3000 en33.96s. Estas tasas son dimensionamiento de la ruta sana; no un mínimo temporal universal, pues latencia y contención ralentizan los ciclos.

Las ventanas activas exclusivas de todas las cohortas comparten los mismos30min: no corresponde multiplicar1800s por el número de variantes. Hasta1800s de idle COMPLETE equivalen nominalmente a159000 SQL, más startups, HTTP, SQL de control, probes y compensaciones. Las variantes pendientes cuestan menos por pass, pero no cancelan el coste del origen/destino principal. Los dos avances y frescura<1000ms del contrato§67 impiden suprimir el reloj o congelarlo durante la actividad para obtener PASS.

Un nuevo presupuesto SQL necesitaría una SPEC CHANGE explícita. Como insumo de planificación, **4000/caso es insuficiente para una ventana completa45s con siete GET**. Se debe sumar fondo de cada ventana real + HTTP completo + probes/control + reserva de retry/compensación y publicarlo antes de efectos. 159000 es sólo el componente sano de fondo al horizonte máximo, no una propuesta de techo global ya aprobada ni una garantía ante cualquier fallo. SERIALIZABLE permite hasta3 intentos, cada rollback se carga, y un advance fallido puede volver a intentarse en el poll25ms sin actualizar lastCommit. Ese caso puede exceder la tasa sana; alcanzar cualquier futura cota debe seguir abortando/conservando, sin reset ni alias de retry.

Se conservan45s/caso,30min acumulados,300HTTP,2000artefactos,1000journal,≤1CPU/2048MiB/60conexiones y los límites de datos/índice. No se aplicó un aumento, exclusión de consultas, cambio de cadencia, bypass ni recurso nuevo.

## Fuentes del corte local

| Archivo | SHA-256 |
|---|---|
| `server/saas/admission/index.js` | `6a29f8481d325256277a19f90132b0b35d1690aa461fb485c3f15330d6da929b` |
| `server/saas/admission/clock.js` | `df5a0775153a51932f19aefd79eb5afbdfaef1f836965c92e5938c1fbb2d8530` |
| `server/saas/admission/transaction.js` | `34d91817001beb2de7d5037b65903b79e4c6646543829d73b3e56097dd6036e8` |
| `server/saas/writes/coordinator.js` | `11a04ec98e3fa23df332d97eb61da4420def5000c642b149a7fe466c6b25e611` |
| `server/saas/recovery/runtime.js` | `a77eb8b9c0daaa5b7dc6613a4abffb3b7bf0d670dca68010d8c8e2b19984b8c1` |
| `server/saas/app.js` | `6b892b97c4c7d22cf29146394ac6e5fc32b442c298366538f73e2beb1865e45e` |
| `tests/qa/cp019/worker.mjs` | `54dc839f220697f9fabcdabf32f0f81855649d26a59e3ef9700406304ee47e01` |
| `tests/qa/cp019/entry.mjs` | `042f81bdcd42089a12b2e73429c5ad64b9ee7d690f432f8e80906c4cbf5823a8` |
| `tests/qa/cp019/acceptance.mjs` | `ab188996ab0ec7e95b3c1ea3f7aad625bd3f0e1ad57933d5d1332d8012299e10` |
| `tests/qa/cp019/browser.mjs` | `e0fe53a08eb0e325f98b4ea35144e40c10f9943174cbe634f39cf15ff809959d` |
| `tests/qa/cp019/ledger.mjs` | `e6f9e5b9023c9845354244c505d2cef8451f7e81f63f3843bec4e3f6a9b32af0` |
| `tests/qa/cp019/runtime-budget.test.mjs` | `75d00168943b4a669bd90329a327859296cfd40374792e3d461ff7a385397b17` |

## Resumen para auditoría

CONFIRMED: mínimo local3298>3000 para un subconjunto del main y carga completa de SQL por el wrapper actual. FAIL de viabilidad previo a recursos. NOT VERIFIED: cualquier ejecución física r02/PG/HTTP/browser/restore. El bloqueo requiere una decisión humana concreta sobre SQL antes de bootstrap, o un rediseño revisado que conserve íntegros los contratos y reduzca el trabajo real medido. Esta evidencia no convierte los modelos PASS en aceptación física ni altera los bytes aprobados.

## Propuesta exacta pendiente CP-020

[SC-012/DEC-070](../../../.agentic/P1-L3_SQL_BUDGET_CHANGE.md):8192 SQL/caso y200000 SQL global, **SUGGESTED / NOT APPROVED**, manteniendo todas las demás cotas y el cómputo íntegro. Los valores vigentes de código/registro/ledger siguen140/3000; la corrección del registro de escenarios no aplica este aumento. La instrucción humana del15octubre pide terminar la verificación local y presentar el ajuste antes de r02. No se ha iniciado r02 ni se atribuye este conteo a PostgreSQL físico.
