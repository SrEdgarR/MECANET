# Ensayo privado de recuperación P1-L1

Harness exclusivo del proyecto `mecanet-qa-p1l1`, PostgreSQL 18.6 ARM64 y cuatro identidades sintéticas. No es un comando de recuperación productiva ni acredita RPO/RTO, pérdida del VPS, custodia externa o reapertura del servicio. La ejecución real y su SHA se registran en la evidencia de raíz; estos archivos por sí solos no son PASS.

## Condiciones y archivos

- El operador verifica etiquetas, rutas, volúmenes, redes y límites del proyecto propio antes de cualquier comando. No se opera Coolify, su proxy, Nexora ni bases existentes. No se ejecuta `down -v`, `prune` ni una eliminación por patrones.
- Se conserva el límite agregado autorizado de 1 CPU y 2 GiB mediante pasos secuenciales. Detener las dos API, web y workers propios antes del backup. Detener PostgreSQL origen antes de arrancar el destino. Abortar ante presión del host, disco insuficiente, error de integridad, destino ambiguo o incumplimiento de los límites.
- El helper Node 24.21 tiene solo el código de ensayo, la red propia correspondiente y montajes explícitos. Nunca Docker socket. Los secretos van bajo `/run/qa-secrets`, legibles solo por su usuario; no se imprimen, adjuntan ni versionan.
- `connections.json`, `bootstrap`, `fixture-login.json` y `/run/qa-ca.crt` proceden únicamente de la fixture QA creada en esta ejecución. El runner no lee `.env`.
- `/run/qa-recovery` es persistente, privado e independiente de PGDATA origen/destino. Contiene `journal.jsonl`, `state.json`, `proof.json`, `backup-proof.json` y `result.json`. Los anchors finales se conservan también fuera del destino restaurado. La cadena SHA-256 detecta alteraciones respecto a ese anchor: no es una firma ni protege frente a un custodio que sustituya journal y anchor a la vez.
- `/backup/base` es un destino nuevo y vacío de backup, distinto de PGDATA. El volumen de restauración es otro volumen propio nuevo, nunca el de origen ni el de backup.

## Secuencia operativa

1. Con el origen aún accesible y las API propias vivas, ejecutar en el helper:

   ```sh
   node tests/qa/recovery/run.mjs prepare
   ```

   Aplica el delta privado `schema.sql` una sola vez, crea cuatro sesiones sintéticas mediante el emisor privado y el store estándar, y guarda sus SID exclusivamente en `/run/qa-secrets/recovery-sessions.json`. Después persiste el intento externo con fsync, cierra la barrera SQL y su checkpoint en COMMIT y persiste el resultado. El preparador usa su conexión administrativa propia; esto no sustituye las pruebas de permisos del emisor/runtime. Si se interrumpe esta fase, conservar estado y journal: no reabrir ni borrar para reintentar.

2. Acreditar el rechazo de admisión y emisión por ambas API después de la barrera. En cada contenedor propio, `/tmp/qa-owner.json` identifica `owner` y generación. Antes de detenerlas, enlazar esos UUID con `pg_stat_activity.application_name = 'mecanet-qa-api:' || owner`, dirección de cliente y la IP/ID del contenedor inspeccionado. Detener exactamente esas API, web, reloj y proyector propios. Registrar contenedores detenidos y ausencia de sus backends. No inventar UUID para completar el formulario. Si quedan tickets WAITING/ACTIVE/UNCERTAIN, reconciliarlos solo con prueba real de runner detenido, SQL finalizado y respuesta finalizada mediante el reconciliador privado; no borrarlos ni reiniciar contadores.

3. Guardar `proof.json` con los dos UUID comprobados en `apiOwnersStopped`, `clockStopped:true` y `projectionStopped:true`. Cada booleano requiere evidencia externa concreta; el runner no inspecciona Docker. Ejecutar:

   ```sh
   node tests/qa/recovery/run.mjs snapshot
   ```

   Verifica cluster/generación/TLS/barrera/checkpoint, cero tickets vivos y journal íntegro. Registra roles, propietarios, ACL, índices, constraints, conteos y hashes de los datos sintéticos, más el estado que no puede cambiar después de la barrera. El origen no se reabre.

4. Ejecutar herramientas PostgreSQL 18.6 de la imagen ARM64 fijada por digest en el recurso QA, dentro de la red privada de origen. Comprobar previamente que no hay tablespaces externos y que `saas_backup` tiene REPLICATION, límite de dos conexiones y HBA de replicación exacta. Configurar `PGSSLMODE=verify-full`, `PGSSLROOTCERT=/run/qa-ca.crt` y `PGPASSFILE` privado con permiso 0600. No pasar contraseña por CLI ni desactivar TLS. Sobre el destino nuevo:

   ```sh
   pg_basebackup --host=postgres --username=saas_backup --pgdata=/backup/base --format=plain --wal-method=stream --checkpoint=fast --manifest-checksums=SHA256 --no-password
   pg_verifybackup /backup/base
   ```

   No usar `--no-sync`, `--no-manifest`, `--no-parse-wal`, `--write-recovery-conf` ni un slot permanente. El streaming usa dos conexiones de replicación y conserva los WAL necesarios en la copia. `pg_verifybackup` verifica manifiesto, archivos y WAL, pero no reemplaza arrancar y probar la restauración. Registrar versiones, salida/exit code, tamaño y duración; detener el ensayo si falla. [pg_basebackup 18](https://www.postgresql.org/docs/18/app-pgbasebackup.html), [pg_verifybackup 18](https://www.postgresql.org/docs/18/app-pgverifybackup.html).

5. Solo después del resultado real de verificación, guardar `backup-proof.json` con `pgVerifybackupExitCode:0` y `toolVersion:"18.6"`. Ejecutar:

   ```sh
   node tests/qa/recovery/run.mjs canaries
   ```

   Ancla el hash del manifiesto y su rango LSN. Registra dos intentos y resultados durables: revocar identidad B y purgar solo el producto canario de A. El UUID compartido de B permanece. Comprueba que la actividad, políticas, directorio, tickets y ventanas no cambiaron. Solo estas restricciones privadas pueden escribir en el origen; la barrera sigue cerrada.

6. Detener PostgreSQL origen. Crear una red interna aislada y volumen destino propios sin puertos públicos ni conexión a redes de otros proyectos. Copiar la copia verificada al nuevo PGDATA, conservando permisos; determinar UID/GID reales desde la imagen, no asumirlos. Revisar `postgresql.auto.conf`, señales de standby/recovery y rutas antes de arrancar: el destino no debe conectar al origen. Montar TLS nuevo con SAN igual al hostname destino y HBA exacta de la nueva red, incluido `qa_bootstrap` administrativo temporal; no heredar una regla más amplia. No modificar la copia original para arrancar. El `system_identifier` físico es deliberadamente el mismo; la separación se acredita con volumen/servicio/red diferentes y origen detenido.

7. Guardar `/run/qa-secrets/restore-bootstrap.json` con `connection` explícita verificada (`host` igual al servicio destino, DB `mecanet_control`, usuario `qa_bootstrap`, CA/contraseña privadas), `source:{service:"postgres",volume:"<nombre propio comprobado>"}` y `target:{service:"<otro servicio>",volume:"<otro volumen propio comprobado>"}`. Ambos nombres de volumen deben empezar por `mecanet-qa-p1l1_` o `mecanet-qa-p1l1-`. Completar `proof.json`, desde evidencia real, con `sourceBarrier`, `sourceStopped`, `targetEgressClosed`, `targetTlsReviewed`, `targetHbaReviewed`, `targetPrivate` y `backupVerified` en true, conservando los owners y workers del paso 3.

8. En el helper conectado únicamente a la red destino, ejecutar:

   ```sh
   node tests/qa/recovery/run.mjs restore
   ```

   Verifica el manifiesto y la cohorte física antes de modificarla; reproduce todos los intentos restrictivos, incluidos los que no tengan resultado, y repite el replay para comprobar idempotencia. Comprueba los canarios, revoca las sesiones anteriores y la demo, vacía solo los tres stores sintéticos restaurados, incrementa epochs/versiones, cambia generación, rota credenciales y verifica conexiones nuevas, rechazo de las antiguas y acceso cruzado denegado. Las cuatro sesiones de muestra deben existir en la copia y después ser rechazadas por la autoridad real. Antes de `ALTER ROLE`, se genera y persiste con fsync el candidato exacto en `restore-credential-candidate.json`, privado y exclusivo. Tras COMMIT se registra la fase `credentials_rotated`; después de las negativas se escribe `restore-connections.json`. Nunca se imprimen los secretos. Una caída intermedia exige diagnóstico manual del destino cerrado usando el candidato custodiado; este runner no reanuda automáticamente ni genera otra contraseña por reintento.

9. Revisar `result.json` y evidencias. El resultado conserva `barrier:true`, empresas en `draining`, demo bloqueada y `applicationReopened:false`. No hay reapertura automática: faltan revisión del resultado, comprobaciones HTTP posteriores que correspondan y autorización/gate aplicable. Un fallo intermedio deja el destino cerrado; no vuelve al origen ni intenta abrir por recuperación automática. Custodiar o limpiar solo recursos exactos propios según la decisión del operador, después de preservar evidencia.

## Evidencia y límites

`node --test tests/qa/recovery.test.js` ejecuta ocho pruebas locales: persistencia, exclusión de escritor, hash/sequence/anchor, truncamiento, replay de intento pendiente y preflight de destino, más tres pruebas de candidato exacto/validación previa al SQL/rotación sin secretos en el resultado. En Windows, solo fsync de directorio usa un doble explícito; la implementación Linux es estricta y debe ejercitarse por el runner real. Las pruebas de SQL, fsync Linux, backup/WAL y restauración necesitan sus salidas reales; no se infieren del test local ni del README. El replay de purga entre DB no es transacción distribuida: DELETE del UUID exacto es idempotente y precede al marcador central, de modo que una caída conserva la restricción al repetir.
