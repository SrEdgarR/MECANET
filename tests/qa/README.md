# QA privada P1-L1

Este arnés compone la fundación SaaS aprobada en `docs/specs/P1-L1.md`.
No carga `.env`, el servidor Mongo heredado ni datos de producción. El emisor
de identidades ficticias vive aquí, separado de la aplicación pública.

## Estado al cierre de CP-014

**P1-L1 COMPLETADA: ocho salidas PASS dentro de la baseline DEC-058.**
La integración local queda preparada para su Integration Gate; PR, CI remoto y
merge siguen NOT VERIFIED y no se autorizaron. P1 conserva su estado EN CURSO,
P0 general PARCIAL y el SaaS general NOT APPROVED. Ver la
[auditoría CP-014](../../docs/audit/CP-014.md) para la matriz y la versión exacta
de cada ensayo; no atribuir todos los PASS al último SHA.

CP-014 creó otra cohorte: `mecanet-qa-p1l1-cp014`, exclusivamente sintética,
en `/opt/mecanet-qa-p1l1-cp014`. PostgreSQL18.6 ARM64, Node24.21.0 y
Nginx1.30.5 se ejecutaron por digest bajo Compose propio. Sus cinco servicios
quedan **STOPPED/KEEP** al cierre; datos, redes, secretos privados y artefactos
quedan retenidos para revisión. La cohorte anterior `mecanet-qa-p1l1` conserva
sus cinco servicios detenidos y su barrera de recuperación cerrada: **no
reabrirla con `up` ni utilizar su configuración en la cohorte nueva**.
El [inventario final](../../docs/evidence/cp014/final-infrastructure.json)
acredita esa parada y la conservación de los diez consumidores ajenos y de la
evidencia CP-013.

Artefacto final F: código `b0f5e199e5df457d7f901ff3a3dca5ab3a8d5701`, digest
`sha256:5950ae7e519170ebaaf6cf8c99e9187c14b41f32779044e2829e8de5abbac0a6`.
El ensayo real F→A→F mantuvo sesión estándar, datos, generación y PostgreSQL;
A identifica el código `e512dce7dcdecec9ce202ca9a7f7b78486259383` y el digest
`sha256:05a28e4473e5717ce888e67fe16da0e119d61fcc6b79a4ec503d108ce971352d`.
Es un rollback compatible de código, sin downgrade ni restauración de la DB.

**El túnel local 18443 está cerrado; no hay URL QA activa.** La entrada privada
ensayada continúa siendo `https://app.mecanet.test:18443` por SSH y socket UNIX
propio, sin listeners TCP remotos, DNS o proxy compartido modificados.

## Reanudar únicamente la cohorte CP-014

Este procedimiento conserva datos y autoridad; no es bootstrap ni reset.
El controlador privado de reanudación/ownership corresponde al código
`409880a513bee1eff909caf68d23325af55e9be4`; su corrección de comparación de
metadatos no cambia el artefacto de ejecución F retenido y probado.

1. Acreditar de nuevo el destino exacto, `owner.json` con proyecto
   `mecanet-qa-p1l1-cp014`, propietario `SrEdgarR/MECANET` y base
   `5624ef0da489d2285534a942bd6ce9eab22f280d`. Comprobar recursos disponibles,
   consumidores intactos, artefacto F/manifiesto/montajes, límites y las redes
   propias de datos 10.77.41.0/24 y frontal 10.77.42.0/24. Verificar aislamiento y
   ausencia de egreso; no asumirlos por `internal:true`.
2. Verificar vigencia, CA privada, hostname y claves TLS de esta cohorte. Una CA
   vencida impide reanudar hasta renovar exclusivamente su material QA y
   acreditar de nuevo la confianza del perfil privado. No copiar secretos de
   producción, de CP-013 o de otra aplicación, ni instalar confianza global.
3. Con Compose de `/opt/mecanet-qa-p1l1-cp014/compose.yaml`, arrancar **solo
   PostgreSQL** conservando imagen 18.6, configuración y datos. Confirmar salud,
   `system_identifier`, TLS y durabilidad antes de iniciar consumidores. No
   upgrade, reset, preparación de fixture ni cambio de barrera.
4. Acreditar que el worker anterior propio está `exited`. Ejecutar el relevo
   controlado `host.py transfer` de `tests/qa/cp014`: el controlador verifica
   propiedad/salida y CAS del dueño del reloj antes de iniciar el nuevo worker.
   Conservar generación, tick, ledger y reservas inciertas; ni TTL ni reinicio
   demuestran su finalización.
5. Recrear únicamente `api1` y `api2` del proyecto, luego `web`, usando el
   artefacto retenido. Confirmar IPs frontales propias api1=.3, api2=.4,
   web=.2 y resolución de upstreams fresca; nunca reclamar .2 desde una API.
   Verificar readiness de ambas API, TLS, asset404/API JSON y límites/redes.
6. Abrir el túnel SSH a `127.0.0.1:18443` solo después de comprobar ocupación
   local; destino remoto: socket exclusivo `ingress/web.sock` de CP-014.
   Comprobar CA/hostname/pin y resolver `.test` únicamente en navegador/arnés
   privado. Cerrar túnel y perfiles temporales al terminar.

No ejecutar un `compose up` general: saltaría el orden y la prueba de relevo.
No administrar esta cohorte mediante Coolify, tocar proxy/Nexora/EAK, publicar
puertos o liberar deuda incierta para obtener readiness.

## Estado histórico al cierre de CP-013

La instalación temporal `mecanet-qa-p1l1` se ejecutó en Linux ARM64 mediante
Compose propio, PostgreSQL18.6, Node24.21 y Nginx1.30.5 por digest. Se probó el
recorrido HTTPS, API, PostgreSQL y navegador. Después, el ensayo de recuperación
cerró la barrera y detuvo el origen. La restauración pasó y su contenedor/red se
retiraron; los datos sintéticos, copia y journal privados se conservaron.

**No hay URL QA activa ni túnel abierto al cierre.** No ejecutar `up` para
intentar reabrir la fuente. El siguiente ensayo necesita un procedimiento de
cohorte/credenciales revisado, preflight actual y los mismos límites; no reutilizar
la configuración anterior contra el destino rotado ni borrar la evidencia.

Durante la ejecución, la entrada fue
`https://app.mecanet.test:18443` → loopback local → SSH → socket UNIX exclusivo
del Nginx QA. El navegador usó un perfil efímero y el pin de la CA QA comprobado
por Node. No se modificaron hosts/confianza globales, DNS, proxy ni puertos80/443.
No hay puerto PostgreSQL publicado ni listener TCP de Mecanet en el VPS.

## Separación y presupuesto

- Web: red frontal propia; API1/2: frontal y datos; PG/worker: solo datos.
  Redes internas con gateway `isolated`; negativas reales registradas, sin
  atribuir protección frente al administrador root del host.
- Roles separados: API, store, emisor, reloj, política, reconciliador, medición,
  backup y lectura de cada DB. Propietarios NOLOGIN; HBA exacta y TLS verificado.
- Runtime:0,95CPU/1568MiB; recursos no privilegiados/read-only/PIDs/logs acotados.
  Helper normal0,25CPU solo con API/web detenidos; helper de recuperación0,05CPU
  permite coexistir con runtime dentro de1CPU/2GiB. Prueba de dos procesos usa
  helper256MiB con API/web detenidos. Backup/restore son secuenciales.
- Secretos locales en `.qa-private/` y remotos en el directorio privado propio;
  nunca se versionan ni se imprimen. Ninguna credencial de otra aplicación.
- No builds en el VPS: bundle React y dependencias JavaScript preparados localmente,
  transferidos a montaje de solo lectura. Los digests base y hashes de archivos
  están en `docs/evidence/cp013/runtime-manifest.json`. CP-014 añade selección
  de artefactos inmutables y rollback real compatibles, acreditados en su auditoría.

## Pruebas y operación

Los tests `*-integration.test.js` necesitan explícitamente los archivos privados
del arnés, red/cluster/generación acreditados y sus roles correspondientes. No
se ejecutan contra Atlas ni sobre una URI recibida por parámetros arbitrarios.
`http.test.mjs` y `browser.mjs` solo aceptan el destino HTTPS privado aprobado.
Las pruebas locales sin DB se identifican por la lista exacta registrada en
`docs/evidence/cp013/local-tests-final.txt`; frontend aislado:

```powershell
npm --prefix client run test:run -- src/saas
```

El runtime y npm exactos deben estar acreditados; no usar estos comandos como
autorización para instalar herramientas globales o apuntar a otro entorno.

`infra/bootstrap-host.py` exige destino nuevo y propiedad exacta; no es un reset.
`prepare.mjs` crea únicamente la fixture vacía autorizada una vez.
`infra/verify-isolation.py` verifica límites/montajes/redes y sondeos finitos.
`infra/transfer-worker.py` acredita la salida del proceso anterior antes del CAS
del reloj. No roba el reloj por TTL ni libera tickets inciertos.
`infra/lifecycle.py` prueba readiness y relevo, no todas las carreras en vuelo.
Los arneses `cp014/` amplían esa evidencia: sesiones/propósitos HTTP entre dos
API, ledger/último cupo/fallos/reinicios, proyección SQL del worker, dos puntos
de drenaje y rollback de artefactos. Sus controles de fallos son privados por
archivo, no headers de bypass ni rutas públicas. `observability-live.mjs`
usa las etapas `before`, `buffer-recovery` y `after`: la etapa de recuperación
exige worker detenido para respetar el límite global de una conexión de
`saas_measure`; no elevarlo ni ejecutar ambos productores simultáneamente.

[Recuperación sintética](recovery/README.md) describe barrera, copia física/WAL,
journal, canarios y custodia previa de credenciales. La reanudación después de un
fallo parcial es manual sobre el destino cerrado. No hay reapertura automática,
prune global, downgrade ciego, migración real, HA ni RPO/RTO acreditados.

Ver [auditoría CP-013](../../docs/audit/CP-013.md) para resultados y límites
históricos y [CP-014](../../docs/audit/CP-014.md) para el cierre integrado y
SHA por ensayo. Los tests históricos Mongo no prueban esta fundación PostgreSQL.
