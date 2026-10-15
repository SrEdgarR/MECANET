# CP-018 — contrato de readiness, custodia y cohorte L3

**SUGGESTED / DESIGN ONLY / NOT APPROVED.** Autor `l2_service`, lectura local focal sobre la base `86985fe…` y rama `codex/p1-l3-design` comunicadas por el coordinador; este autor no ejecutó Git. No baseline L3, A/B, Design Gate PASS, implementación, pruebas funcionales, secretos leídos, SSH ni recursos creados. P1 continúa como única fase activa; el PASS de L2 conserva su alcance. El coordinador incorporará este diseño en el candidato único; este informe no es otra especificación aprobada.

Se reutilizan [candidato L3 revisado](../../../.agentic/P1-L3_CANDIDATE.md), [review-next-lot](../cp017/review-next-lot.md), [snapshot L2](../../specs/p1-l2-approved/baseline.md) y [Prompt Maestro](../../methodology/Prompt_Maestro_v2.0.md), en particular §§8.1–8.5,15,16,19. La recuperación cerrada de CP-017 no autoriza reapertura, recursos compartidos, egreso o gasto. CP-017 y sus backups/journal/volúmenes continúan STOPPED/KEEP.

## 1. Contratos existentes y cambio necesario

**DETECTED / LOCAL SOURCE READ, no ensayo nuevo.**

| Objeto real | Contrato observado | Consecuencia para L3 |
|---|---|---|
| `server/saas/app.js:37–38` | `live` devuelve200 `{status:'live'}`. `ready` observa reloj y exige `!draining`, `admission.ready()` y `writes.ready()` | Conservar cuerpos mínimos, no convertir salud en autorización |
| `server/saas/writes/service.js:175` y `003-control-writers.sql:354` | `writer_readiness` exige barrera global falsa, cuotas técnicas válidas, todas las restricciones ACK y todo writer company `OPEN` | B bloqueada/CLOSED hace503; no distingue cierre legítimo. El JOIN por sí solo tampoco demuestra inventario completo sin filas huérfanas |
| `admission/policy.js:66–76` | Dos observaciones de avance monotónico comprometido; mismo generation; barrera false; último avance hace menos de1000ms | Conservar el contrato de progreso; la hora de pared o un heartbeat no acredita reloj ni transferencia |
| Compose QA y generador `cp017/host.py:85–144,230` | No hay `healthcheck` ni arranque condicionado a `ready`; se inicia worker/API/web mediante controlador | No inventar un balanceador o automatismo inexistente |
| `tests/qa/infra/nginx.conf:15–31` | Upstream estático de dos API, sin prueba activa; `proxy_next_upstream off` | Un503 de readiness no retira automáticamente una API ni evita negocio; guardas/admisión deben bloquear realmente |
| Entrypoints CP017 | API recibe control/session/issuer/read/write, nunca bootstrap/maintenance; worker tiene clock y mantenimiento separados | Mantener separación; el material global de recuperación nunca se monta en API |
| Consumers QA | `cp014/admission-http`, `lifecycle-live`, `rollback-live`; `cp017/recovery-check`, `rollback`, `revocation-live`, `canonical-gap`, `promote` | Conservar las expectativas históricas. Los ensayos L3 usarán su contrato nuevo y sus propias fuentes; no reescribir FAIL/PASS previos |

El nuevo significado de readiness es un cambio observable **SUGGESTED**, que debe incorporarse con impacto y revisión en el candidato/baseline L3 antes de A. No editar003–005 ni cambiar silenciosamente el significado de la evidencia CP017.

## 2. Propuesta única de readiness

Tres propiedades distintas: proceso vivo, servicio técnicamente operable y permiso vigente para una acción de una empresa. Sólo las dos primeras tienen endpoints de salud. No se añade endpoint de estado de tenants ni acceso administrativo.

**`GET /api/health/live`:**200 `{ "status":"live" }` si responde el proceso correcto al Host/origen propio. Durante drenaje puede seguir200 hasta terminar el proceso; no promete DB, reloj, writer, pago ni capacidad.

**`GET /api/health/ready`:**200 `{ "status":"ready" }` sólo si se cumplen simultáneamente:

1. Instancia no draining; configuración de esa instancia, generación, artefacto y referencias de credenciales coinciden con el despliegue custodiado, sin fallback a origen/CP017.
2. Control accesible con rol API mínimo; versión/esquema/registro de migraciones compatible; cuotas/control de barreras coherentes dentro de los límites existentes. El reloj central/authority tiene generación/tick/version concordantes y la API ha observado avance real conforme al límite existente de1000ms. No relajar ese límite para obtener200.
3. Registro técnico identificado en uno de dos modos, nunca inferido por ausencia de filas: **NORMAL**, inicialización autorizada y completa de la fuente nueva con generación/config/artefacto/conjunto esperado y guardas006 custodiados; o **RECOVERY**, recuperación de ese destino completada (`recovery_runs.stage=COMPLETE`). Ambos exigen `globalblocked=false` y `admission_fence.barrier=false`. RECOVERY añade referencias/manifiesto/journal/configuración y fuentes originales inhabilitadas acreditadas; NORMAL no exige inventar backup o proof de un origen que no existe. Fila ausente, modo desconocido o inicialización parcial→UNKNOWN/503. Un booleano aportado por un request no sustituye las pruebas de host/SQL/custodia.
4. Inventario completo e inequívoco de scopes del destino: igualdad exacta entre conjunto custodiado, directorio y registros de recuperación; sin filas ausentes, adicionales, duplicadas, generaciones/épocas/credenciales incompatibles o transición sin conformidad. Cada scope company está en una de las dos clases verificadas del §3. Demo preservada como cerrada/revocada es una clase conocida sin writer; no convertirla en empresa ni reactivarla.
5. Ninguna restricción/cierre del protocolo pendiente de acreditar, hueco de recuperación o admisión ejecutable del origen cuando el modo sea RECOVERY. Prueba central de conformidad y autoridad vigentes; no un cache positivo de una fase anterior. Cada modificación privada posterior que invalide esa conformidad debe bloquearla antes de permitir negocio.

En otro caso:503 `{ "status":"unavailable" }`, sin IDs, conteos, grants, motivos de tenants, SQL, paths o secretos. El guard del handler debe capturar también una excepción de `observeClock`/clasificador/timeout y devolver ese mismo503, sin pasarla a la respuesta genérica500. `Cache-Control: no-store` permanece. Health se conserva antes del middleware de sesión; no crea/consulta sesión, CSRF, login ni cookie. No admite un ticket de negocio ni abre pools empresariales para inspeccionar contenido sin autoridad; utiliza una consulta central acotada y el observador existente. Propuesta de cota: una petición≤1s, consulta central con timeout≤500ms y como máximo una en vuelo por instancia; los límites de ingreso y pools existentes siguen aplicando. Si la evaluación completa no cabe, responder503 y diagnosticar privadamente, sin omitir scopes.

Interfaz interna propuesta del guard: `evaluateServiceReadiness({expectedGeneration,expectedDeploymentRef,clockObservation,draining,deadline}) → boolean`. Consulta central SECDEF de lectura mínima con EXEC sólo rolAPI; el preparador mantiene la conformidad mediante las funciones privadas del run. La respuesta pública no incluye el resultado técnico extendido. El conjunto esperado QA es bounded0…2company scopes, custodiado incluso si vacío; no paginar ni inferir vacío por `LIMIT`/JOIN. Más de dos en ese fixture→503/cota fallida, no soporte productivo implícito. Handler, función006, proyección/readiness, `app`/clock y consumidores deben verificarse juntos antes de admitir el nuevo contrato.

El registro de conformidad local deberá proceder de funciones privadas y pruebas ligadas al estado exacto del fence/epoch/schema/ref; no aceptar `verified=true` libre. Readiness consulta esa proyección central protegida. La autorización por request y las funciones empresariales vuelven a verificar generación, permiso, época, ticket y fence antes del efecto. Health positivo no es una concesión ni garantiza una respuesta exitosa bajo cuota o permiso insuficiente.

### Casos de aceptación propuestos

| Estado observado | live | ready | Negocio |
|---|---|---|---|
| Cero empresas, conjunto esperado custodiado vacío, control/reloj/config y registro NORMAL completo o RECOVERY COMPLETE verificados |200|200|No se inventan tenants; login/contexto no concede empresa inexistente |
| Todas las empresas legítimamente restringidas y CLOSED/ACK probado; recuperación completa |200|200|Cada request restringido se deniega antes de pool/efecto |
| A elegible OPEN y B legítimamente bloqueada CLOSED/ACK, inventario completo |200|200|Sólo acciones autorizadas de A; B permanece denegada |
| Active elegible aún CLOSED por recuperación/mantenimiento sin finalizar |200|503|No promocionar ni omitirla para obtener200 |
| Conjunto vacío porque falló cargar/inventariar; fila huérfana o descriptor incompatible |200|503|Barrera/admisión cerradas; no tratar ausencia como conjunto vacío legítimo |
| Cierre/protocolo UNKNOWN, restricción no ACK o prueba de cierre ausente |200|503|Conservar deudas/fence; no liberar por espera |
| ACK perdido durante configuración/promoción o reloj sin transferencia/progreso probado |200|503|Reconciliar el mismo recovery; ninguna apertura implícita |
| Empresa llega a su cupo lógico comercial |200|200 si resto coherente|Su escritura devuelve429 conforme a L2; cuota no equivale a proceso caído |
| Operación ordinaria UNKNOWN pero guardas vigentes y recursos originales conservados; ninguna recuperación/cierre incierto |200|No cambia sólo por ese UNKNOWN|Consulta/reconciliación propias; no se libera ni se repite el efecto |
| Drenaje local, control caído, generation incorrecta, barrera global o presupuesto técnico de cierre inválido |200 mientras viva|503|Conserva el bloqueo correspondiente |

La incertidumbre de un **protocolo/fence de recuperación o cierre** es distinta de una **operación ordinaria** cuyo resultado sigue incierto y conserva reserva. No introducir la regla inventada de que toda operación UNKNOWN implica caída global, ni de que readiness positivo permite soltarla.

## 3. Integración con la propuesta SQL del coordinador

**SUGGESTED**, alineado con el contrato comunicado por `l2_sql`, no tablas/funciones creadas ahora: migraciones nuevas006-control-recovery/006-tenant-recovery; registros `saas.recovery_runs`, `saas.recovery_tenants`, `inventory.recovery_guard`, directorio schema3. Fuente L3 NUEVA instala006 y artefacto candidato tras A/B, inicializa explícitamente NORMAL y custodia las guardas antes del primer efecto/backup; destino copiado entra RECOVERY cerrado, no hereda NORMAL como permiso ejecutable. Sólo existe la barrera runtime `saas.admission_fence.barrier`; no crear una segunda barrera independiente con estados divergentes.

Impacto real a revisar antes de A: hardcodes schema2 en service/coordinator/authority y managers reader/writer/mantenimiento, SQL de directorio y consumers deben aceptar schema3 con BIGINT en strings y guardas nuevas. Un artefacto L2 no interpreta006 por extensión: su uso como rollback debe probar rechazo/CLOSED, sin afirmar reapertura compatible o bajar el schema_version para permitirlo. No modificar funciones/migraciones ya registradas.

- `OPEN_ELIGIBLE`: empresa active antes del recovery y todavía autorizada después del journal, seleccionada expresamente en el run; guardas/schema/epoch/ref exactos y margen del fixture acreditado. Debe acabar OPEN por el CAS privado diseñado, no por UPDATE global ni porque existe al menos un actor.
- `RESTRICTED_CLOSED`: restricción legítima durable aplicable a ese scope, cuyo fence local/central está CLOSED y cuyo cierre/ACK está acreditado. No permite catalogar como legítimo un cierre de recuperación pendiente de una empresa que debería ser elegible, un hueco de journal o una DB no inspeccionada.
- Conjunto vacío permitido sólo con inventario inicial comprobado y registrado vacío; el registro no puede fabricarse después de un error de consulta. Fuera del fixture L3 A/B, no imponer cardinalidad dos a la semántica del servicio.

Todas las filas A/B se registran antes de mutar sus DB. Etapas propuestas `PLANNED→CONFIGURED→[CLOCK_ACQUIRED]→VERIFIED→PROMOTING→COMPLETE`, con proofs/ref exactos e incertidumbre explícita que impide avanzar. Durante promoción `globalblocked=true` y `admission_fence.barrier=true`, aunque el fence local de A ya haya cambiado a OPEN. La activación central final exige todos los scopes clasificados/conformes, clock/config/custodia y fin fuente; realiza en **un COMMIT** `COMPLETE/globalblocked=false/barrier=false` y la conformidad central final del conjunto elegible. Nunca puede observarse admisión habilitada con run incompleto. ACK perdido de ese COMMIT se concilia leyendo su efecto exacto, antes de cualquier paso adicional.

Los tombstones IDENTITY/TENANT/GRANT siguen efectivos en la nueva generación, sin reescribir su historia. LOGOUT restringe la referencia antigua y no sustituye la autorización de una sesión company nueva válida. Sólo IDs RESTORE de ese run acreditados pueden consumirse al terminar; no un `resumeOperationalBarrier` genérico sobre otras restricciones. El vínculo exacto y CAS de versiones pertenecen al diseño SQL del candidato único, no se sustituyen por esta propuesta de salud.

## 4. Custodia write-ahead: qué se guarda y quién puede leerlo

El preparador exclusivo tiene autoridad temporal sólo sobre la fuente/destino **nuevos y propios**, validada por manifest/recursos/hba/TLS y rol bootstrap acotado al ensayo. Después no se concede bootstrap, mantenimiento, socket Docker o fichero maestro a API. Worker recibe sólo clock/mantenimiento; API sólo control/session/issuer/read/write y clave de sesión de su nueva configuración. No introducir un servicio de vault, otro algoritmo criptográfico o una plataforma externa como requisito oculto.

Tres objetos privados distintos, fuera del cluster copiado:

1. **Manifiesto inmutable del run**: `formatVersion`, `recoveryId`, fuente/base/artefacto por SHA/digest, controller/preparador/verificador por fuente separada; identidades de recursos origen/destino (proyecto, rutas/volúmenes/redes propios y CIDs observados), generation y sysID; hash/inventario exacto de copia, checkpoint de backup y checkpoint final del journal; hashes de pruebas positivas de procesos/HTTP/SQL/clock fuente; conjunto completo de tenants/DB/roles y mapas esperados de epoch/version/ref/schema/elegibilidad. El sysID solo puede repetirse al copiar y no identifica el destino. Ningún URI con contraseña, input empresarial o cookie en manifiesto/evidencia pública.
2. **Material nuevo inmutable**: nueva generation; IDs de propietario/reloj; contraseñas/verificadores SCRAM y salts exactos para los17 roles LOGIN+bootstrap que correspondan al destino; signing secret de sesiones y referencias lector/escritor/mantenimiento versionadas; material TLS/CA propio del nuevo entorno según el inventario aprobado; configuración original necesaria para continuar una rotación parcialmente aplicada, ligada sólo a recursos nuevos. No copiar secretos CP017/producción/Nexora. Identidades y contraseñas de usuarios ficticios son datos del fixture, no credenciales técnicas que se regeneran para evitar sus restricciones.
3. **Estado de ejecución/ledger append-only**: intent de etapa antes de SQL, `operationId` fijo por etapa/DB/rol, esperado/observado, referencia/hash de material, resultado y pruebas; cabeza final custodiada. La cadena/hash prueba integridad bajo esa custodia, **no una firma/autenticación de tercero ni independencia del host**. Los registros no contienen cuerpos/credenciales. Journal restrictivo original permanece íntegro; este estado no lo trunca ni reemplaza.

Los límites propuestos son1MiB/1000registros para el journal existente;≤256KiB por manifiesto/estado del run y≤256KiB para el bundle sintético fijo A/B. El inventario completo de archivos del backup es otro objeto referido por hash:≤4MiB/8192archivos, copia≤2GiB y lectura/hash por bloques≤1MiB; no confundir su lista física con el manifiesto breve del run ni cargar un archivo de2GiB en RAM128MiB. Abortan límites excedidos o schema/campos desconocidos, en vez de truncar. Salts/verificadores/huellas de secretos se mantienen privados, no se publican hashes que faciliten probar credenciales. Reportes públicos sólo referencias opacas de etapa, fuente/entorno, casos y hechos seguros.

### Creación una sola vez y distribución

1. Validar directorio absoluto exclusivo, owner/ACL, ausencia de symlinks en el path y ficheros, scope esperado y todos los recursos originales cerrados. Adquirir exclusión privada mediante archivo `wx` y owner del preparador; EEXIST no permite takeover por TTL. Para continuar tras crash se exige fin positivo de ese proceso y lease/SQL ausentes y prueba custodiada ligada a ese owner/run. Si falta, abortar y conservar todo.
2. Si el run/material existen, verificar hash/forma/vínculos y **reutilizarlos**. Si no existen, generar todo el material una vez, escribir temporal privado `wx`0600, fsync del archivo, publicar en nombre final sin reemplazar un final existente y fsync de directorio. La publicación inicial debe usar una operación de no-clobber acreditada en Linux (p. ej. enlace exclusivo al final en el mismo filesystem) bajo la exclusión; `rename` que pueda sobrescribir un final no demuestra esta propiedad por sí solo.
3. Antes de SQL, volver a leer y validar material ya custodiado; sólo entonces append/fsync de intent de etapa. Un temporal incompleto nunca autoriza SQL y puede descartarse exclusivamente tras fin positivo del preparador, por ownership y path exactos. Se permite crear material nuevo después de un temporal fallido **sólo si** todavía no existía bundle final ni intent/efecto SQL; no una regeneración durante un retry iniciado.
4. Aplicar cada paso con expected gen/epoch/version/ref/role exactos y proof del run. Publicar configs API1/API2/worker por paths versionados mediante temporal/fsync/rename/fsync directorio, derivados del mismo bundle; no regenerar secreto por cada fichero. El payload y hash del archivo final deben coincidir con el registro antes de montar RO0400 con UID propio. No dejar API con mezcla de dos bundles.
5. Montar únicamente configs segmentadas; el manifest/master/ledger queda en custodia del controlador privado fuera de DB y sin mount en API. Configs de runtime no incluyen bootstrap, material de otro tenant o referencias de fuente. HBA mantiene hostssl por DB/rol/subred+rechazo total al final, TLS verify-full/SNI propios; no ampliar CONNECT ni usar `rejectUnauthorized:false` para continuar.

## 5. Continuación de ACK perdido, reloj y rollback

Una frontera debe registrar exactamente esperado/observado, sin inferir éxito de un timeout ni fallo por ausencia de acuse. ROLLBACK sin ACK conserva incertidumbre; un error4xx anterior no la elimina. El journal/result de etapa se anota únicamente después de observar el efecto durable exacto y cerrar SQL/proceso cuando corresponda.

| Frontera | Continuación obligatoria bajo barrera/admisión cerrada |
|---|---|
| Crash antes/después de publicar material | Bundle final íntegro se reutiliza; si hay intent SQL sin bundle íntegro, aborta. No nuevo generation/password/salt |
| ALTER ROLE/metadata sin ACK | Consultar rol/ACL/verificador exactos y usar únicamente old/new credenciales custodiadas del destino. Si estado esperado nuevo está íntegro, registrar observado; si old con ROLLBACK/fin conocido, completar la misma etapa; otro estado o SQL vivo mantiene cerrado |
| A/B en diferentes etapas de epoch/config | Cada DB conserva su etapa esperada y mapa del mismo run. Sólo pares de progreso preregistrados; no adoptar epoch mayor, cambiar esquema para que pase ni reescribir operaciones históricas |
| Clock acquire/advance sin ACK | Consultar owner/gen/tick/version central y authority; reconciliar la misma operación. No iniciar otro reloj por antigüedad ni por ausencia de heartbeat |
| Fence local OPEN pero central/global todavía cerrado | No admitir negocio. Leer progreso durable y concluir exactamente el CAS restante o conservar/cerrar restrictivamente con nueva transición propia; nunca afirmar que todo fence quedó CLOSED tras crash |
| Activación final sin ACK | Readiness continúa503 hasta lectura de COMPLETE/ref/barrier y todas las guardas. Si el COMMIT existe, no se repite; si no y fin/ROLLBACK acreditados, continuar la misma transición esperada |
| Crash después de COMPLETE | Validar estado/config y proofs antes del reinicio; una instancia nueva no hereda permisos del preparador. Si no hay conformidad, barrera/cierre propios antes de permitir efectos; no reset cuotas |

El propietario inicial del clock del destino y el propietario de su primera adquisición deben quedar identificados antes de SQL en el material/intent, con expectedOwner y generation exactos. `createClock` permite owner explícito, pero el worker CP017 genera su owner al crear el factory: L3 debe ligar el owner propuesto al run y custodiarlo antes de adquirirlo, sin sustituirlo al repetir. Un reinicio posterior exige proof real de salida de la instancia previa y SQL ausente; si introduce un nuevo owner, su nueva operación de transferencia y material se registran **antes** del CAS. No confundirlo con repetir la primera adquisición.

Clock target puede avanzar con barrera true; APIs sólo obtienen ready después de activación y observaciones comprometidas suficientes. Crear una nueva generation no pone tick/QH/QC/Qt a cero: conserva historia/counters y versiones monotónicas. El journal restrictivo posterior a la copia se reejecuta idempotentemente antes de elegir tenants y antes de abrir, incluidos tombstones no dependientes de generación.

Rollback no restaura copia sobre fuente ni borra journal. Antes de activación, detener procesos propios y conservar target cerrado/ledger/material para completar o abandonar; antes de volver a un artefacto compatible, acreditar interpretación de006/estado/ref/readiness y cerrar global/local con pruebas. Después de activación/efectos nuevos, cerrar admisión, drenar≤30s con fin positivo y conciliar; preservar nuevas operaciones/resultados/contadores/tombstones. No abrir el origen antiguo ni ejecutar un artefacto8199 que interprete recovery incompleto como operable. Si no existe rollback compatible verificado, forward fix bajo cierre; no downgrade/drop.

## 6. Cohorte y presupuesto propuestos para el plan único

Fuente L3 **nueva** con fixture sintético y margen prebackup; destino nuevo de la misma ejecución, ownership/volúmenes/redes propios distintos de fuente, CP017 y ajenos. Preparación/documentación CP018 no crea esa cohorte. Configuración real de Compose debe validarse por digest/manifiesto, no por nombre amigable.

Estrategia mínima: **un PostgreSQL activo cada vez**, copia offline. Preparar/ensayar fuente→cerrar API/worker/web y conciliar→parar PG/copia verificada→activar PG fuente sólo con fence global/local cerrados para el canario postcopy/journal→parar PG fuente positivamente→activar PG destino privado→replay/config/validación→worker→APIs/admisión controlada→web/probe de aceptación. Jamás writers/admisión de negocio de ambos lados simultáneos. No se necesitan dos PG simultáneos; si se propone después, deberá acreditarse otro perfil agregado antes de A/entorno.

| Perfil, único activo cada vez | CPU máxima propuesta | RAM máxima propuesta | SQL/consumidores |
|---|---:|---:|---|
| PG + preparador/migrador/custodia |.35+.25=.60|640+128=768MiB|Pool exclusivo max1, sólo DB/rol propios, sin APIs/worker/web |
| Copia offline/manifest/restore filesystem |.25|128MiB|Sin PG ni procesos de negocio; helper propio limitado, buffer≤1MiB, no herramienta del host sin contabilizar |
| Runtime PG + dos API + worker + web |.35+.20+.20+.10+.10=.95|640+320+320+192+96=1568MiB|Roles/pools heredados mínimos acreditados; no preparador simultáneo |
| Runtime + probe de aceptación |1.00|1696MiB|Probe .05/128, max1 lease de observación; presupuesto HTTP/SQL del ensayo aparte |

Techo del conjunto activo:≤1CPU/2048MiB/60conexiones. Son **presupuestos SUGGESTED**, no medidas de capacidad. Entrypoints existentes fijan control API max5×2, sesión2×2, issuer1×2, pools reader/writer agregados4pools/8leases por API; los roles y su límite global por PG impiden que esos máximos individuales signifiquen conexiones ilimitadas. Inventory necesario:17LOGIN con límites heredados cuya suma es46, bootstrap max1 sólo privado y owners NOLOGIN; ninguna escalada de INHERIT/SUPERUSER/CREATEROLE/CREATEDB/BYPASSRLS/REPLICATION salvo backup REPLICATION ya justificado, sin nuevo grant por facilitar un diagnóstico. Mantener margen para conexiones reservadas del servidor y observer; contar **todas** las sesiones reales y WAL senders. Reabrir no autoriza incrementar un límite.

Pins reportados del entorno anterior, **pendientes de revalidación local/Environment L3**, no pull/build remoto autorizado aquí: PostgreSQL `sha256:67ba68a22dc7d5af3627b7e0f33d10bbefad07562ff9703b3a6c2de247649129` (18.6/UTF8), Node `sha256:ba6b7d0ee561d9d49deb99e2b93c98632cc287b6cca1a6b18d66127054efa4dc` (24.21.0), Nginx `sha256:3abad30db61dfb2a339ea21acc9f3e6bbe78e291fcff2f835f4510c8fdfcbd83`; todos ARM64. Build frontend fuera del VPS, locks y assets/digest custodiados; no servicio externo gratuito supuesto.

Preflight inmediato antes de cada recurso/etapa: owner/cohorte/base exactos; arquitectura/version/pins/Compose compatibilidad; facts de los20 consumidores anteriores+CP017 KEEP; ausencia de listener público/socket/puerto ajeno y subredes no solapadas; ACL/HBA/TLS/volúmenes privados; huella de configuración/manifiesto/journal; espacio medido para fuente+copia+destino+WAL/logs. Propuesta conservadora: fixture/copia≤2GiB, disco libre>máximo(15GiB,10%filesystem) y mayor que bytes exactos de source+backup+target+WAL/logs+2GiB de margen; MemAvailable−2048MiB≥3072MiB; CPU busy<80% durante muestra2s. Volver a observar durante copia/promoción y al final, abortar cota o cambio ajeno sin alterar servicios ajenos. No extrapolar esa muestra a capacidad20empresas.

Controlador privado requiere subcomandos exactos por etapa sin Compose `up` global. `--no-build --pull never`, etiquetas/manifests/CIDs y paths propios; no redes de Coolify, socket Docker montado en API/worker, nginx global, Vercel, DNS o PostgreSQL público. Readiness no dispara un reinicio: el controlador evalúa cada API≤5s/≤20probes por fase y detiene la operación no acreditada. Si se agrega un `healthcheck` propio, usar live para el estado del proceso y ready para la decisión explícita de activación, con tests del contrato; ningún consumidor automático de Docker debe promover/abrir por ese resultado.

## 7. Fallos mínimos que debe preregistrar el candidato antes de A

| Corte | Negativa/continuación y evidencia de salida |
|---|---|
| Antes de intent/material final; fsync/publicación fallidos; final existente cambiado; symlink/ACL ajena | Ningún SQL; misma referencia íntegra al continuar o aborto. Máster no truncado; ningún archivo/raíz ajenos borrados |
| Después de intent y antes/tras COMMIT de rol/epoch/refs en cada DB | Observar estado exacto, reconciliar con mismo material, preservación de roles/grants/hashes/counters y barrera true; no regeneración ni adopción |
| Copia/manifest/journal omitido, alterado, truncado, checkpoint parcial o posterior perdido | Target no se abre; inventorios exactos y cadena/cabeza externas; canario restrictivo poscopy persiste; replay repetido sin efecto duplicado |
| Arranque clock con proof ajeno, dueño vivo, generation/version incompatibles o ACK perdido | Transferencia denegada o conciliada; ningún segundo dueño por TTL; quotas/history intactos; ready503 mientras incierto |
| Local OPEN/central CLOSED, pérdidaACK de activación o crash de preparador/API | POST concurrente denegado antes del efecto hasta conformidad; lectura durable del mismo CAS; B y tombstones conservados |
| Empty expected set vs error de inventario; todos CLOSED legítimos; tenant omitido/duplicado/UNKNOWN | Contrato de tabla§2; cuerpo mínimo igual, ninguna lista/permiso pública; negativos prueban que no se obtiene200 por borrar/omitir una fila |
| Antigua CA/credenciales/SID/descriptores/epoch/ref vs nuevos propios | Negativas exactas y autorización nueva company del actor original vigente; sin reactivar revocados ni reutilizar operador como bypass |
| Positivos finales de fixture con margen | Dos API/navegador: alta/recepción nuevas únicas, replay y reload, consulta histórica autorizada; filas/resultados/hash/audit/stock/sumC/cuotas exactos |
| Límite recurso/tiempo/hashes/ajenos; rollback/drain/cleanup | Aborto con cierre acreditado, recursos propios STOPPED/KEEP y ajenos idénticos. Una cota no amplía presupuesto ni inventa PASS |

Propuesta inicial de límites que root debe integrar/refinar en el plan único:≤45s por escenario de fallo,≤80HTTP/≤140SQL/max2leases; SQL bootstrap por DB de una en una, conexión≤2s/statement≤3s/lock≤500ms;≤120s por copia offline de fixture≤2GiB;≤30s drenaje+fin, sin TTL de deuda. La secuencia positiva puede dividirse en escenarios con fuentes/limites propios, nunca reiniciar un contador para ocultar un exceso dentro del mismo escenario. Estas cifras son propuestas para aprobar, no ensayos realizados ni SLA/RPO/RTO.

## 8. REQUIRED reales y resolve-before

| ID local | Carencia detectada | Diseño preparado aquí / pendiente concreto | Límite |
|---|---|---|---|
| RC-01 | Candidato rev1 exige≥1OPEN, excluye cero empresas/todas cerradas legítimas | Sustituir por contrato único§2 con inventario completo+COMPLETE y restricciones probadas; aprobar alcance/impacto y adaptar SQL/handler/consumidores en L3, no L2 | F14/Design y Specification/A |
| RC-02 | Helper L2 `recovery.mjs:199–200` genera candidate de nuevo por ejecución; `durable` abre `w`. Valida un ensayo cerrado, no protocolo reanudable una-vez | Bundle/master write-ahead inmutable§4; no-clobber, vinculación/hash, stage intents y continuación exacta. No modificar ni invalidar evidencia histórica L2 | Design antes de A/código L3 |
| RC-03 | Readiness actual central no prueba conjuntos vacíos vs filas omitidas, scopes CLOSED legítimos o conformidad completa de un recovery nuevo | Registro nuevo006+igualdad de conjuntos/proofs por función privada y barrera única§3; no `verified` libre ni inspección empresarial desde health | Design antes de A/código L3 |
| RC-04 | Generación/clock/config y publishers L2 no forman una transacción multibase/filesystem | Etapas y material estables§4–5, ACK conocido/desconocido, exclusión con fin positivo, rollback compatible y transferencia de dueño preregistrada | Design/Development antes del primer mutador |
| RC-05 | Presupuesto global de L2 no prueba coexistencia/restauración/reapertura L3 | Perfiles secuenciales§6, fuente nueva con margen, plan bounded§7 y preflight real por recurso; nada remoto ejecutado ahora | Specification/Development/Environment antes de recurso |

Son carencias del candidato respecto de L3, **no FAIL nuevos del lote L2**, ni defectos del Prompt Maestro. Completar diseño/consistencia puede continuar documentalmente; implementación requiere A exacta/B, Design/Development Gates. Pruebas host/SQL/dosAPI/navegador/restore/readiness/cleanup son NOT VERIFIED L3 y pertenecen al Environment/Phase/Integration Gate de este lote; no se posponen genéricamente a P6. Custodia externa/costes/RPO/RTO/productivo conservan Q-08/23/34 y gates del roadmap.

## 9. Provenance y comprobación proporcional

Lectura/edición documental local únicamente. Producto funcional8199 y QA2b0 conservan sus fuentes; base86985fe… es REPORTED por root y no código probado por esta ejecución. No se atribuyen CI Linux x64 o unidades Windows x64 a PostgreSQL ARM64. Fuentes byte exactas al iniciar este diseño:

| Fuente | SHA-256 |
|---|---|
| `.agentic/P1-L3_CANDIDATE.md` rev1 |`03627e96621ef3f3fbf41edcbabb73173142834e3a6dc293b1d4bd8c7226e328`|
| `docs/evidence/cp017/review-next-lot.md` |`6da5894462561be12996f003f7f9ba891d6b91f1f9d9edd70cce4d87aa9c74e5`|
| Snapshot L2 |`ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71`|
| Prompt Maestro |`d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d`|
| `server/saas/app.js` |`6084485a80ad1c4037f94ccc50ce2a55807c8036dff0d0873b56b4f975dc2276`|
| `server/saas/writes/service.js` |`6643afd4dfcbd2ba7ae5efeabe05206f920c36cf6280d6e07d22f43a641751da`|
| `admission/index.js` |`6a29f8481d325256277a19f90132b0b35d1690aa461fb485c3f15330d6da929b`|
| `admission/policy.js` |`a10c8a37aeb90e952c2105e9142d5b69854ba517f3c25a1f32a4a5dae1fc1502`|
| `admission/transfer.js` |`4b28e40ad72792f5314e1ccbb7c37a7f2cb9210bef573a102e3955795b4782e8`|
| `003-control-writers.sql` |`c5036db5fd1a71ea94e7d7feee25e299dcb074e25108465304ac6dff92955d07`|
| `cp017/recovery.mjs` |`344281ec4e0f8c54f49682453eecf47b69b52aa37c38753602cd7fc20ad6bc65`|
| `cp017/promotion.mjs` |`0b43157b28a5d37cb1279564c70a31beff011d53f10c7589b30ae9573037ca88`|
| `recovery/journal.js` |`56f8c7a9dca488bb283edbc4cfe80ca789394283cd2e7d6285c14c5ed0e31ca3`|
| `cp017/entry.mjs` |`12de4e46370650177fc2bc7f13ccb0e323d9bbd5eecb72101ff4e49421a233bb`|
| `cp017/worker.mjs` |`9a5e7c3119ea164658ba1b35a9c192368ca5cd19b40b028a73a0e883751e6e1a`|
| `infra/compose.yaml` |`d595e9d63bf8a48a0f950268d0d613b3727f3d6c4e047004c967a58271bcd31d`|
| `infra/nginx.conf` |`2b60cb63929319f2964c58628c4f611fc41b787a26907bfc70da679b57e5b564`|
| `cp017/host.py` |`9f2328e00aca0b843c184b2a829a741a48cde54535731cccfa0ae7d359fd8941`|

Quality documental: revisar links/referencias existentes, cuerpos HTTP consistentes, estados SUGGESTED/NV, suma de perfiles y conexión de las RC con gates. Sin tests de runtime ni promesa de Design Gate PASS por este autor; el review independiente del candidato integrado y su hash definitivo corresponde a la siguiente tarea del coordinador. No commit autorreferencial. Recursos creados/modificados: **ninguno**.
