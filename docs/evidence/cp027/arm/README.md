# CP-027 — recorrido portable ARM64, preparación del controlador

Estado de este documento: código preparado; resultados físicos sólo se acreditan mediante el run de GitHub y su SHA exacto. No equivale a Oracle ni a aceptación completa de L3.

Entrada: `MECANET_CI_PROFILE=arm64-recovery node tests/integration/ci-postgres.mjs run-arm-recovery`. Conserva los modos `assert-sql`, `assert-http`, `cleanup`, `assert-pass`. El último exige recuperación portable y cleanup de destino además del reloj original. Sin el perfil exacto, `run-arm-recovery` se rechaza. El perfil anterior x64 y su imagen permanecen disponibles.

Se reutiliza el CI existente, su misma raíz efímera `.qa-private/cp023-ci`, Docker endurecido y los componentes productivos de PostgreSQL/Node. Origen en `data`, destino en `target/data`, puertos loopback 15432/15433; nunca dos PostgreSQL iniciados simultáneamente. El target se crea únicamente después de FIN positivo de ambas API, cierre SQL productivo, cierre de pools y PostgreSQL EXITED/0/PID0/no OOM verificado contra el CID original. No hay búsqueda/adopción por etiqueta.

Límites compartidos origen/destino: 600 segundos, 8.192 comandos SQL del controlador y 80 HTTP. Cada PostgreSQL tiene 1 CPU, 1 GiB, 128 PIDs, 60 conexiones y ningún puerto publicado. El contador del controlador **no mide globalmente SQL interno PostgreSQL ni todos los comandos de las API**; el informe lo declara. La copia impone 5.000 archivos/1 GiB y 64 MiB por archivo. Son abortos finitos, no prueba previa de duración/capacidad Oracle.

Imagen ARM verificada por Root en `../preflight/image-identity.json`: manifest `a63b24165ea0eacced7585766d790ac08bbaefe10a1841f87783a4505d29a69c`, config `0336095afa072c685c93021dcfa4a5fee9cbce25ecd65121b58226c787afc0d0`, Linux arm64/v8, PostgreSQL18.6. El driver comprueba además Node24.21.0, arquitectura real de Node, plataforma Docker de la imagen, runner hospedado y repositorio exactos. Rechaza Docker remoto configurado. No QEMU ni self-hosted.

## Recorrido mínimo

1. Fuente nueva: SQL001…006, identidades A/B, productos, recepción, clock real con tres conflictos SQL/ROLLBACK_ACK y continuación del mismo responsable. Dos API TLS ejecutan login, producto, recepción, replay e inventario.
2. FIN positivo de las dos API; restricciones productivas RESTORE/A y TENANT/B, barrera cerrada, cero tickets/reservas pendientes. Cierre del reloj/pools y Docker FIN. La repetición de STOP conserva la misma promesa, incluso rechazada.
3. Copia binaria completa detenida. Rechaza aliases, enlaces y rutas ajenas; hash por archivo antes/después del origen y en el destino, `fsync` de archivos y directorios. No se publica el contenido de datos o certificados.
4. Destino independiente con mismo system identifier por tratarse de copia física y distinta ruta/puerto. Material nuevo custodiado antes de rotación, `fsync` de directorio Linux, contraseñas antiguas rechazadas, `begin_recovery`, enrolamiento selectivo, CAS, transferencia de reloj con ACK de COMMIT descartado y reconciliación positiva. A OPEN; B CLOSED y restricción activa.
5. Dos API nuevas: login, producto y recepción nuevos, replay, existencias/movimientos. Comprueba sesión antigua inválida, operación histórica del mismo actor con resultado intacto, epoch antiguo rechazado y sesión B sin acceso a inventario. Son 13 HTTP de fuente + 13 de destino + 6 de continuidad = 32 nominales, dentro del cap80.
6. Cierre de API/reloj/pools del destino; vuelve a comprobar fallo de reloj después del drain. Cinco probes PostgreSQL: producto/recepción creados dentro de TX, fallo antes de enviar COMMIT y ROLLBACK_ACK sin efectos; cuatro negativas CAS/proof/ACL con fingerprint idéntico. Es rollback SQL, **no rollback de artefactos**.
7. Cleanup de ambos CID verificados y recibos propios; cualquier identidad/FIN/cierre incierto mantiene FAIL/UNKNOWN. Los directorios privados se conservan hasta destruir el runner efímero. No uploads de backups, credenciales o certificados.

## Alcance de evidencia

`runRecoverySql` usa las funciones SQL productivas y `createClock`; sus anclas de manifiesto/journal/proof son fixtures explícitos. La copia binaria y la custodia Linux reales no convierten esas anclas en validación del protocolo exterior completo. Interrupción de reconciliación, reinicio con deuda UNKNOWN, journal integral, rollback de artefactos, 135 escenarios, Compose y convivencia/capacidad Oracle permanecen NOT VERIFIED hasta sus pruebas propias.

Las siete pruebas puras CP027 y las nueve regresiones previas de reloj verifican adaptadores/guardas en Windows x64, sin PostgreSQL o HTTP. RED de STOP conservado en `stop-red.json`; no es recuperación física. Los resultados CI deben vincularse por separado a commit y runner.

## Delta progresivo posterior al primer recorrido ARM PASS

El primer recorrido físico corresponde al commit `a3885965652b54865e183f263fa0a4e2aad2276f` y al run39077703743; su evidencia se conserva por separado. Este delta requiere su propio run/SHA antes de acreditar efectos reales:

- `interruptReconciliation:true` sólo en la llamada CI de recuperación. Un adaptador descarta exactamente una respuesta del SELECT real del reloj **después** del ACK del driver. El reloj productivo conserva UNCERTAIN y no avanza. La observación siguiente reconcilia positivamente el mismo responsable, sin adquisición nueva ni regeneración. No es pérdida física de red ni reinicio de trabajador.
- Después de continuidad, ambas API originales terminan positivamente; se arrancan dos procesos nuevos, con PIDs distintos de ambos anteriores, contra la misma base y reloj. Dos readiness, sesión existente y resultado histórico intacto añaden cuatro HTTP. PostgreSQL y el responsable del reloj no se reinician.
- Incremento nominal: un SELECT y cuatro HTTP; 36HTTP nominales totales. Mismos600s/8192SQL-controlador/80HTTP; sin recursos simultáneos extra, misma clausura y cleanup. Tres pruebas nuevas de componentes verifican el adaptador y las identidades, sin SQL/HTTP real local. No contar como nuevas las siete pruebas del mínimo.
