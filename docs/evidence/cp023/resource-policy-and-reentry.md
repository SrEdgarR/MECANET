# CP-023 — diagnóstico de recursos y propuesta única de reentrada

2026-10-15. **Parte diagnóstica implementada sólo localmente bajo B vigente. SC-016 / DEC-074: SUGGESTED / NOT APPROVED.** No se ha aplicado una ventana temporal nueva, iniciado r03, publicado un controlador, creado r04 o modificado sus materiales, registros o recursos. El objeto histórico SC-014 y las aprobaciones A/B se conservan.

## Evidencia de partida y límite del diagnóstico

[CP-022](../../audit/CP-022.md), runtime físico `7f5986f01c1cce8c35ba3e9635d9001523da0bc8`: PostgreSQL 18.6 ARM64 inició, pero la admisión de foundation abortó por `CP019_RESOURCE_ABORT` y el monitor registró `RESOURCE_CPU_LIMIT`. Cleanup PASS, PostgreSQL EXITED0/PID0/KEEP y 28 contenedores anteriores preservados. Contabilidad conservada: secuencia44,639 artefactos,0 SQL del arnés,0 HTTP y0 journal. El trabajo interno de initdb no se confunde con esos ceros. r02 mantiene CREATED/UNKNOWN y su FAIL histórico; no se adopta ni reutiliza.

El máximo62,626% del informe original excluyó el punto rechazado por actualizar extrema después del assertion. La corrección local `67f9c448a3e56b7040e3f937a4e1b17588373d97` conservó extremos, pero no aportaba el paquete completo del punto. **El valor perdido y el causante del pico original siguen NOT VERIFIED.** Este trabajo no los reconstruye ni atribuye presión a PostgreSQL.

## Captura diagnóstica actual — código local, no política nueva

`tests/qa/cp019/resource-sample.py` construye un registro pequeño, cerrado y sin escritura de archivos ni procesos auxiliares. Host y monitor comparten el formato; las decisiones de aborto existentes conservan sus comparadores. `host.py`, `resource-monitor.py` y `runner.py` integran el registro. El nuevo helper entra en el inventario cerrado del runner y en el selector existente del tar; no reemplaza helpers sellados de r03.

| Dato | Captura propuesta e implementada localmente | Límite de interpretación |
|---|---|---|
| Muestra CPU rechazada | Valor sin redondear, ocho contadores antes/después y sus deltas: user, nice, system, idle, iowait, irq, softirq, steal | CPU agregada del host; idle+iowait se excluyen de busy. Steal no identifica un proceso propio |
| Umbrales |80% exclusivo en admisión;90% exclusivo en monitor; memoria y disco exactos por tipo de guard | No se igualan las dos barreras ni se cambia ninguna cifra |
| Instante e intervalo | UTC y tiempo monotónico del punto; intervalo real entre lecturas CPU. Momento del primer aborto separado | Lecturas secuenciales, no snapshot atómico simultáneo de CPU/memoria/disco |
| Host | MemAvailable, disco libre/total y margen calculado, además de CPU | En admisión, memoria/disco se leen antes de la ventana CPU; se conservan esos mismos valores usados por el guard |
| Recursos propios disponibles | rusage del proceso controlador y del hilo monitor: CPU acumulada, RSS pico Linux. Cuando ya se validaron referencias Root: suma de límites de contenedores propios; conteo TCP del PID PG autorizado | rusage excluye contenedores y daemon. Límites configurados no son CPU/RSS efectivos; TCP no cuenta SQL/UNIX. CPU y RSS por cgroup **NOT MEASURED** |
| Motivo | Error original del guard más razón específica: CPU, margen de RAM, disco, muestra desconocida, identidad, OOM o conexiones, según el control que falla | Un contador desconocido no se convierte en0% ni en capacidad disponible |
| Conservación | `firstFailureSample` se fija en el primer fallo y se copia al informe; `lastSample` puede avanzar sin borrar el primero. `RESOURCE_FIRST_REJECTED_SAMPLE` hace lo mismo para la admisión síncrona | No crea una recepción física durable por sí solo. El runner lo entrega en su informe existente, sin artefactos/SQL adicionales por poll |

El nuevo registro sólo contiene números, marcas temporales y etiquetas cerradas. Rechaza o omite NaN, Infinity, booleanos usados como CPU, cadenas arbitrarias, paths y claves no reconocidas. Si no existe una muestra asociada al fallo, indica UNAVAILABLE y no reutiliza una lectura anterior como si fuera el punto rechazado. El error y el latch de aborto permanecen irreversibles aunque luego se observe una muestra baja.

No se añaden llamadas Docker stats ni lecturas de datos de otros servicios para atribuir CPU. Obtener deltas cgroup de propios exigiría acreditar CID, PID y cgroup antes/después y verificar su coste dentro del poll; no se presume disponible ni se instala aquí.

### Política de recursos conservada

| Barrera | Regla vigente |
|---|---|
| Antes de un efecto | CPU<80% en muestra nominal2s, MemAvailable−2048MiB≥3072MiB y disco libre>max(15GiB,10%); footprint adicional original |
| Monitor | CPU<90%, MemAvailable≥3072MiB, disco con el mismo margen; OOM, identidad o consumidor cambiado abortan |
| Carga propia | Máximo1CPU/2048MiB Docker agregado, un PG y60 conexiones; Root externo medido, sin hard cap cgroup demostrado |
| Tiempo del monitor | Mismo poll2s, mismos límites de duración/stale/window y sin cargo SQL o artefacto por poll |

La CPU del host es una señal conservadora para proteger a los demás consumidores incluso si Mecanet no causa la presión. Una media de una ventana2s no demuestra presión sostenida ni permite distinguir por sí sola un pico propio, ajeno o steal. El fallo de admisión80% impide un efecto nuevo y, en el controlador actual, conduce a cleanup;90% es además una barrera de seguridad durante el ensayo. Se mantienen ambas.

**Recomendación actual:** conservar la política inmediata y usar la captura exacta para diagnosticar. No se introduce una espera para “ver si baja”, una media móvil, N muestras consecutivas o una excepción por baja CPU propia: esas medidas modificarían cuándo se permite continuar bajo presión y requieren SPEC CHANGE antes de implementarse. Clasificar un episodio como transitorio necesitaría evidencia temporal correlacionada; no equivale a autorizar su tolerancia. No hay evidencia para afirmar que cambiar la política sea seguro o necesario.

### Verificación focal de esta parte

TDD local, sin Docker/SSH/PostgreSQL/HTTP: dos regresiones del monitor fallaron antes de existir la captura; el guard síncrono falló por ausencia de `RESOURCE_LAST_SAMPLE`; las negativas de PG/conexiones no tenían contexto atribuible. Después:9 contratos del helper,33 del monitor,3 de admisión,17 del runner y18 del selector de artefacto PASS. Se conserva el runner de cleanup aun fallando el monitor. Se verifican el punto90/80, RAM3072/5120, disco15GiB, contadores reseteados, NaN/Infinity, copia del primer fallo y motivo/umbrales de conexiones. Son pruebas locales del diagnóstico; no reproducen la carga física perdida ni verifican recuperación o capacidad. SHA del código final y revisión independiente se fijan por Root al integrar; no se inventa un commit autorreferencial.

## SC-016 / DEC-074 — una continuación adicional del mismo r03

**SUGGESTED / NOT APPROVED.** Esta es la única recomendación de reentrada. No autoriza ejecutarla ni modifica hoy la política temporal protegida.

Se propone permitir **una sola continuación adicional, v2, del mismo r03 y r03-target: máximo dos intentos de ejecución en total, contando v1**. No es una cohorte nueva. V1 permanece FAIL con sus timestamps, casos vencidos y contadores originales; no se pausa ni corrige retrospectivamente. Cualquier fallo de v2 termina STOP/KEEP y no habilita v3, r04 o un intento automático adicional.

### Cambio temporal exacto que requiere aprobación

| Garantía | V1, conservado | V2 propuesto, exclusivamente |
|---|---|---|
| Ventana por caso |45s desde la primera carga original; sus vencimientos no cambian | **Nueva ventana45s** desde la primera carga de ese caso en v2, incluida reentrada Source START. Se carga antes de su primer efecto; nunca se mueve el inicio |
| Ventana global |1800s originales; inicio y vencimiento se conservan | **Nueva ventana global1800s** desde el primer efecto de v2, incluida creación/publicación de metadatos de continuación. No se retrasa hasta la primera consulta |
| Cantidad de intentos | Un intento real r03 abortado | Una continuación adicional como máximo; no dos continuaciones ni intentos indefinidos por caso |
| Contadores | Ledger histórico inmutable, incluido639 artefactos | Acumulación original+v2 antes de todo efecto. Sin borrar cargos, devolver temporales o reiniciar saldo |

**Esto amplía la garantía temporal permitida; no es una corrección de representación.** El máximo entre ambas ventanas podría alcanzar90s por caso y3600s globales protegidos, más el intervalo inactivo entre intentos, sin transformar ese intervalo en una pausa retroactiva. No se presenta como el mismo presupuesto de tiempo ni como un bypass porque conserve las cifras45/1800. Es la razón para una SC y aprobación humana específica. Ninguna de estas ventanas se ha creado o aplicado.

Su fundamento es terminar el mismo ensayo después de una parada segura sin crear otra identidad ni repetir material ya confirmado, manteniendo un límite finito por intento y la matriz original de135 criterios/casos semánticos. **No hay suficiencia temporal o de capacidad demostrada.** Si la proyección revisada, el preflight o cualquiera de los otros límites no lo permiten, v2 no inicia o aborta; no se aumenta ninguna otra cota por extensión.

### Contrato de entrada, continuación y salida

1. **Identidad fija y entrada sin adopción.** Mismas raíces, PG Source CID `aa35afe3ea406009410be0e1a7eef759c619c8386a290ce9cbf620fe890cc500`, imagen, bind de datos, system identifier, owner y referencias Root existentes. Target sólo se crea cuando los pasos originales lo permitan; no se selecciona un contenedor por nombre, labels o PID0. R01/r02, producción y otros servicios permanecen fuera del alcance.
2. **Frontera durable explícita.** Antes de admitir v2, sellar recibos propios Root con hash del v1 final, ledger/registro original, plan, material/TLS/configuración, runtime y controlador, referencias de CID y último paso confirmado. Una observación obtenida ahora debe decir que es posterior; no se inventa un recibo existente al abortar. El vínculo usa hashes ya adoptados por el proyecto, sin claves o mecanismos criptográficos nuevos. Los bytes originales no se sobrescriben.
3. **FIN positivo y reconciliación previa.** Revalidar mismo CID, estado EXITED/exit0/PID0, StartedAt/FinishedAt, ausencia de OOM y escritores/jobs de aplicación. Un timeout, PID0, ausencia de cargo SQL o desaparición por sí solos no prueban FIN SQL. El caso observado carece del job foundation, pero cualquier incertidumbre nueva de COMMIT, ACK, HTTP o escritor bloquea hasta conciliación positiva o aborta UNKNOWN. No se descarta un resultado incierto para repetirlo.
4. **Versionado y contador acumulado.** V2 tiene recibo de admisión y secuencia propios, enlazados a v1, y una identidad de intento elegida una sola vez. El ledger v1 se conserva byte exacto y se comprueba por hash. El estado operativo v2 y sus recibos de frontera son separados: ninguna escritura vuelve al ledger histórico. Recibos confirmados son append-only; actualizaciones del estado derivado sólo atómicas, monotónicas y bajo el lock ya exigido, contrastadas con los recibos. Todos los consumidores cargan contra la suma original+v2, de forma concurrentemente segura, antes de SQL/HTTP/journal/creaciones. Incluir el coste de nuevos recibos/archivos en la proyección, sin omitir cargos.
5. **Reuso o repetición inequívocos.** Bootstrap/stage/material/config/TLS confirmados sólo se reutilizan por entradas, contenido y recibos coincidentes. No se regeneran secretos, generaciones, recoveryId, operationIds o versiones por reintentar. Un efecto confirmado no vuelve a ejecutarse ni se cobra como si fuese nuevo. La reentrada del mismo PG frío sí es un efecto nuevo, con recibos antes/después y cargo propio dentro de `host-pg-start` de v2; no se disfraza de canario, foundation o un caso alias. Ante un resultado incierto, sólo reconciliación/idempotencia original con el mismo input; si el fin o la no duplicación no pueden probarse, UNKNOWN terminal.
6. **Nuevo controlador verificable, sin reemplazar sellados.** Elegir versión y hashes del controlador/adaptadores v2 antes de efectos. Mantener el runtime/controlador v1 sellado y sus FAIL. Recibos nuevos enlazan ambos y no atribuyen a una versión los PASS de otra. Cambios de inputs o código impiden reutilizar una salida salvo que se acredite su equivalencia y alcance. Completar Quality/review y adaptar todos los consumidores de presupuesto antes de ejecutar; no basta editar el entry point.
7. **Environment y primer efecto.** Preflight fresco de propiedad, recursos, rangos, puertos, almacenamiento KEEP, pins, integridad y consumidores. Mantener80/90 y todos los abortos. Read-only preliminar no consume una ventana de ejecución por sí solo; trabajo real nuevo, staging o publicación de recibos sí inicia y consume el global v2. Cargar el primer efecto y cada caso antes de su mutación. El ensayo tiene monitor nuevo vinculado al FAIL v1; no limpia el latch antiguo para declarar continuidad sana.
8. **Salida y fallo irreversible.** Verificar las salidas mediante evidencia real PostgreSQL/dos API/copia/reapertura/navegador/rollback. Cualquier límite, identidad contradictoria, recibo perdido o resultado UNKNOWN detiene efectos nuevos y activa cleanup de sólo CIDs positivamente identificados; STOP/KEEP no depende del saldo. No hay un tercer intento. Guardar resultados y contadores de ambos intentos; revalidar consumidores ajenos. Sólo seis salidas PASS y gates propios habilitan integración Git condicional; no lanzamiento público.

### Ubicaciones cerradas y consumidores del contador

| Objeto propuesto | Ubicación / uso exacto | Garantía |
|---|---|---|
| Ledger histórico v1 | `/opt/mecanet-qa-p1l3-r03/budget/ledger.json` | Ningún consumidor v2 recibe ese archivo o su directorio con escritura; comprobar contenido/seq44 antes de depender de él |
| Admisión y recibos v2 | `/opt/mecanet-qa-p1l3-r03/master/continuations/v2/`, archivos Root0400 y directorios Root0700 | Elección única de intento, compare-and-create y cadena de hashes/recibos; una segunda admisión v2 concurrente se rechaza |
| Contador operativo v2 | `/opt/mecanet-qa-p1l3-r03/budget/continuations/v2/` | Contiene sólo el estado de continuación, ligado por recibo Root al v1 inmutable. Actualizaciones atómicas y monotónicas; totals/casos validan v1+v2 antes de cargar |
| Configuración de ejecución v2 | Recibos/configuración dentro del directorio Root v2, separados del compose/controlador v1 sellado | Derivar exclusivamente los bindings necesarios del presupuesto v2; no sobreescribir config v1 o regenerar material. CIDs/datos/redes/pins permanecen ligados al r03 original |
| Montaje del contador en procesos v2 | Mantener el destino interno `/run/qa-budget`; origen exclusivo en el directorio operativo v2 | No montar todo `budget/` ni un padre que permita alterar v1. Root/adaptadores deben validar el mismo binding cerrado y referencia de intento |

El adaptador de contador futuro no puede ser una copia del ledger con starts nuevos que se presente como el original: debe conservar esquema/identidad de continuación y su enlace verificable a v1. Todos los consumidores deben entender esa diferencia. El estado derivado puede precalcular sumas, pero no es autoridad para borrar el consumo base ni para elegir una ventana sin recibo de admisión.

Revisión de impacto necesaria antes de implementar/ejecutar SC-016: writer/lector de presupuesto Node y Root, guard de operaciones, configuración/mounts de harness/API/worker/variantes, validadores de scopes, leases y deadlines, runner/monitor/relay, recibos de fase, negative fixtures y reconciliación de resultados. Cualquier consumidor que siga escribiendo v1, ignore su subtotal o acepte por defecto un inicio temporal nuevo bloquea el gate. No se ha implementado aquí ese adaptador ni su nueva configuración ejecutable.

Los135 nombres/scopes y su semántica no se amplían: la dimensión v1/v2 pertenece al control del intento, no a casos adicionales para facturar otro cupo. Las nuevas ventanas y el reinicio de PG ya ejecutado son precisamente los cambios de ejecución que debe aprobar SC-016; no se declaran contenidos en SC-014 ni en B.

### Cotas que no cambian

SQL8192 por caso y200000 global; HTTP80 por caso/300 global; artefactos2000 por caso/8192 global; journal1000;1CPU/2048MiB Docker agregado,60 conexiones, un PG activo, dos leases por escenario; copia120s/drenaje30s; Source, copia y destino agregado con variantes≤2GiB por ámbito; índice4MiB/10000archivos/journal1MiB. Pools, pins, cadencias, credenciales, HBA, aislamiento y mecanismos de seguridad/recuperación conservan sus requisitos.

Con el último contador verificado de v1, el margen global numérico sería7553 artefactos,200000 SQL,300 HTTP y1000 journal; no es una nueva asignación ni prueba de que alcance. Cada caso descuenta además sus cargos v1, incluido host-pg-start. Antes de depender de esta cifra hay que revalidar el mismo hash/seq44 y ausencia de efectos posteriores; cualquier discrepancia bloquea, no se corrige el histórico. Los límites de almacenamiento incluyen datos/material/KEEP y metadatos de ambos intentos. Las excepciones de copia/drenaje existentes no crean otra ventana global ni se amplían a otros pasos.

### Negativas y decisiones antes de ejecutar

La implementación futura debe demostrar, con pruebas focales antes de QA: ledger v1 alterado o truncado; secuencia/cargos decrecientes; mezcla de r01/r02/r03, CID/owner/system identifier/pin/bind cambiados; recibo ausente o incompatible; doble v2 concurrente; tercer intento; reutilización de secretos/IDs por regeneración; efecto confirmado repetido; COMMIT/ACK incierto; FIN sólo inferido; transferencia de cargos a otro caso; primer efecto anterior al inicio global; intento de pausar/reabrir ventanas v1 o mover starts v2; overflow acumulado original+v2 y pérdida del monitor. Todos deben denegar o abortar sin START/SQL nuevo cuando falta autoridad. Ninguna de estas pruebas se presenta aquí como recuperación ejecutada.

**B vigente:** implementar y verificar localmente los diagnósticos y refactors de testabilidad que conservan las garantías. **SC-016 / DEC-074 pendiente:** aprobar el objeto completo revisado y sus nuevas ventanas/intento, antes de implementar el adaptador temporal, cambiar la baseline de ejecución o publicar/ejecutar v2. Root fijará el SHA-256 del documento revisado para esa decisión; no se autoriza por producir este borrador. No se vuelve a pedir A/B funcionales ni SC-011/012/013/014. No se propone r04.
