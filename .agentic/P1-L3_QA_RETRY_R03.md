# SC-014 — pareja sucesora exclusiva r03 para QA P1-L3

Versión v0.1-CP021, 2026-10-15. **SUGGESTED / NOT APPROVED. DEC-072 propuesta.** Este documento presenta un objeto revisable; no autoriza aplicar identidades, consumidores, redes, certificados, material, ledger o recursos r03. No se ha recibido aprobación humana de este objeto.

## Antecedentes confirmados y límite del intento r02

A/B de P1-L3, DEC-067/068, siguen aprobadas sobre el snapshot funcional SHA-256 `4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec`. [SC-011/DEC-069](P1-L3_ENV_RETRY.md) autorizó exclusivamente r02/r02-target, conservando r01. [SC-012/DEC-070](P1-L3_SQL_BUDGET_CHANGE.md) y [SC-013/DEC-071](P1-L3_ARTIFACT_BUDGET_CHANGE.md) aprobaron después únicamente sus ajustes de contadores. Los rótulos NOT APPROVED de esos dos objetos históricos no revocan las aprobaciones registradas en el [wrapper vigente](../docs/specs/P1-L3.md); tampoco autorizan una cohorte adicional.

**DETECTED / ejecución física r02:** el [primer intento](../docs/evidence/cp021/remote-run.json), runtime/source SHA `ca15ed980de8167cc6144285a43b85cfbf71a7d3`, terminó FAIL antes de iniciar PostgreSQL. Su cleanup fue PASS con cero propios pendientes y 27 consumidores anteriores preservados. La [comprobación de Compose](../docs/evidence/cp021/compose-compatibility.json) detectó que el CREATE instalado no admitía `--no-deps` y sí `--no-recreate`.

La [continuación acotada](../docs/evidence/cp021/remote-resume.json), controlador externo `79fab18359e49703b9fb823f8fc099fa6c1a7f7f`, conservó el runtime, helpers, plan, material y ledger originales. Falló `SOURCE_CREATED_MOUNT` después de CREATE y antes de START. El validador exigía ver los tmpfs en `.Mounts` de un contenedor CREATED; la [lectura posterior](../docs/evidence/cp021/mount-readonly.json) documenta la configuración en `.HostConfig.Tmpfs`. Esto es un defecto del arnés, no evidencia de PostgreSQL iniciado ni autorización para omitir controles de montaje.

La [preservación final observada](../docs/evidence/cp021/preservation-final.json), 2026-10-15T14:22:57Z, conserva:

- 27 consumidores anteriores intactos; 28 contenedores en total y un único propio r02: `ddcbb1b7902718fd2aa78f1a1e36a195d52085b7239e0c4005dfafa009f5bdb0`, PostgreSQL **CREATED / INACTIVE / KEEP**, `running=false`, PID0, `StartedAt` cero y `RestartCount=0`, sin puertos publicados. No se lo describe como STOPPED, exited ni FIN positivo.
- Referencia Root de servicio Source ausente; **cleanup FAIL / UNKNOWN1** conservado. No se publicó custodia tardía: no se cerró la cadena completa dentro de la ventana original. No se adopta el CID por labels ni se convierte ese UNKNOWN en PASS.
- Dos raíces r02 existentes con modo0711 y directorios `data` sin entradas según esa observación; ese conteo no mide bytes. Sólo una red propia, `mecanet-qa-p1l3-r02-data`, interna, `10.77.61.0/24`, sin endpoints en esa foto.
- Ledger original, secuencia43, 642 artefactos y **0 SQL / 0 HTTP / 0 journal**. Cero PostgreSQL iniciados; sin recorrido HTTP, navegador o restore acreditado. La observación registra 1768,53s globales y 600,9s para `host-pg-start`: su ventana de45s está vencida y no puede reiniciarse ni sustituirse por un alias.

Se conservan los dos FAIL, el UNKNOWN y las observaciones con sus fechas y fuentes. El primer cleanup PASS no reemplaza el cleanup FAIL posterior. Quality local y correcciones locales del arnés no acreditan Environment ni las salidas físicas de L3. Este bloqueo no demuestra insuficiencia de CPU, RAM, disco o presupuesto SQL.

## Cambio exacto propuesto para aprobación

Autorizar **una sola pareja sucesora**, exclusivamente para repetir el ensayo sintético P1-L3 que no alcanzó PostgreSQL:

| Ámbito | Identidad y ruta propuestas | Red data | Red front |
|---|---|---|---|
| SOURCE | `mecanet-qa-p1l3-r03`, `/opt/mecanet-qa-p1l3-r03` | `mecanet-qa-p1l3-r03-data`, `10.77.64.0/24` | `mecanet-qa-p1l3-r03-front`, `10.77.65.0/24` |
| TARGET | `mecanet-qa-p1l3-r03-target`, `/opt/mecanet-qa-p1l3-r03-target` | `mecanet-qa-p1l3-r03-target-data`, `10.77.66.0/25` | `mecanet-qa-p1l3-r03-target-front`, `10.77.66.128/25` |

Las direcciones fijas derivadas del mismo diseño serían PostgreSQL Source `10.77.64.2`, web Source `10.77.65.2`, PostgreSQL Target `10.77.66.2` y web Target `10.77.66.130`. Se conservan Compose propio, redes internas y aisladas, sin puertos TCP públicos ni cambios en redes o proxy compartidos. La entrada QA conserva su mecanismo privado y temporal por socket UNIX/túnel local.

Las cinco variantes conservan sus nombres y semántica actuales, bajo `/opt/mecanet-qa-p1l3-r03-target/variants/`: `roster-empty`, `allclosed`, `commit-interrupted`, `promote-prefix` y `a5-restrictions`. Comparten TARGET, el registro y el presupuesto global de r03; no son cinco cohortes nuevas ni cinco presupuestos. No se amplía un selector de proyectos, una regex ni una política de adopción a identidades arbitrarias.

La foto final r02 no encontró solapamientos con los rangos propuestos64/65/66. **No constituye el preflight futuro de r03:** hay que repetir la comprobación de nombres, rangos, rutas y consumidores justo antes de cualquier recurso.

Sólo después de aprobación y gates, r03 tendría material, generaciones, operationIds, credenciales, TLS y ledger propios, elegidos una vez y custodiados con referencias y hashes. Ese ledger iniciaría el reloj de la nueva cohorte expresamente autorizada; no modifica, continúa ni pone a cero el ledger r01/r02. Ningún retry de r03 concede otra identidad, reloj o cohorte por extensión.

R01/r01-target, r02/r02-target, sus raíces, material, credenciales, TLS, ledger, datos, journal, artefactos, helpers, planes, redes y evidencia quedan **KEEP** con su estado real. El CID CREATED/UNKNOWN r02 permanece inactivo y ajeno al siguiente ensayo; no sirve de Source, copia o destino ni se inicia para preparar r03. No se copian secretos de esas cohortes ni de producción. Su almacenamiento retenido se incluye en el footprint y la capacidad libre del host antes de aprobar cada efecto nuevo.

## Límites que no cambian

Los límites de SC-012/013 se conservarían íntegros en r03, con el mismo roster de **135 escenarios semánticos**, nombres y scopes. El hash del registro cambiaría únicamente por la nueva identidad de proyecto; no se agregan escenarios ni alias de retry.

| Magnitud | Por caso | Acumulado de toda la pareja, incluidas variantes |
|---|---:|---:|
| SQL | 8192 | 200000 |
| HTTP | 80 | 300 |
| Nuevos artefactos | 2000 | 8192 |
| Registros de journal | 1000 | 1000 |
| Tiempo | 45s desde el primer cargo del caso | 1800s desde el inicio original del ledger de esa cohorte |

Cada `pool.query` y `client.query` se carga antes de enviarla, incluidos BEGIN, COMMIT/ROLLBACK, observadores, reloj, coordinador, fallos y reintentos. Cada creación real de artefacto conserva su cargo aunque sea temporal o se retire. No se descuentan cargos al cambiar de fase, proceso o variante; no se separan fases para eludir los45s ni se ocultan consultas.

Permanecen también: máximo activo agregado1CPU/2048MiB/60conexiones; un PostgreSQL activo; perfiles y pins ARM64 aprobados; máximo dos leases por escenario; copia offline hasta120s y drenaje hasta30s sin usar el timeout como FIN; Source/copia/destino, este último agregado con sus variantes, cada ámbito≤2GiB; índice≤4MiB/10000archivos; journal≤1MiB. No se modifican cadencias de reloj, límites de pools/roles, timeouts, HBA, grants, sesiones, autenticación, barreras, integridad, TLS, exclusión de escritores, conservación o aborto.

Siguen los preflights de CPUbusy<80% en muestra2s, MemAvailable−2048MiB≥3072MiB y espacio libre>max(15GiB,10% del filesystem), además del footprint medido Source+backup+Target+WAL/logs y2GiB de margen. Durante la ejecución se conservan los umbrales de aborto y la monitorización originales. Una nueva identidad no acredita capacidad, rendimiento comercial, ausencia de interferencias o suficiencia de cualquiera de esos contadores.

## Impacto, consumidores y revisión inversa

Es **SPEC CHANGE de la identidad y el entorno exclusivo de ejecución**, no SPEC ERRATA: r02 corresponde a recursos y material realmente creados y confirmados. Conforme a [Prompt§5.1](../docs/methodology/Prompt_Maestro_v2.0.md), el orden es análisis de impacto, consumidores, revisión inversa, aprobación explícita y después actualización protegida, implementación y regresiones. No se edita el Prompt ni el snapshot funcional aprobado.

| Área | Cambio necesario sólo si se aprueba | Garantía conservada |
|---|---|---|
| Documentación | DEC-072 y enmienda SC-014 en wrapper P1-L3, plan/estado/checkpoint/mapa | SC-011/012/013 e historia originales; no otra A/B funcional L3 |
| Identidad cerrada | Bindings exactos de `server/saas/recovery/protocol.js`, `custody.js` y sus consumidores | Rechazo de mixed-cohort y de material r01/r02 como input r03; sin namespace libre |
| QA y configuración | Host/controlador, registry/ledger, TLS, prepare/fixture/entry/worker, Source/Target/variantes, copy, acceptance y navegador |135 nombres/scopes, límites/perfiles/cadencias y semántica de las cinco variantes intactos |
| Artefactos y provenance | Git blobs/build/inputs exactos; nuevo hash de registry por proyecto; versiones de runtime y controlador separadas | No reetiquetar ca15 ni atribuir sus PASS a bytes distintos; no reemplazar helpers/planes originales |
| VPS propio | Rutas, cuatro redes previstas, IPs, sockets y TLS de r03; preflight fresco antes de efectos |27 previos y todo r01/r02 preservados según inventario actual; sin producción, Nexora, EAK, Coolify, Traefik o DNS |
| P1-L1/L2 | Reverse-impact de los bindings y regresiones afectadas, sin reensayo físico íntegro de lo intacto | L1/L2 TERMINAL, CP017 y sus evidencias conservan sus SHAs y alcance |
| P2 y fases posteriores | Ninguna implementación ni autorización nueva | Sus A/B, gates y requisitos pendientes siguen propios; P1 es la única fase activa |

La corrección del CREATE y de la lectura de tmpfs debe conservar todas las validaciones de binds, destinos, RW/RO, ownership, límites, aislamiento y ausencia de puertos o mounts extra. Una comparación correcta de `.HostConfig.Tmpfs` antes de START no es una prueba de un montaje runtime ya activo. No se rebaja una validación para obtener PASS ni se instala software, actualiza una imagen o realiza un build/pull en el VPS para evitar el fallo.

Riesgos detectados: el almacenamiento KEEP reduce el espacio disponible; un rango libre hoy puede estar ocupado al ejecutar; un namespace mezclado puede ligar manifiestos, certificados o referencias a la cohorte equivocada; dos fallos tempranos del arnés dejan sin acreditar el recorrido posterior. La propuesta conserva el aborto ante cada anomalía y no promete completar r03.

## Alternativas, reversión y gates

Mantener r02 en KEEP y no realizar otro ensayo es una alternativa válida; conserva L3 y sus salidas pendientes. Reanudar `host-pg-start` vencido, cambiarle el nombre, reiniciar reloj/contadores o regenerar el material r02 no son alternativas admitidas. La revisión consideró custodia tardía para cleanup, pero no se publicó al no cerrar la cadena completa antes del reloj: UNKNOWN1 y cleanup FAIL permanecen. No se usa esa posibilidad como autorización de START o recuperación funcional.

La preparación local futura puede analizar los fallos conocidos, revisar modelos y regresiones del arnés dentro de la B vigente y del encargo autorizado. **Este objeto no autoriza aplicar r03 a consumidores, generar sus secretos/certificados/material, publicar un ledger ni crear sus recursos mientras SC-014 siga NOT APPROVED.** La planificación o un modelo PASS no sustituyen la aprobación de la identidad.

Si se aprueba el objeto exacto:

1. Registrar la fuente humana y el hash aprobado en DEC-072/wrapper, preservando los bytes históricos; aplicar coherentemente los bindings cerrados y sus regresiones old/mixed/foreign-cohort, CREATE y tmpfs.
2. Completar revisión independiente, Quality del código/artefacto/controlador exactos, imports pasivos, inventario de inputs y proyección de carga/footprint. Resolver los REQUIRED antes del primer efecto dependiente.
3. Preparar inputs TLS privados fuera del VPS, validar cadena/SAN/pares/hash y custodia Root0700/0400 de los inputs. Acreditar Environment y preflight físico fresco de rutas/redes/pins/CPU/RAM/disco/conexiones/consumidores antes de cada recurso r03. La preservación final r02 no los satisface por anticipado.
4. Publicar registro cerrado antes de recursos y material nuevo una sola vez; ejecutar el ensayo con monitor, cargos completos, relojes originales de r03 y cleanup independiente del headroom o presupuesto para detener sólo procesos propios positivamente identificados.
5. Registrar los seis criterios y la matriz con fuentes reales; cerrar sus salidas, Quality y revisión local antes de publicar la rama. Después, bajo la autorización condicional existente, abrir PR, ejecutar CI/revisión, corregir fallos y fusionar sólo si cumple; verificar la canónica y cerrar Integration Gate antes de TERMINAL. Ninguna aprobación de SC-014 otorga esos PASS ni autoriza despliegue público o migración real.

Antes de r03, retirar la propuesta deja todos los recursos y registros actuales intactos. Tras un eventual inicio autorizado: abortar, detener sólo escritores propios de identidad acreditada, verificar FIN donde sea posible y conservar datos, material, ledger, journal y resultados en KEEP. No borrar para recuperar presupuesto, restaurar encima de Source, reutilizar r01/r02 ni pasar automáticamente a r04.

## Resumen para auditoría

**CONFIRMED:** A/B L3 y SC-011/012/013 aprobadas; baseline funcional intacta. **DETECTED:** r02 terminó FAIL antes de iniciar PostgreSQL o ejecutar SQL/HTTP; conserva642artefactos, caso Source vencido, un CID CREATED inactivo y cleanup FAIL/UNKNOWN1, sin custodia tardía. **SUGGESTED / NOT APPROVED:** SC-014/DEC-072, exactamente r03/r03-target y los rangos de esta propuesta con todas las demás cotas intactas. **NOT VERIFIED:** Environment y salidas físicas de r03; ninguna nueva aceptación deriva de este documento. Gate siguiente: revisión de este objeto y aprobación humana explícita antes de aplicar la nueva identidad; después Quality/Environment/preflight frescos.
