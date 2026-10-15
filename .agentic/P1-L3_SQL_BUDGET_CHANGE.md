# SC-012 — presupuesto SQL de la cohorte r02

**SUGGESTED / NOT APPROVED.** CP-020, 2026-10-15. DEC-070 propuesta; no se ha aplicado a código, registro de casos, ledger ni recursos. La instrucción humana actual autoriza terminar las verificaciones locales y presentar este ajuste antes de iniciar r02. No constituye su aprobación.

## Objeto exacto para aprobación

Modificar únicamente las dos cotas SQL del ensayo P1-L3 aprobado en DEC-067/068, conservado en `docs/specs/p1-l3-approved/baseline.md`, hash `4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec`:

| Cota | Aprobada vigente | Propuesta SC-012 |
|---|---:|---:|
| SQL por caso semántico | 140 | **8192** |
| SQL acumulada de todo el ensayo | 3000 | **200000** |

La unidad sigue siendo cada `pool.query` y `client.query` antes de enviarla: BEGIN, configuración, COMMIT/ROLLBACK, observadores, reloj, coordinador, fallos y reintentos incluidos. Un máximo global compartido por fuente, destino y variantes; no presupuestos nuevos por variante ni descuentos o reinicios al cambiar de fase.

Permanecen sin cambios: **45 segundos y 80 HTTP por caso; 30 minutos activos, 300 HTTP, 2000 archivos de artefactos y 1000 registros de journal acumulados; 1 CPU, 2048 MiB y 60 conexiones como máximos agregados; datos/copia/destino e índices con sus cotas originales**. También se conservan los máximos específicos de §8: dos leases por escenario, copia offline de hasta120s y drenaje de hasta30s, sin usar su vencimiento como prueba de FIN. Se mantienen la exclusión de escritores, los controles de disco/RAM/CPU, las cadencias del reloj, el aislamiento, los pins, la conservación y el aborto al alcanzar una cota. No se cambia ninguna cuota de empresa ni permiso o contrato de producto.

Identidad exclusivamente SC-011/DEC-069: `mecanet-qa-p1l3-r02` y `mecanet-qa-p1l3-r02-target`; r01 y CP-017 STOPPED/KEEP. No tercera cohorte, regeneración de un paso confirmado o reutilización de material anterior. r02 todavía no tiene raíces, ledger, base de datos ni contenedores.

## Motivo y fundamento

[Conteo reproducible](../docs/evidence/cp020/sql-budget-feasibility.md): una petición admitida usa **97 consultas** antes de autenticación, negocio y fondo. Un subconjunto de 34 peticiones del recorrido principal exige **3298 > 3000**. El mismo caso de historial del navegador contiene seis GET y una recarga: **679 > 140**, sin contar el fondo. No son medidas de PostgreSQL físico ni de capacidad del VPS.

Dimensionamiento nominal, con latencia despreciable: reloj 50 SQL/s, coordinador 25 SQL/s y dos observadores 13,333 SQL/s; juntos 88,333 SQL/s. En 45 segundos son 3975 de fondo; siete peticiones suman al menos 679, dando 4654 antes de otros costes. 8192 deja margen sobre ese recorrido sano. En 30 minutos exclusivos de actividad el fondo nominal suma 159000; 200000 reserva 41000 para arranques, negocio, controles y compensaciones. Las variantes comparten ese tiempo y ese total, no multiplican el presupuesto.

Estos márgenes **no garantizan completar todos los fallos, contención o reintentos**. Las tasas nominales no son una cota universal; ante otro agotamiento se aborta, se conserva la evidencia y se analiza sin elevar límites automáticamente. Tampoco acreditan recursos suficientes, rendimiento comercial o RPO/RTO.

## Impacto y reverse-impact

Es **SPEC CHANGE de una condición cuantitativa protegida**, no SPEC ERRATA ni autorización implícita de A/B. Cambiarían el wrapper de ejecución y el registro cerrado de cotas, ledger/controladores, preflights y pruebas que comparan esas cotas. Hay que actualizar todos los consumidores coherentemente y revisar una única huella del registro **antes del primer efecto r02**. El snapshot aprobado y la evidencia histórica conservan sus bytes y límites.

No cambia el diseño funcional SQL006, CAS, credenciales, barreras, promoción, sesiones o readiness; L1/L2 TERMINAL y sus evidencias permanecen intactos. A/B funcionales DEC-067/068 y SC-011 ya aprobadas no se vuelven a solicitar. No altera infraestructura compartida, producción, DNS, Coolify, Traefik, Nexora, EAK ni recursos antiguos.

## Alternativas y reversión

Conservar 140/3000 mantiene el Environment Gate FAIL por inviabilidad local demostrada. Reducir las consultas reales exigiría un rediseño revisado que preserve íntegramente los contratos; ocultar consultas, ralentizar artificialmente el reloj, dividir un caso en alias o reiniciar contadores no es una alternativa válida. No se propone una optimización funcional como condición para terminar este ensayo.

Antes de crear r02, retirar esta propuesta sólo deja las cotas vigentes: no hay recursos o ledger que revertir. Tras una aprobación y un futuro inicio, no se reduce un contador ni se reescribe un registro confirmado para volver a las cotas antiguas: detener escritores propios, acreditar FIN y conservar material/ledger/datos/evidencia. Cualquier intento posterior conserva su gate y autorización de identidad.

## Condiciones de continuación

1. Aprobación humana explícita de **SC-012, exactamente 8192 SQL/caso y 200000 SQL global**, sin ampliar otras cotas.
2. Aplicación coherente revisada y pruebas de las nuevas cotas/registro; terminar el wiring QA pendiente de variantes y su propiedad, sin nueva A/B funcional.
3. Quality Gate del código exacto y Environment/preflight frescos antes de cada recurso. La aprobación del presupuesto no constituye un PASS de ninguno de ellos.
4. Ejecutar r02 sólo después; seis salidas físicas y review/Integration Gate antes de publicar o fusionar la rama. Ningún lanzamiento público o migración real autorizado.
