# CP-020 — revisión focal A5 y helper de esquema

Fecha: 2026-10-15. Entorno: LOCAL Windows x64, runtime Node propio. Estado de información: DETECTED. No PostgreSQL, HTTP real, SSH, Docker, recursos, `.env` ni credenciales de producción. Los materiales de las pruebas son sintéticos y permanecen en memoria.

## Dictamen

Revisión independiente inicial de A5: un REQUIRED confirmado, corregido dentro del alcance autorizado. Revisión del delta: **0 REQUIRED abiertos**. Este dictamen permite conservar la evidencia local; no acredita wiring del controlador, publicación del contexto, continuidad física del ledger ni Environment/aceptación de r02.

El helper de esquema fue implementado por este agente; la sección correspondiente es una revisión focal propia, no un peer independiente de su autor. La revisión inicial de A5 sí fue independiente de su implementación. La corrección A5 posterior tiene autoría de este revisor y queda identificada como delta.

## A5 — alcance y corrección

Entradas revisadas inicialmente:

| Archivo | SHA256 inicial |
|---|---|
| `tests/qa/cp019/a5-negatives.mjs` | `28e7bf2ce35e2258665bc88f491711480219c10d069c46c061c6c2c132b76f24` |
| `tests/qa/cp019/a5-negatives.test.mjs` | `8a8895c1e2f5a38136b911d3c86462ee1c3599a31004efda6baa41115fbbd9ee` |

**REQUIRED corregido — sustitución silenciosa del contexto source en la CLI.** `main` ensamblaba la variante con un spread que reemplazaba campos source ya presentes en el archivo privado. La validación posterior sólo veía el contexto reemplazado. La reproducción en memoria confirmó que un `sourceResource.dataPath` discrepante alcanzaba la creación del cliente después de ser sustituido por el bundle correcto, mientras `completeTargetVariantLineage` rechazaba el contexto original con `VARIANT_SOURCE_CHANGED`. No se ejecutó I/O real ni se modificaron archivos durante esa reproducción.

La CLI ahora usa `completeA5VariantContext`, que delega en el helper existente `completeTargetVariantLineage`. Completa únicamente entradas ausentes y rechaza discrepancias de `sourceCapture`, `sourceResource`, `sourceEndProof`, `observedSourceEnd`, `copyIndex` y `sourceJournalFinalCheckpoint` antes de configurar ledger, HTTP u observadores. La prueba nueva cubre los seis campos, ausencia de llamadas a esas dependencias, preservación del objeto original y la finalización válida de un encabezado mínimo.

Comprobaciones focales:

- Custodia, hash del bundle/manifiesto, SHA de código, artefacto, run/generación, system identifier, dirección privada, credencial del observador, contraseña de identidad e IDs elegidos se enlazan antes del cliente y del observador. Los resultados escritos enlazan sus hashes de custodia/bundle, DTO, payload y contexto de aceptación.
- Las cinco negativas reutilizan la clave conocida de recepción. Body/action/product/epoch esperan 409; actor Y espera 403 `ACCESS_DENIED`, coherente con `classifyWork`/`own_write_intent` antes de admisión. La prueba ejecuta el servicio real con una frontera SQL modelada; no demuestra HTTP ni PostgreSQL.
- Las observaciones usan el observador existente de un solo pool/conexión, transacciones `READ ONLY` y cierre antes de cambiar de DB. El request de restricción carga SQL antes del efecto, libera el cliente y exige fin del pool; un error o fin incierto impide devolver PASS. Cada caso conserva su charge/deadline y la CLI usa el ledger durable existente, sin elevar 140/3000 ni crear aliases de reintento.
- Los hashes locales incluyen todas las filas de productos, balances, movimientos, operaciones y auditoría. Se comparan cuotas/conteos y el hash de intents/proyecciones/reservas/transiciones de A; no se excluye una fila de negocio para obtener PASS. X y B/canary se conservan; contadores HTTP/admisión se comparan monótonamente.
- Las restricciones de Y pertenecen a la variante prospectiva `a5-restrictions`, con original source preservado y destino nuevo. El plan fija 3→4→5, 5→6→7 y 7→8→9; exige ACK/close proof/versiones exactas, revocación monótona y ninguna restauración de autoridad. No modifica el target principal.

## Esquema — alcance final

El helper interrumpe el controlador real de migración006 dentro de su transacción, después del DDL y después del registro. Sólo puede certificar el caso tras ROLLBACK reconocido y comparación exacta del catálogo/registro/ACL y estado observado. Un rollback o `pool.end()` incierto impide continuar con otra DB. En LOCAL estas fronteras se ejercitan mediante modelos; las sentencias no se ejecutaron contra PostgreSQL.

Contrato fijo: 75 SQL pre (tres DB, dos puntos de fallo), 9 SQL post y 84 total. Pre exige directorio `[2,2]`, ausencia de006/objetos recovery, barrera cerrada, reloj seed/0/0, B cerrado y ausencia de consumidores. Post verifica006, source SHA y directorio `[3,3]` después de `source-initialize-control` y antes del reloj/worker. Las opciones extra de conexión se rechazan antes de entregar la credencial al pool.

La negativa schema2 ejecuta el componente L2 archivado importando los mismos bytes cuyo SHA256 se verifica: `b8eebead8655a0b6eae42df6d923d119ca2648457175e43d80e6e28ef4fb76f3`, original `server/saas/db/pools.js` en base `86985fe7589032f202ebf0cb057a9b1384217151`. Lectura `[1,2]` y escritura `[2]` rechazan schema3 para A/B: cuatro rechazos, cero resoluciones de secreto y cero pools. `oldBinaryExecuted:false`; no se probó un binario HTTP antiguo completo.

## Verificación y hashes

| Verificación | Resultado | Alcance |
|---|---|---|
| A5 inicial | PASS, 11/11 | Modelos previos al hallazgo de ensamblaje CLI |
| RED del delta A5 | FAIL esperado, 0/1 | Nuevo contrato de finalización aún ausente |
| A5 final + target-variant-lineage | PASS, 21/21 | 12 A5 + 9 lineage; delta afectado |
| Sintaxis A5 final | PASS, 2/2 | `.mjs` y `.test.mjs` |
| Mutación A5 en memoria | Detectada, 11 PASS/1 FAIL | Reemplazar finalización comprobada por spread hace fallar la nueva regresión por alcanzar I/O; archivos intactos |
| Schema focal | PASS, 10/10 | Fronteras modeladas y componente L2 real |
| Schema + control + source-driver | PASS, 60/60 | Unión focal local |
| Sintaxis schema | PASS, 2/2 | Helper y prueba |
| Mutación schema | Detectada | Eliminar precondición schema2 hace fallar su regresión; archivo restaurado byte exacto |

Comando del delta A5: `node --test tests/qa/cp019/a5-negatives.test.mjs tests/qa/cp019/target-variant-lineage.test.mjs`. No se repitió la suite global para este correctivo; su unión trazada corresponde al controlador de Quality Gate.

| Archivo final | Bytes | SHA256 |
|---|---:|---|
| `tests/qa/cp019/a5-negatives.mjs` | 24240 | `11600181b3befb4b70e3090e3eee8f8efdd08e6fc2eeead0d1f80886d28e9d56` |
| `tests/qa/cp019/a5-negatives.test.mjs` | 21297 | `95f66eeb90895960da666ed30cbecb550148e431ed609c6dfc15cf6e90d003d6` |
| `tests/qa/cp019/schema-fault-probe.mjs` | 16673 | `e88682de6b192de3696686311311ad81437a3c6ef4f6379402b9a0ab73038f3f` |
| `tests/qa/cp019/schema-fault-probe.test.mjs` | 9690 | `fb73c4c34a6ca7b591fda39cad030d750ff18f3fe9b8d26ea31267cdde6c6e86` |

Los hashes schema de la ejecución inicial fueron `5729e0e7fb6d20a32ea7c6e76c188c4a6c7331e64414675ced269482af8927ee` y `d940d59a4c150fa2e1970179d9df4aa34886902aa9ecb76a86edf08cc1216c47`. Se comprobó que los archivos finales difieren exclusivamente por CRLF→LF; revertir esa transformación reproduce ambos hashes originales. Se conserva así el alcance de las pruebas sin atribuirlas a bytes distintos sin explicación.

## RESUMEN PARA AUDITORÍA

Resultado local: PASS acotado; 0 REQUIRED abiertos tras el delta descrito. No acredita estado físico del host, SQL/TLS/HTTP reales, continuidad del ledger externo, namespace/publisher/wiring completo, recuperación ni seis salidas de aceptación. El preregistro de casos/recursos, gates de presupuesto y Environment siguen siendo resolve-before QA. Este informe no aprueba elevar cotas, recrear/resetear una cohorte ni operar recursos. No Git, remoto ni cambios a otros archivos por este revisor fuera de los dos helpers/tests asignados y este informe.
