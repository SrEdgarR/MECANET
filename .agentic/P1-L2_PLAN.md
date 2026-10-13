# P1-L2 — plan previo CP-017

Fecha: 2026-10-13. P1 única fase activa; P0 PARCIAL/RG-001, SaaS general NOT APPROVED. A exacta DEC-061/B DEC-062, SHA256 aprobado `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71`. Base canónica `a0098178fc27467bf4c12da0e97723e0b80ce683`, rama `codex/p1-l2`.

## Entradas y secuencia

- Specification Gate: objeto íntegro/hash/12 salidas/ajuste P1-P2 aprobado; exclusiones y garantías preservadas. Fuente humana directa, no interpretación de una propuesta.
- Design Gate: revisión focal CP-016 F14-L2 y revisión separada SQL/servicio/UI de CP-017. Sin cambiar el protocolo v→v+1 cerrado→v+2, hash canónico o reservas. Root revisa interacción con emisores/logout/recovery: la API solicita restricciones durables y espera acuse; solo el proceso privado custodia credenciales de mantenimiento y cierra/reabre fences. Una falta de acuse devuelve pendiente/503, nunca éxito.
- Development Gate local: React18.3.1/Node24.21.0/pg/Express y toolchain SC-008 existentes; sin dependencia nueva. Ampliación explícita de allowlist para fuentes/pruebas UI del lote; se conserva audit completo estricto y tests afectados. El oracle de assets F sigue evidencia histórica; el nuevo artefacto se identifica por su propia fuente/digest.
- Environment Gate: **NOT VERIFIED antes del preflight**, obligatorio antes de recurso/migración/SQL remoto. Cohorte nueva exclusiva `/opt/mecanet-qa-p1l2-cp017`, proyecto igual, dos redes internas propias sin egreso, socket UNIX exclusivo y túnel loopback HTTPS. No listeners TCP remotos, DNS ni proxy global. CP013/CP014 detenidas y todos los demás consumidores se preservan.

## Cortes técnicos con propietarios

1. SQL aditivo/grants/funciones exactas y pruebas: `l2_sql`, exclusivamente migrations003 y tests SQL del lote.
2. Canonicalización, intenciones, reservas, repositorio y coordinador privado/reconciliación: `l2_service`, exclusivamente writes y repositorio inventory/tests.
3. UI privada cuadrada, pistas mínimas y manejo de incertidumbre: `l2_ui`, exclusivamente client/src/saas. Contrato HTTP §3 aprobado.
4. Root: autoridad/emisor/logout/rutas, presupuesto agregado de pools, composición QA/preflight, migración registrada, pruebas reales dos API/intercalados, restore/rollback/browser, revisión cruzada y documentación/integración.

Implementar RED→GREEN local cuando sea aplicable; fixture no reemplaza locks/grants/COMMIT real. Revisar interfaces antes de enlazarlas. Los agentes no operan SSH ni secretos. Migraciones únicamente preparador propio, no al arrancar API. No ejecutar legado/seed/setup/reset contra sus bases.

## Presupuesto propuesto previo al recurso

Reutilizar imágenes oficiales por digest ARM64 y construir frontend/fuentes fuera del VPS. Runtime fuente/artefacto inmutable, sin build de host. Principal ≤1CPU y ≤2048MiB (PG640, dosAPI320 cada una, web96, privado192; herramientas temporales128 y proceso de mantenimiento finito dentro del total). Restore nunca simultáneo con API/tools y con presupuesto total ≤1CPU/2048MiB. Conexiones agregadas máximas60 del cluster, manteniendo límite de roles; read+write comparten el presupuesto de pools, no duplicarlo. Volumen propio y copia/restore con techo sintético limitado, sin cargas globales.

Preflight medido: ARM64; destino inexistente u ownership exacto; subred/socket disponibles; RAM disponible menos presupuesto≥3072MiB; disco libre>max(15GiB,10%); CPU ocupado<80% en muestra acotada. Abortar si estos umbrales, pins, permisos/segregación/invariantes fallan o cambian otros consumidores. No bajar cuotas/garantías para aprobar. Registrar límites impuestos separados de capacidad general no demostrada. No leer secretos de recursos previos.

## Salidas e integración

L2-A1…A12 conservan salidas de la baseline. Preflight antes de nuevas conexiones/credenciales; manifest/hash de migración y datos ficticios A/B/member; negativas SQL y HTTP; carreras dosAPI; pausas antes/después SHARE y pérdidas ACK/proceso; cuotas/contadores exactos; navegador con reload; barrera/drenaje/rollback compatible y restore aislado nuevoepoch/journal. No liberar tickets/reservas por timeout o mera ausencia.

Quality Gate proporcional al diff, regresiones L1 afectadas/audits estrictos/revisión independiente. Publicar PR contra develop solo con gate remoto de despliegue accidental renovado; CI/review/fixes/merge condicionado. Nuevo SHA canónico y CI posterior separados del código probado/checkpoint. P1-L2 TERMINAL únicamente tras integración completa. Preparar siguiente lote sin aprobar A/B por extensión. Si falta una salida crítica, preservar trabajo y bloqueo concreto; no PASS inventado.

## Ensayos adicionales preregistrados tras diagnóstico real

Fuentes CP017 propias, sin ampliar el alcance aprobado. SQL003 ya registrado se conserva; correctivo004 cambia solo la variable ambigua de la función, sin reasignar permisos, borrar filas, abrir fences o reconstruir contadores. Cierre de recursos liga por separado fuente del proceso detenido y fuente del reconciliador; requiere salida real del contenedor, HTTP terminado, ausencia del dueño SQL y resultado terminal bajo cierre exclusivo. No se devuelve QH/QC/Qt.

`quota-live` limita cada cliente a24HTTP y observa bajo READ ONLY por consulta; positivos únicamenteHTTP. Preparador privado solo reduce límites con POLICY ACK y ambas versiones cerradas, deja límites reducidos y deuda intacta. Frontera conservadora32768bytes se distingue del coste C(r) exacto y del presupuesto global de metadata, aún por verificar. No subir cuotas para conseguir PASS.

`revocation-live` conserva plan durable antes de login/mutación,160HTTP/cliente y240observaciones,45s. SHARE/logouts y transición local OPEN/central CLOSED; membership/identity sobre fixture ya existente, TENANT B al final; capture/verify separados para ROTATION/EPOCH. El drenaje dispone de handshake privado con el controlador, ligado a CID/owner/SHA/operación, señal SIGTERM exclusiva y finSQL/HTTP; no Docker socket en aplicación ni propietario adoptado por TTL.

`recovery` será ensayado después del cierre de las escrituras y la conciliación de todas las deudas en su generación original. Host verifica los dos procesos y SQL terminado; el adaptador conserva resultados/intenciones/reservas/movimientos/balances/auditoría/roles/funciones/directorio y contadores. Copia física del cluster completo con PostgreSQL detenido y manifest de cada archivo; techo2GiB para esta cohorte, umbrales originales de RAM/disco/CPU. Ningún tablespace/symlink o señal de réplica admitidos. Después de la copia se persiste un canario restrictivo de identidad en journal independiente de PGDATA con fsync y se aplica bajo el cierre existente; no se reabre la fuente para crear el canario.

Destino eventual nuevo exclusivamente `mecanet-qa-p1l2-cp017-restore`, bind `/opt/mecanet-qa-p1l2-cp017/restore/data`, red interna10.77.53.0/24 sujeta a comprobación de conflicto inmediata, PG.35CPU/640MiB+harness.25CPU/128MiB. Fuente detenida, sin API/worker ni TCP público ni egreso. Se revalida backup/hash/cierre/provenance; réplica inicial debe coincidir por fingerprints, journal posterior se reaplica idempotentemente y conserva tombstones. Candidatos de nueva generación/epoch y todas las credenciales se custodian antes de SQL; se mantiene todo histórico inmutable y deuda/contadores. El destino queda CLOSED. La reapertura del escritor restaurado requiere verificación separada, no se afirma automáticamente por copiarlo. Preservar backup/journal/datos y detener recursos propios al terminar, sin tocar otros consumidores. Esta copia QA del mismo host no acredita custodia externa, RPO/RTO comercial ni recuperación productiva.

Método de copia contrastado con PostgreSQL18: [copia física completa y apagado previo](https://www.postgresql.org/docs/18/backup-file.html). Credenciales candidatas nuevas se convierten a verificadores SCRAM antes de ALTER ROLE para evitar SQL con contraseñas claras; [ALTER ROLE](https://www.postgresql.org/docs/18/sql-alterrole.html). Las fuentes oficiales respaldan el mecanismo, no otorgan PASS al ensayo.
