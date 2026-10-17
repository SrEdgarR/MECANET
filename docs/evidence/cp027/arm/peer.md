# CP027 — revisión independiente focal CI ARM64

2026-10-17. Provenance LOCAL. Revisor separado del autor, sobre el delta de `a8ff0a3575e2baf43792a9a15b527893947abc29`; bytes exactos en [peer-inputs.json](peer-inputs.json). Alcance: workflow, contenedor PG18.6 ARM64, copia fría, reapertura SQL, dos API, FIN/custodia y cleanup. No revisión exhaustiva del controlador135 ni aceptación Oracle/POS.

**Resultado: PASS focal de revisión; cero REQUIRED abiertos.** Esto permite continuar el CI efímero dentro de su autoridad, no declara que la recuperación ya se ejecutó o que el coste/Environment del runner estén acreditados por este documento. Esos facts corresponden al coordinador/ejecución.

## Hallazgo y corrección verificada

- **CI-ARM-R1 REQUIRED → CLOSED:** el chequeo de fallo de reloj target era anterior a `targetApis.stop()`/`target.close()`. Un advance activo puede fallar durante drain y el contexto source que revisa finally no observa ese target. Se añadió `assertRecoveredClock(target.context)` después de terminar ambos; el estado queda irreversible y una excepción conserva el reporte portable FAIL. La regresión nueva `a clock fault observed during target drain prevents a portable PASS` comprueba la negación. No se necesita otro ID para la misma causa. El bloque finally independiente conserva FAIL ante stop/pool desconocidos y exige PG target cleanup PASS; no convierte la negación en éxito.

## Límites y propiedades revisadas

- Workflow restringido a SrEdgarR/MECANET, push de la rama de verificación exacta y repositorio público para el job ARM; PR sólo transporte. Runner hospedado estándar, no selfhosted ni SSH/VPS. Permiso contents:read, checkout sin persistir credenciales, acciones y Node fijados. No deploy, cache/artifact de backups o secretos. Facturación/disponibilidad efectiva se verifican aparte; la condición no demuestra por sí misma que el runner pueda ejecutarse.
- Host Linux/ARM64 y Docker Server ARM64 se comprueban; imagen por digest e ImageID/architecture efectivos. Docker remoto prohibido. Contenedor no privilegiado/read-only/cap-drop/no-new-privileges, límites acotados, sólo bind de raíz privada exclusiva, red host con PG escuchando127.0.0.1. No socketDocker montado ni puerto público. Estos facts no equivalen aislamiento Compose/convivencia Oracle.
- CIDs se ligan a owner/source/image/command/perfiles/montajes/vars permitidas. Credenciales nuevas se guardan privadas, passwordfile y TLS propio verify-full, nunca argv/secret-env/public output. Errores Docker se sanitizan; logs se clasifican por hash, no se vuelcan. No producción/env legacy.
- Antes de copiar: ambas API STOP positivas/drained, cierre restrictivo real, pools/reloj terminados, PG EXIT0/PID0 observado por Docker. La custodia pública reporta hashes; la material real permanece privada. No timeout como FIN.
- Destino directorio exacto distinto y ausente inicialmente; ruta real sin alias, dueño actual y archivos regulares nlink1. Copia con exclusión, fsync archivo y directorios, índice exacto y verificación de source antes/después y target. Target arranca tras sourceFIN conPGDATA/port propios, mismo systemIdentifier legítimo de copia y ubicación observada distinta. No adopta ningún cluster anterior o ajeno.
- Reapertura reutiliza helper SQL existente/componentes productivos y señala explícitamente `fixtureAnchors`, `outerProtocol NOT VERIFIED`, no135/Oracle. Pruebas HTTP fresh/history/replay/oldsession/oldepoch/Bblocked con dos procesos; target rotation usa nuevo bundle custodiado antes de efectos. Reloj target usa el mismo adaptador diagnóstico ya probado, sin política SC020.
- Cleanup intenta consumidores de source y target por separado, STOP memorizado y fallo estable. PG sólo se elimina tras identidad exacta y FIN positivo; ausencia de referencia/estado ambiguo queda UNKNOWN/FAIL. El finally no concede PASS si target cleanup o stop es incierto. Recursos/archivos privados pertenecen al runner efímero; no se publican copias/certificados/materiales.

## Verificación local realizada por el revisor

- Node24.21 Windowsx64: cuatro archivos CP027, **7/7 pruebas PASS**, cero omitidas. Incluye paths/sourceFIN/report guard, perfilARM y STOP doble/UNKNOWN, más R1. Son componentes sin PostgreSQL/Docker/HTTP, no ARM64 ni fsyncLinux.
- `ci-postgres.mjs --self-test`: PASS12negativas de identidad/perfiles/vars, sqlCommands0/networkUsedfalse/dockerUsedfalse.
- `development-recovery.mjs --self-test`: PASS13guardas, sqlCommands0/networkUsedfalse.
- `git diff --check`: PASS; aviso local de conversión LF/CRLF de workflow registrado, sin error.

## Sigue NOT VERIFIED

Ejecución real ARM64, PostgreSQL18.6 efectivo/SQL/HTTP/restore/rollback en ese runner hasta sus logs; reinicio durante reconciliación, deuda incierta cruzando copia, journal/manifest externos L3 completos y135 escenarios; recursos/custodia/aislamiento/convivencia de Oracle y aceptaciónPOS. No atribuir7pures o lectura de código a ninguno de esos resultados. La recuperación portable puede avanzar sin la SC de aceptación modular, pero no la aplica implícitamente.
