# CP-018 — preparación POS independiente

Revisión LOCAL de planificación, 2026-10-13. Alcance autorizado por root: apéndice CP-018 de [.agentic/SAAS_DISCOVERY](../../../.agentic/SAAS_DISCOVERY.md#cp-018--preparación-relacional-del-primer-corte-pos) y este informe; sin código, Git, SSH, secretos, DB, navegador ni infraestructura. No existe `.agentic/POS_SAAS_PLAN.md`; se localizó el contrato real CC-A…F y se amplió en el mismo artefacto, con ownership exclusivo confirmado antes de editar. Se aplicó `agent-skills:documentation-and-adrs`; Prompt Maestro §§1.1…1.5,2,8,9,16,17,26,27 rigen clasificación, gates y entrega.

## ESTADO

P1 única activa, P0 PARCIAL/RG-001; P1-L1/L2 TERMINAL por sus fuentes CP-017. P2 NO INICIADA. La preparación P2-VENTA-01 es SUGGESTED / DESIGN-CANDIDATE / NOT APPROVED; A/B no recibidas. SaaS general NOT APPROVED. P1-L3 sigue candidato separado de reapertura, sin A/B/implementación; este trabajo no lo cambia.

## OBJETIVO REALIZADO

Se preparó un solo corte sintético: apertura por titular asignado → venta por líneas/stock transaccional/movimiento de turno → freeze y cierre inmutable por encargado/suplente → consulta del resultado. No se necesita primero construir módulos administrativos de caja/precio. Se concretaron autoridad/versionado de cotización, importes por línea, stock agregado sólo por cantidades, lock order, UUID/UNKNOWN y frontera SQL de turno.

Se mantuvo la protección de las futuras devoluciones: `saleLineId`,100/200 del mismo SKU sin promedio,333/668 sin reasignar reservas ajenas, referencias y correcciones posteriores que no alteran cierres. Se separó venta de documento fiscal; NCF/e-CF siguen CONFIRMED en el producto y Q-18 limita el primer código fiscal, sin impuesto/escala/redondeo legales inventados.

No se cerró la entrada de P2, Design Gate POS, una baseline exacta, A/B ni pruebas funcionales. La guardia durable por turno frente a dinero/intención inciertos requiere precisar su vínculo central↔tenant/fin/locks antes de A/código; un lock de turno únicamente al confirmar no se presenta como solución completa de esa carrera.

## CAMBIOS

Se añadió exclusivamente el apéndice POS-18-A…F al borrador existente y siete criterios futuros POS-18-V1…V7. No se añadió una segunda especificación, DEC, SPEC CHANGE aprobado o SPEC ERRATA de requisito. No se editaron CC-A…F, las baselines protegidas, el Prompt Maestro, candidato P1-L3, cánones o mapa.

## EVIDENCIA Y PROCEDENCIA

| Fuente local leída | SHA-256 capturado | Alcance |
|---|---|---|
| SAAS_DISCOVERY antes del apéndice | `e667e945cbec2018c9d05d7e4510ababde3e9c6460be879549b5cb1c3d1b823f` | CC-A…F y reglas de caja/cambios;136032 bytes iniciales permanecen idénticos. |
| SAAS_DISCOVERY con el apéndice | `78abf556aa9824491efac57ac89d1d63d4dd686d2a6addb9279dcee2e4600cc3` | Diseño preparatorio nuevo; no producto probado. |
| [DECISIONS](../../DECISIONS.md) | `4562901ebc3e98c3ff1386f1d00bdf07e0c1bd904ad3bc11f0f209be514b4c27` | DEC-029/038/046/055/056 aprobadas; no redondeo/fiscalidad aprobados por extensión. |
| [Candidato general](../../../.agentic/SPECIFICATION_CANDIDATE.md) | `37feb91a7f4cf6f43a7a0b4d5aa9c4ac41a079ea0ee28bef65c74d9b68cb10f0` | S-05/06 y mecanismos anteriores, no baseline POS. |
| [Baseline L2](../../specs/p1-l2-approved/baseline.md) | `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71` | Sin precio/venta/caja/fiscalidad; fundamento escritor aprobado, separado del POS. |
| [validation.js](../../../server/saas/writes/validation.js) | `84f6138f357a2e58bb7ddd537dba38c1ec635775ae4a9d927c92a99b48e2bf13` | Sólo dos acciones del writer L2; representación canónica exacta, no POST POS actual. |
| [Matriz CP-017](../cp017/matrix.md) | `930d208a8f64f8a344251fb271bc2df89595204b8a29823d29184b000a423d0d` | Doce PASS limitados e Integration Gate; no nueva ejecución/reapertura/POS. |
| [Auditoría CP-017](../../audit/CP-017.md) | `7e09801068a336a35b7ba03db2c3a4dd90f845a1d2724fd92fddbc8c8c35efab` | Cierre real/historia/provenance, reutilizados sin reensayo. |
| [Prompt Maestro](../../methodology/Prompt_Maestro_v2.0.md) | `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d` | Sin cambios; planificación distinta de aprobación/implementación. |

Lectura y comprobación documental Windows/PowerShell, sin importación de código ni servicios. La preservación del prefijo se comprobó por SHA de los primeros136032 bytes, no sólo por semejanza del texto. Caracterizaciones CP-006 conservadas: ejemplos útiles, no prueba PostgreSQL/caja/fiscalidad nueva. Ningún resultado histórico se atribuye al apéndice.

## GIT / TRAZABILIDAD

Rama/base REPORTED por root: `codex/p1-l3-design`, `86985fe7589032f202ebf0cb057a9b1384217151`; worktree `C:/Users/thede/.codex/worktrees/p1l1-integration/MECANET-develop`. Sin Git ejecutado por este autor y sin HEAD/commit del apéndice inventado. Código histórico probado8199/QA2b0/develop7ff conservan fuentes CP-017; no nuevo tested_code_sha, CI o checkpoint por esta preparación. Hash de este informe/cierre documental se informa externamente para evitar autorreferencia.

## MATRIZ

| Criterio de preparación | Estado | Evidencia/límite |
|---|---|---|
| Localizar y ampliar el artefacto POS real | PASS | `rg --files`/búsqueda de CC, ownership root; no POS_SAAS_PLAN paralelo. |
| Preservar historia/decisiones/bytes y límites L2 | PASS | Prefijo136032 bytes/hash e667… intacto; baselines/Prompt y clasificación revisados. |
| Concretar un recorrido sintético y pendientes por gate | PASS | POS-18-A…F, siete criterios futuros; no cierre de Design Gate/entrada P2. |
| Producto/transacciones/dos API/monetaria/fiscalidad/UI/restore POS | NOT VERIFIED | Ninguna ejecución; POS-18-V1…V7 continúan NOT VERIFIED. |
| Baseline P2/A/B, reapertura y producción | NOT VERIFIED | No autorizaciones nuevas ni recursos. |

## PRIVACIDAD / SEGURIDAD

Precios/actor/tenant/turno no confiados al navegador; permisos por acción y ámbito, sin operadores POS por rol. Payload monetario/caja no se propone en la central, logs o sessionStorage. La continuación por suplente exige diseño específico/auditable, sin acceso global a otro actor. Guardias de incertidumbre, mínimos privilegios y protocolo de cierre permanecen requisitos del Design Gate, sin aceptación de riesgo ni mecanismos criptográficos nuevos.

## INFRAESTRUCTURA

Recursos creados/modificados: ninguno. CP-017 queda STOPPED/KEEP con consumidores preservados, según su evidencia; no se verificó remotamente de nuevo. No cleanup operacional nuevo, puertos, copias, secretos, fiscalidad, pagos, DNS, proxy, Coolify, Nexora o Mecanet-EAK afectados.

## UI

Flujo textual SUGGESTED; empresa/turno, líneas, revisión, errores y UNKNOWN explícitos. Cuadrados, teclado/foco/responsive/text200/reduced motion siguen criterios de la salida futura. Sin UI/captura/navegador nuevos y sin PASS visual por texto.

## MAPA DE PROGRESO

No modificado por este subagente; root incorpora el hito documental desde los cánones. La propuesta no abre P2 ni convierte preparación comercial/fiscal en fase activa.

## PENDIENTES

Q-02/Q-33: entrada/orden P2 y diseño/baseline relacional/guardia antes de A; después B diferenciada y Development/Environment antes de código/recurso. Q-18 y condiciones monetarias: fuente de precio/moneda/escala/regla exacta antes del cálculo dependiente; fiscalidad antes de su primer código P2/P3, sin postergarla a lanzamiento. Q-31: UI Design Gate antes del recorrido. Q-11/Q-32: tooling/fixture/roles/pins antes del recurso. Q-35/Q-34/Q-08: pruebas del corte/recuperación/reapertura y recursos/custodia antes de depender de cada garantía. Son FUTURE respecto de P1 actual; bloqueo localizado del futuro trabajo dependiente, no reapertura de L2.

## METODOLOGÍA — HALLAZGOS

Ningún nuevo defecto de metodología confirmado. La coexistencia de mecanismos Mongo históricos y PostgreSQL objetivo se trató con evidencia y apéndice clasificado, sin alterar Prompt ni reescribir la historia. La carencia de guardia/monetaria/fiscalidad es un pendiente de diseño/producto, no AUD inventado.
