# Revisión independiente del siguiente lote — CP-015

**LOCAL / revisión documental, 2026-10-13.** Revisor: subagente `/root/cp015_integrate_review`, diferente del autor `/root/cp015_next_lot`. Objeto final: [P1-L2 v0.1-CP015](NEXT_LOT_CANDIDATE.md), candidato **SUGGESTED / NOT APPROVED** basado en CP-014 `9fcdd9540848edbbdef1cfc94667491c9ab2ba92`. SHA-256 del documento revisado: `3cd5368860ad001a602d56cb8aee526053c38394f90eecac398542167016901c`. No es aprobación humana, review GitHub ni prueba funcional.

## Alcance y veredicto final

Lectura focal del roadmap, baseline protegida L1, metodología §8.3/8.5 y candidato completo: autorización, idempotencia, resultado incierto, bloqueo/contabilidad central–tenant, cuotas, migración/reversión, recuperación y reserva NCF/e-CF. No se ejecutaron writers, migraciones, PostgreSQL, pruebas físicas ni recursos remotos. El candidato permanece en la rama fuente de planificación y fuera del PR funcional P1-L1.

**PASS documental acotado:** los tres hallazgos REQUIRED de la primera revisión quedaron resueltos en el diseño. No quedan hallazgos REQUIRED abiertos en esta revisión focal. El candidato conserva doce salidas **NOT VERIFIED**, no dispone de A/B y no abre implementación o P2. Este veredicto no sustituye la aprobación de la baseline exacta ni el Design Gate antes de código.

## Historial de hallazgos y resolución

La primera revisión fue REQUEST CHANGES; se conserva la causa de cada hallazgo, sin borrar su historial.

| ID | Prioridad / estado final | Hallazgo inicial y resolución comprobada | Resolve-before / comprobación posterior |
|---|---|---|---|
| L2-R1 | REQUIRED / RESOLVED documental | La respuesta podía perder el operationId necesario para consultar. §3 fija operationId=Idempotency-Key UUID conocido antes del POST, pista opaca acotada sin credenciales o contenido y recuperación propia PENDING/UNKNOWN tras recarga. 404 no prueba ausencia de envío tardío; no hay reenvío automático ni clave nueva para retry. GET exige actor/acción/ámbito autorizados. | A exacta HTTP/UI; L2-A7/A9 y negativas de identidad/epoch L2-A4 después de B y entorno |
| L2-R2 | REQUIRED / RESOLVED documental | Una intención vieja podía sobrevivir al cierre/reapertura. §§4–5 vinculan versión inmutable a la intención, serialización central común, fence local SHARE hasta COMMIT y cierre exclusivo v+1; reapertura sincronizada v+2 no cambia la intención vieja. El cierre exclusivo y no-ejecutabilidad acreditan cierre de efectos, separado del fin de recursos: reservas/tickets/préstamos siguen retenidos hasta prueba positiva L1. Se exigen intercalados antes y después de SHARE, otro miembro vigente, reinicio y réplica tardía. | Design Gate writer/revocación, impacto de todos los handlers restrictivos y A; L2-A5/A7/A8 no heredan PASS lector |
| L2-R3 | REQUIRED / RESOLVED documental | Las reservas 32KiB/16KiB dependían de derivación aplazada. §6.1 fija logical-v1, formas de filas/longitudes, quota de tamaño constante, cinco filas por operación, máximos de transiciones y espacio restrictivo separado. 21760<32768 y 16128<16384 son cotas de diseño, no consumo físico. Delta/efecto/auditoría/cuota comparten transacción empresarial; incertidumbre conserva reserva y no devuelve QH/QC/Qt. | A de crecimiento/cupo; funciones y mediciones L2-A7/A8/A10 posteriores, incluida presión y último cupo |

## Partes coherentes, sin aprobación por extensión

- P1-L2 es un ajuste propuesto de delimitación P1/P2; RG-001 y DEC-058 cubren solo L1. La alternativa de conservar el roadmap sitúa el trabajo como preparación P2-L1 tras su gate, sin iniciar esa fase ahora.
- La escritura ocurre solo en una cohorte ficticia futura. Roles y pools separados preservan el lector; el presupuesto agregado requiere preflight, no duplicación automática de capacidad.
- Resultado idempotente, efecto, balance, movimiento y auditoría comparten transacción empresarial; central y tenant no se presentan como transacción distribuida. Un timeout no libera deuda ni prueba que SQL terminó.
- Las restricciones se integran con todos los caminos relevantes, incluido logout y restauración. El cambio material de mecanismo L1 se reconoce y no reutiliza PASS lector como PASS escritor.
- Expansión aditiva, registro por DB, backfill ficticio cero, rollback solo compatible y restore del delta quedan separados de migración real/recuperación externa.
- NCF/e-CF y ventas conservan su alcance futuro. No hay emisiones, numeración ni fiscalidad implementada; Q-18 precede al primer código dependiente.
- La UI es privada y cuadrada; API y SQL hacen efectivos límites y estados de autoridad/incertidumbre. El máximo de lista incluye sobre/cursor y devuelve un prefijo sin truncar campos ni saltar filas.

## Evidencia y límites

Fuente: documento candidato con hash anterior, roadmap vigente, DEC-058/S-18/L-01 y método §8.3/8.5. La derivación de §6.1 se cotejó por aritmética local de JSON y longitudes: resultado terminal máximo294bytes; cotas de fila empresarial1507/120/1379/736/383/131, central973/756/325/376, y sumas21760/16128. El padding técnico pertenece únicamente a la representación lógica. Es cálculo de diseño, no un ensayo SQL, medida PostgreSQL o PASS funcional.

Ninguna lectura documental acredita locks, SQL/grants, stock concurrente, dos API, ARM64, recursos disponibles o recuperación. Estas salidas requieren baseline A exacta, autorización B, entorno y preflight acreditados, y su Quality/Integration Gate correspondiente. La decisión de ajustar P1/P2 y el nuevo mecanismo writer requieren revisión/aprobación; no se reabren condiciones comerciales.

No se cambió el candidato, código, infraestructura, secretos o Prompt Maestro desde esta revisión. Se notificaron los hallazgos al autor y se revisaron sus correcciones. No se crea un AUD por huecos del candidato; este informe registra la revisión exigida por la metodología.

## Continuación focal CP-016 — preparación del autor, no revisión independiente

**LOCAL / documental y cálculo puro, 2026-10-13.** Autor de la revisión focal: `/root/cp016_next_lot`; aprobación A y autorización B siguen pendientes. El informe CP-015 anterior se conserva como historial del documento v0.1 y su hash; no se atribuye su PASS a bytes nuevos. El candidato único ahora es [P1-L2 v0.2-CP016](NEXT_LOT_CANDIDATE.md). No se abre P2, se programa un writer o se despierta QA.

Revisión focal de los doce criterios, permisos/pools, central–tenant, fence monotónico, idempotencia, cuota, migración, rollback y restore. No se repitió inventario o descubrimiento general ni la revisión íntegra de CP-015: R1–R3 permanecen resueltos en el diseño conservado. Se encontraron solamente estas carencias adicionales:

| ID | Prioridad / estado de preparación | Carencia y corrección del candidato | Resolve-before / negativa posterior |
|---|---|---|---|
| L2-R4 | REQUIRED / RESOLVED por autor, pendiente review independiente | `requestHash` carecía de representación de bytes/versionado y vínculo explícito al productId de ruta. §3.1 fija matriz ordenada, strings/null, JSON.stringify sin espacio/replacer y SHA-256 UTF8; producto/autor/acción/empresa/epoch forman la guarda. SQL deriva el efecto de la misma preimagen y verifica el digest, sin argumento divergente o cuerpo central persistido. | A exacta de §3.1, L2-A6/A7; después de B probar dos API/SQL, ruta distinta con mismo cuerpo/clave y cero efecto extra |
| L2-R5 | REQUIRED / RESOLVED por autor, pendiente review independiente | “Unicode válido” incluía U+0000, incompatible con PostgreSQL text/jsonb. §3.1 lo rechaza400 antes de intención/reserva empresarial, sin reemplazar; añade preflight UTF8. La cota de6bytes permanece válida para controles restantes y no cambia las reservas. | A validación/texto; después de B negativas API/SQL de U+0000/sustituto aislado y verificación encoding, sin heredarlas de un cálculo |

**Plan y límites de verificación:** usar solo Node24.21.0 Windowsx64 ya acreditado para evaluar constantes sintéticas y leer el candidato; sin `.env`, red experimental, SQL, servicio, dependencias nuevas, archivos ejecutables de producto, intenciones o recursos QA. Comprobar por cálculo el formato propuesto, igualdad/diferencia de bytes/hash y sumas lógicas; comprobar referencias locales/tablas/doce criterios. No demostrar funcionalidad futura con una función de ejemplo. El proceso termina al emitir resultados; no quedan servicios ni recursos experimentales que limpiar.

**Verificación LOCAL_CALCULATION_ONLY:15 comprobaciones PASS**, Node24.21.0, win32/x64; candidato SHA-256 `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71`. Vector de alta `mecanet-write-v1`, tenant `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, actor `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, acción `catalog.create`, epoch `1`, producto null y values `ABC-1`/`Café`:142bytes UTF8, SHA-256 `d2e92c64f9ba7e2f55b29389879e86e99caeb2d62ac5afebeb0269b93c3f4b5b`. Esto es un vector público sintético del formato, no hash de datos de una empresa o prueba de la función futura.

La ejecución local comprueba equivalencia de orden/espacios JSON, SKU normalizado y UUIDs canonizados; diferencias de producto/actor/acción/tenant/epoch/cantidad/motivo; Unicode compuesto/descompuesto distinto, escapes/suplementarios válidos y rechazo definido de U+0000/sustitutos; enteros como string, ausencia de BOM/salto final y sumas21760<32768/16128<16384. Criterios L2-A1…12 únicos y todos NOT VERIFIED; referencias locales presentes y tablas rectangulares. Detalle y hash exacto se entregan al coordinador para evidencia del checkpoint; no se genera otro experimento ni especificación equivalente.

**Pendientes:** revisión independiente de v0.2 antes de fijar la baseline; A exacta incluido ajuste acotado P1/P2, autorización B diferenciada, base canónica tras Integration Gate L1 y Development/Environment/Design Gates del alcance antes de código/recursos. El preflight y salidas SQL/dos API/revocación/durabilidad/cuotas/restore/UI siguen NOT VERIFIED. Sin cambio del Prompt, infraestructura o decisiones comerciales; no AUD por defectos del candidato.

## Resultado independiente vigente CP-016

**PASS documental acotado; cero REQUIRED abiertos para el candidato L2.** Revisor: `/root/cp016_integration_review`, distinto del autor. Esta sección incorpora su resultado real de `docs/evidence/cp016/independent-review.json`; las menciones de review pendiente de la preparación anterior son historial, no el estado actual. Objeto exacto: P1-L2 v0.2-CP016, SHA-256 `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71`. El candidato no cambió después de ese cierre.

El revisor comprobó §3.1/L2-A6/A7 y la preservación del protocolo/fence/cuotas/migración/restore ya revisados en CP-015. **L2-R4 y L2-R5 RESOLVED en diseño**: producto de ruta y bytes/hash canónicos vinculados, texto compatible UTF8, digest empresarial sobre la misma matriz sin argumentos divergentes. Confirmó doce criterios únicos y recomputó independientemente el vector público de142bytes/hash `d2e92c64f9ba7e2f55b29389879e86e99caeb2d62ac5afebeb0269b93c3f4b5b` en Node24.21.0 win32/x64; contrastó U+0000 y SHA-256 builtin con PostgreSQL18 oficial.

El PASS cubre documento, aritmética/bytes y fuentes; **no es PASS de código o SQL**, aprobación humana, permiso de implementación o cambio de fase. Los doce criterios funcionales siguen NOT VERIFIED, A y B pendientes; base canónica y gates del nuevo alcance deben acreditarse antes de desarrollar o crear recursos. No se reabren R1–R3, condiciones comerciales o decisiones PostgreSQL/Compose/UI/NCF-eCF, ni se extiende evidencia L1 a writers.
