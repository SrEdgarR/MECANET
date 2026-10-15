# CP-022 — causa del aborto r03 y límite de continuación

2026-10-15. **DETECTED / resultado físico parcial.** P1-L3 continúa EN CURSO; este análisis no autoriza otra ejecución, una cohorte sucesora, cambios de presupuesto ni modificaciones del VPS. El diseño de reanudación de la sección final es **SUGGESTED / NOT APPROVED**.

## Fuentes y alcance de la evidencia

- [Ejecución física](remote-run.json), SHA-256 `9bd6b77c0f3de7de60c9e9790146989672067478126102fc18bc976819754453`: runtime `7f5986f01c1cce8c35ba3e9635d9001523da0bc8`, inicio15:17:39.660Z, fin15:18:03.275Z. Son resultados del controlador real, no pruebas locales.
- [Observación posterior de solo lectura](post-abort-readonly.json), SHA-256 `e5c7aa69dab3dcac4924b76850a5af9c66276e5ef7aa939820da9ec17714a463`, reporte15:21:58.734Z: identidad, referencia Root, estado final, señales positivas del log y mediciones posteriores. No se reinició el servicio para observarlo.
- [Conservación final de solo lectura](preservation-final.json), SHA-256 `7c3a424090e03463781660a508c53ec2f4f1291b116ff6f9c10272cbbcd2452d`,15:28:46.605934Z:29 contenedores totales,28 anteriores idénticos y un PG r03 EXITED/exit0/PID0/KEEP; una red propia interna `mecanet-qa-p1l3-r03-data`,10.77.64.0/24, sin endpoints. Ledger/material conservados; cero mutaciones de esa inspección. R02 conserva CREATED/inactivo y su cleanup histórico FAIL/UNKNOWN1, sin adopción.
- [Environment de entrada](environment-entry.json): preflight15:17:29Z, CPU7,81%/muestra2s,8400MiB disponibles y140678250496B libres. PASS de entrada acotada; no prueba de capacidad bajo toda la carga del lote.
- Código realmente publicado, leído con `git show 7f5986f01c1cce8c35ba3e9635d9001523da0bc8:<ruta>`: `tests/qa/cp019/host.py` SHA-256 `bcecffab7d9bfade1c4af46c32bf895dc87fba4ca923240450e6340489fcd725`; `controller.py` `347734f44f889a754b547a7f161dc46011685f898882509d5c80f698feb3774c`; `resource-monitor.py` `e307c2d42269bc08c3c5ea793a1243c002e54db862c562dce38a37f8cb539680`. El árbol local posterior del monitor no sustituye esos bytes ni su ejecución histórica.

## Qué ocurrió realmente

1. Preflight, bootstrap, staging, material y configuración terminaron PASS. Se utilizaron la pareja r03/r03-target, sus pins y sus entradas preparadas; no se reutilizó r02.
2. `source-pg-start` terminó PASS a15:17:59.791Z, en9313ms. El CID Source es `aa35afe3ea406009410be0e1a7eef759c619c8386a290ce9cbf620fe890cc500`. Su `StartedAt` es15:17:56.083807678Z. El log acredita PostgreSQL **18.6 ARM64**, inicialización del cluster y estado listo para aceptar conexiones. Las dos secuencias de arranque del log corresponden al servidor temporal de inicialización y al servidor final dentro del mismo arranque Docker; `RestartCount=0`.
3. Al preparar `foundation`, `create_job()` ejecutó primero `guard_effect()` y su nueva muestra `resources()`. El resultado final es `CP019_RESOURCE_ABORT`; el monitor registra además `RESOURCE_CPU_LIMIT`. No se creó el job de foundation ni se llegó al primer cargo SQL del arnés.
4. `safe_finish()` ejecutó cleanup aun estando fallido el monitor. PostgreSQL terminó a15:18:02.598236798Z, EXITED/exit0/PID0, sin OOM y sin puertos publicados. La referencia Root Source fue validada. Cleanup **PASS**, un propio detenido, cero desconocidos y28 consumidores anteriores preservados. Esos28 incluyen los recursos históricos de QA, entre ellos r02 CREATED; no significa28 aplicaciones de producción.
5. El ledger quedó en secuencia44, **639 artefactos,0 SQL del arnés,0 HTTP y0 journal**. PostgreSQL creó su cluster durante initdb: esos ceros no significan ausencia de actividad interna del motor o de escritura en sus archivos. No se preparó el fixture empresarial, no hubo dos API, copia/restauración, reapertura, navegador ni rollback funcional.

La conservación final midió971 archivos regulares del directorio Source `data`,40560908 bytes lógicos/40611840 bytes asignados y cero symlinks; el directorio Target `data` tiene cero archivos/bytes. Es tamaño del cluster inicial, sin schema SaaS preparado; no es un respaldo validado ni el tamaño futuro de toda la cohorte. Se midieron metadatos, no se volcaron contenidos.

## Causa inmediata, carencia de medición y causa estructural

**DETECTED:** se activaron las barreras de recursos y se conservó el fallo. `resources()` exige CPUbusy<80% en muestra2s, MemAvailable−2048MiB≥3072MiB y espacio libre>max(15GiB,10%). El monitor exige CPUbusy<90%, además de sus otros controles. La señal específica del monitor es CPU; el código `CP019_RESOURCE_ABORT` de la muestra síncrona reúne varias condiciones y no registra cuál de ellas falló ni sus valores rechazados.

El resumen físico contiene10 muestras,8 muestras CPU contabilizadas y `maxHostCpuBusyPercent=62.626`. **Ese máximo no incluye necesariamente la muestra que disparó el aborto:** en el monitor7f598, `observe()` comprueba límites antes de incorporar la muestra a los máximos/mínimos. Por tanto,62,626% no refuta `RESOURCE_CPU_LIMIT`, ni permite afirmar el porcentaje exacto del pico. La lectura exacta rechazada y sus deltas de `/proc/stat` no quedaron custodiados. Tampoco se midió la contribución por proceso/cgroup en ese instante.

**TO DEFINE / no demostrado:** qué originó el pico —actividad propia, Docker, otro consumidor, condiciones del host o combinación— y si fue transitorio bajo una carga equivalente. Las muestras posteriores4,523%/7,305%/1,508% se tomaron con PostgreSQL ya detenido; acreditan esos momentos y no atribuyen el pico ni garantizan una continuación segura. La métrica host usada incluye los ocho contadores de CPU y no separa el tiempo `steal` como una causa identificada. No hay prueba de interferencia sufrida por otro servicio ni prueba de ausencia de toda interferencia.

**DETECTED / defecto probatorio del arnés:** faltó retener la observación rechazada antes del assertion. El correctivo local del monitor registra extremos numéricos antes de evaluar los mismos límites; Root registra commit `67f9c448a3e56b7040e3f937a4e1b17588373d97`,31 pruebas locales y revisión independiente. Son evidencia de ese correctivo. No fue publicado en r03 y no recupera retrospectivamente el valor perdido. No se convierte en capacidad o PASS físico.

**DETECTED / defecto del procedimiento de continuación:** el controlador integral `execute()` declara y aplica «No retry/reset/fallback». El aborto obliga a detener el PG ya iniciado, pero no existe una entrada de reanudación para ese estado antes de foundation. Un caso Source-start completado puede quedar inutilizable para recuperar ese mismo servicio cuando vence su ventana original. La preparación local corrigió TLS/CREATE/tmpfs/custodia; el siguiente fallo real ya no es uno de esos errores anteriores. No se ha observado un fallo de la recuperación funcional de Mecanet: todavía no se ejecutó.

## Por qué no se puede continuar r03 por una ruta existente

El ledger original inició en uptime1470388.38. `host-pg-start` inició en1470397.27 y conservó sus3 cargos de artefactos. En la observación posterior tenía245,28s transcurridos, por encima de45s. El global tenía254,17s de1800 en esa lectura: **no se afirma que el global ya hubiera vencido entonces**. La barrera suficiente para impedir START es la ventana Source-start agotada y la ausencia de una transición válida; que otro caso o el global tengan saldo no la sustituye.

La conservación final amplía esa evidencia: caso Source-start653,15s, vencimiento original uptime1470442.27; global662,04s, vencimiento original1472188.38. El ledger sigue en secuencia44 y sus totales no cambiaron desde el aborto. Tampoco en esa foto estaba agotado el global; no se transforma su margen en una nueva ventana de START.

| Ruta real7f598 | Condición | Resultado en el estado observado |
|---|---|---|
| `pg_start()` | Fija `host-pg-start`; `prepare_source_services(['postgres'])` exige PG nuevo CREATED y sin inicio anterior | El PG existente es EXITED; tampoco puede superar el chequeo original de45s |
| `prepare('foundation')` | Espera un PostgreSQL ya operativo y crea su job; no contiene un START de PG | Caso sin abrir, pero su prerrequisito no está satisfecho; no permite facturar otro START aquí |
| `source_pg_canary_start()` | Propósito exclusivo poscopia; exige copia verificada, checkpoint y manifiesto NORMAL originales | Esas entradas aún no existen; no se lo puede adelantar como reinicio genérico |
| START de Target/variantes | Frontera de copia, destino independiente y contratos Target acreditados | No existe copia ni Source preparado; no se puede convertir Source en Target |
| Cleanup/emergencia | Identidad positiva y STOP/KEEP, independiente del saldo para proteger el host | Ya realizado; no confiere autoridad de START, SQL FIN o reapertura |

**Corrección de interpretación del inspector:** su campo `foundationCaseExists` consultó `host-prepare-foundation`, un nombre que no pertenece al registro. No sirve por sí solo para concluir sobre el caso correcto. Se revisó directamente `remote-run.json → ledger.scenarios`: `prepare-foundation` también está ausente; sólo aparecen `host-bootstrap`, `host-stage`, `host-material`, `host-config-source`, `host-config-target` y `host-pg-start`. La conservación final confirma `prepareFoundationInRegistry=true` y `prepareFoundationInChargedLedger=false`. La corrección no cambia la conclusión. La inexistencia de un caso abierto nunca equivale a un permiso para trasladarle un efecto de otro caso vencido.

## Alternativa mínima de reanudación — SUGGESTED / NOT APPROVED

Preparar una entrada de continuación explícita y revisada para el **mismo** registro, material y recursos, en vez de resolver cada interrupción creando otra identidad. No se instala ni ejecuta mediante este documento. El diseño debe cerrarse antes de depender de él y mantener intactos los FAIL anteriores.

1. **Recibo de frontera durable:** enlazar SHA/digests del runtime y del controlador, hash del plan/registro, raíces Source/Target, CID exacto, owner, referencia Root, system identifier, binds/redes/pins/perfiles y checkpoint del último paso confirmado. Incluir hashes de material/TLS/configuración sin publicarlos como valores. No adoptar un CID por nombre/labels ni volver a elegir secretos, generaciones u operationIds.
2. **Fin y estado inequívocos:** conciliar los recibos CREATED/END y el estado observado de cada job/escritor; para PG, mismo CID/StartedAt/FinishedAt, EXITED/exit0/PID0, ausencia de OOM y estado del cluster cuando corresponda. SQL/HTTP inciertos conservan UNKNOWN hasta prueba positiva. En este caso,0 cargos SQL y la ausencia del job foundation son datos del arnés; no una implementación del protocolo general de SQL FIN.
3. **Admisión de continuación:** fresh Environment y recursos/puertos/ownership/consumidores, artefactos/controlador exactos y revisión/Quality de cualquier correctivo. Registrar el monitor y el intento anteriores como FAIL; no limpiar sus flags y presentarlos como un monitor continuo sano. Un eventual monitor de continuación debe tener enlace explícito al anterior, su propio intervalo observado y el mismo ledger/global original. No copiar el correctivo local encima de helpers sellados.
4. **Continuar por la semántica original:** reusar un efecto confirmado mediante su recibo; repetir un efecto incierto sólo con mismo input y fin/ROLLBACK/observación que descarte duplicación; crear el siguiente efecto únicamente si sus prerrequisitos están acreditados. Una reentrada PG Source antes de foundation tendría que estar definida como repetición del mismo START/caso y mismo CID, con recibos de intento y validación completa antes/después; no como canario, foundation, Target o alias nuevo.
5. **Contabilidad y aborto:** no borrar cargos, devolver artefactos, reiniciar relojes ni generar otro registro. Todo efecto debe caber en la ventana original de su caso y en los1800s globales, además de los demás límites. Nueva presión o evidencia incierta aborta/STOP/KEEP; no existe aprobación de una cantidad indefinida de intentos.

| Situación | Posibilidad técnica sin ampliar cotas | Alcance de este documento |
|---|---|---|
| Repetición exacta y reconciliada de una operación cuyo caso y global siguen vigentes | Podría reintentarse únicamente bajo la semántica ya definida y con todas las pruebas de fin/gates; no recrea una ventana | Diseño, no orden de ejecución |
| Siguiente caso aún sin abrir | Puede conservar su propio límite original si satisface todos sus prerrequisitos; no hereda autoridad de un caso vencido | Foundation no cumple hoy el prerrequisito PG activo |
| Futuro controlador con reentrada PG explícita, diseñado antes de un ensayo | Podría parar/revalidar/reiniciar el mismo CID dentro de los45s originales si alcanza y si su contrato lo permite; el tiempo y cargos anteriores permanecen | SUGGESTED; requiere diseño/revisión/verificación previos, sin promesa de suficiencia |
| r03 observado, con `host-pg-start` ya vencido | No hay START ni continuación funcional permitidos manteniendo las reglas actuales, aunque el global tuviera margen | KEEP y análisis local/lecturas acotadas de conservación |

**Decisión temporal necesaria si se pretende volver a ejecutar después del vencimiento:** definir y aprobar expresamente qué garantía temporal se modificaría y cómo contabilizaría una reentrada del mismo recurso. Mover el primer cargo, pausar el tiempo, renovar los45s o facturar el START a otro caso cambiaría la política, aunque se conserve escrito el número45. No se propone ni aplica ninguna de esas excepciones aquí. Mantener todas las reglas actuales implica no reiniciar r03. Este expediente no propone r04, una cohorte nueva ni una ampliación numérica o semántica de los135 casos.

## Límites y siguiente trabajo habilitado

Se conservan SC-012/013/014:135 casos; SQL8192/caso y200000 global; HTTP80/caso y300 global; artefactos2000/caso y8192 global; journal1000;45s por caso y1800s global;1CPU/2048MiB/60conexiones agregadas, un PG activo, dos leases por caso, copia120s/drenaje30s; Source/copia/destino agregado con variantes≤2GiB por ámbito, índice4MiB/10000archivos y journal1MiB. Pins, políticas de seguridad y demás límites aprobados permanecen intactos.

**Q-32:** entorno de ejecución bloqueado para continuar desde el estado actual; el preflight inicial PASS conserva su alcance histórico. **Q-35:** recuperación/reapertura, negativas, dos API, navegador y rollback continúan NOT VERIFIED. PG real iniciado y cleanup PASS no sustituyen esos criterios ni habilitan PR/merge/TERMINAL. Ninguna conclusión autoriza cambiar Coolify, servicios compartidos, producción, r01/r02 o datos reales.

Trabajo independiente habilitado: cerrar el correctivo local de observabilidad y sus regresiones/review; diseñar el contrato de reentrada con estados, recibos y negativas; verificar documentalmente su relación con los135 escenarios y las garantías temporales antes de pedir una decisión específica. La evidencia histórica y los materiales r03 permanecen KEEP; no se crea un recurso para completar este análisis.
