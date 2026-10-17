# CP-028 — grupo ARM portable añadido al recorrido CP027

**Preparación local; el resultado físico exige un run/SHA propios.** No se reetiquetan los dos runs CP027 como pruebas de estas negativas. Base CI `1250e7c5e2818f135fccc2be896aa6f368698c75`.

## Integridad antes de START destino

La copia existente entrega su inventario exacto a `copyIndexFromRows`. Antes de crear PostgreSQL destino se ejecutan `publishCopyIndex`, `readCopyIndex`, `verifyCopyIndex`, `publishImmutable`, `readImmutable` y `openStageJournal`, todos productivos y con su fsync Linux real. La copia PostgreSQL original permanece sin alterar.

Trece negativas finitas: cuerpo inmutable alterado/incompleto, referencias origen/destino incompatibles, FIN de pools ausente, índice con hash no confiable/incompleto/contenido incoherente/traversal, journal pendiente, observación sin end hash, head/plan inconsistentes y archivo físicamente truncado. El journal original de cuatro registros se vuelve a validar, sin pendientes, antes de autorizar START. Las variantes permanecen privadas y no se publican datos/certificados/índices completos.

El journal escribe por anticipado las operaciones nuevas de verificación de copia y readback de custodia. **No representa retrospectivamente toda la cadena SQL de recuperación.** El cuerpo inmutable es una referencia portable; `validateManifest.resource` exige identidades Oracle r03, por lo que no se inventan redes o volúmenes Oracle para conceder un positivo en GitHub. La validación integral del manifiesto Oracle continúa pendiente.

## Readiness y restricciones SQL

`runRecoverySql` observa el runtime productivo en CONFIGURED, PROMOTING y después del ACK local pero antes de activar central. En los tres casos hay cero empresas OPEN y A elegible pendiente: `serviceState.ready=false`, `guard=false`. Se prueba un CAS central obsoleto y un responsable/configuración de reloj de la generación anterior; el propietario y estado del reloj permanecen idénticos después del rechazo.

Después del reinicio API ya existente, tres escenarios usan las funciones canónicas `request_write_restriction`, `restriction_step`, `close_writer_fence` y `open_writer_fence` dentro de dos transacciones de prueba:

- TENANT: A y B legítimamente cerradas dentro de la transacción; salud técnica SQL verdadera, autoridad de negocio A denegada.
- IDENTITY: cierre/reapertura monotónicos mantienen revocación de identidad y sesión; salud técnica SQL verdadera, actor denegado.
- MEMBERSHIP: cierre/reapertura mantienen la restricción y revocación de membresía; salud técnica SQL verdadera, actor denegado.

Ambas transacciones hacen ROLLBACK positivo; fingerprints de datos centrales y fence local deben ser idénticos al estado inicial. No se borra deuda, reinicia contador o reabre un cierre confirmado: las mutaciones nuevas nunca se confirman. Las API siguen observando el estado comprometido original. Es prueba **SQL transaccional**, no HTTP all-closed, carrera revocación/reapertura, roster vacío o reinicio de worker. El navegador se invoca sólo después de restaurar positivamente ese estado sintético.

## Límites y verificación

Mismos600s/8192SQL controlador/80HTTP compartidos; ningún PostgreSQL, base, API simultánea o imagen adicional. Subgrupo transaccional: máximo200consultas/15s, con cleanup independiente. Cero HTTP nuevo de estos grupos; el navegador de Root consume el presupuesto común restante. Journal: cuatro registros y diez cargos propios, además de sus referencias privadas finitas; no se confunde ese contador con el ledger protegido Oracle.

Tres pruebas nuevas de componentes locales PASS y self-test de recuperación con13negativas PASS, sin DB/HTTP local. Syntax/diff verificados. La evidencia ARM nueva debe describir por separado filesystem real, SQL real, pérdidas de respuesta inyectadas y estados meramente modelados. El grupo no concede un criterio L3 completo ni aplica SC019/020/021.
