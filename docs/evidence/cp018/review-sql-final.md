# CP-018 — revisión focal independiente del protocolo SQL final

**REVIEW PASS focal del diseño final: 0 críticos/0 REQUIRED abiertos.** Revisor `l2_sql`; autor del candidato `root`. Observación inicial2026-10-13T23:59:27Z y reevaluación final2026-10-14T00:00:50Z UTC, sesión del proyecto2026-10-13. Este peer aporta revisión al Design Gate; no declara su cierre global, A/B o salida funcional. Sólo se creó/actualizó este reporte; no Git, SSH, PostgreSQL, secretos, producto, infraestructura o cambios del candidato.

## Objeto y provenance

- [.agentic/P1-L3_CANDIDATE.md](../../../.agentic/P1-L3_CANDIDATE.md) final v0.2-CP018, SHA-256 `4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec`,44202bytes,243líneas con contenido/244 según split del salto final. Corte congelado comunicado por root y hash comprobado LOCAL. Lectura completa inicial y reevaluación focal de todos los cambios de la corrección.
- Corte inicial completo revisado: `a7dfe9dbe530f9e3d506b1a892869d1bcc792749cd180008dcb1bbf7754eec76`,43327bytes/241líneas. Sus dos hallazgos se conservan abajo; aquel corte no tenía PASS de esta revisión.
- Base `86985fe7589032f202ebf0cb057a9b1384217151`, comunicada por root y expediente; no consulta Git del revisor.
- [Diseño SQL previo](sql-recovery-design.md), SHA-256 `26a3db9f6acf02b28af4d5c2347e2746444bca1dfd892b0c94a51d2d9ef2918f`: aportación previa del revisor. Este peer evalúa el candidato integrado de root y registra sus diferencias, no convierte la propuesta propia en evidencia física independiente.
- [Peer del modelo](review-model.md) distingue13checks/40estados/230aristas/4mutantes LOCAL de PG/I/O; el revisor SQL leyó su resultado/límites, sin repetir ni atribuirse aquella ejecución.
- Baseline protegida L2 y Prompt conservan sus hashes `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71` y `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d`. El diseño L3 no hereda su autorización ni cambia esos archivos.

## REQUIRED iniciales y resolución

| ID | Ubicación del corte leído | Problema y efecto | Corrección necesaria antes de declarar revisión sin REQUIRED |
|---|---|---|---|
| SQL-FINAL-01 | Corte inicial:58/90, fila inventory.recovery_guard y firma configure_recovery | La fila local necesita eligibility/closedReason y vínculo de recurso/plan central después del journal. La firma sólo recibía guardHash y guardas gen/epoch/closed: un hash no contiene esos valores ni SQL local puede consultar otra DB | **RESOLVED DOCUMENTAL**, final:60/92. Fila y firma incorporan eligibility/closedReason/sourceResourceHash/targetResourceHash explícitos, tipos acotados y binding privado exacto. No hace falta derivar datos de un hash o añadir consulta cruzada entre DB |
| SQL-FINAL-02 | Corte inicial:73/75, consumo RESTORE y predicado histórico | Conservación de active y consumo RESTORE no elegían una materialización única; SQL/JS podían omitir de forma distinta una RESTORE antigua activa | **RESOLVED DOCUMENTAL**, final:28/75/77. Única excepción active=false sólo RESTORE mapped/ACK/run/tenant y guardas exactos dentro de activation COMMIT; generación/guardas históricas intactas, sin tabla alternativa de consumo. Fixture RESTORE individual A; B TENANT no incluida. Restricción global con ineligibles aborta, nunca se consume parcialmente. Subject/TENANT siguen activos y el predicado central/JS/worker es único |

Fueron carencias acotadas de especificación implementable, no hallazgos de ejecución L2 ni nuevas decisiones comerciales. Root las corrigió en el candidato único; el revisor comprobó esos bytes y la elección completa, sin cambiar la fuente. Estado actual:0 REQUIRED. La resolución documental no demuestra las funciones SQL futuras.

## Propiedades revisadas sin otra brecha obligatoria observada

| Eje / propiedad | Evaluación documental y límite |
|---|---|
| Corrección: cierre y promoción | Central CLOSED/c→CLOSED/p antes de local OPEN/p; central sigue CLOSED hasta SEALED. Activación central única abre elegibles, pone directorio active, concluye run y retira la barrera. B y el inventario total A/B permanecen presentes y cerrados legítimamente |
| Corrección: ACK/COMMIT incierto | Before/after exactos y otro estado separado; fin positivo antes de retry, material estable, sin reacquire ni incremento por perder ACK. COMPLETE aplicado sin ACK no se describe como CLOSED. El modelo abstracto también separa esos casos, sin acreditar COMMIT real |
| Seguridad: recursos/autoridad | Binding de recurso incluye CID/volumen/ruta/cohorte, no sólo sysID clonable. Source no admite negocio simultáneo; old SID revocados, old claves/credenciales rechazados y actor/acción actuales requeridos para GET histórico. Resultado conserva epoch original; otra clave/época no adopta intención antigua |
| Seguridad: restricciones | Identidad/grant/membership/TENANT/LOGOUT efectivos entre generaciones; sólo RESTORE propio elegible consumible mediante active=false confirmado. Una restricción global que cubra B no se consume parcialmente. Open/resume genéricos deben rechazar bypass durante recovery, con negativo directo previsto |
| Concurrencia y locks | Orden local writer_fence antes recovery_guard, coherente con escritores L2; central AdmissionFence antes filas en orden. No mantener lock central al esperar SQL de otra DB; no atribuir atomicidad multibase |
| Reloj y reinicio | Seed/worker owner custodiados; ACK perdido del mismo proceso→reconcile. Reinicio real→transferId/nextOwner nuevos elegidos una vez tras fin anterior; retry de esa transferencia reutiliza su material. Tick no se reinicia y owner no se obtiene por antigüedad |
| Aborto y bigint | p=c+1, aborto c+2 y precondición c≤MAX_BIGINT−2; compensación monotónica y global barrier, sin bajar versiones ni replanear sobre una restricción ajena. Fin de efectos y de recursos siguen separados |
| Contabilidad/performance | Singleton técnico preasignado/contabilizado006 en fuente nueva; actualizaciones después de backup no reinician QL. Run/filas bajo2MiB, mismos16MiB y margen terminal4096; costes/tamaño/sumC/último byte/overflow se exigen en PG futuro. Presupuestos finitos y perfiles excluyentes sin inferir capacidad comercial |
| Mantenibilidad e interfaces | Tabla y stages globales/locales, rol privado/NOLOGIN/search_path/PUBLIC, schema3 explícito y rechazo seguro de artefacto antiguo. Contratos por hash/version sin default aleatorio; firma local completa con valores tipados y binding del recurso |
| Tests/evidencia | Seis criterios contienen esperado, negativos, entorno, dependencies, reversión y gate. Modelo puro y review no cierran locks/fsync/credenciales/SQL/HTTP/browser. Pasos repetidos y fallos antes/después COMMIT están preregistrables; no cuota ampliada para PASS |
| Documentación/gates | SC010/DEC065-066 PROPOSED; A exacta/B separadas pendientes; Design/F14 antes de A, Development/Environment antes de código/recurso. P1 única activa/P0 PARCIAL/general NOT APPROVED; CP017 STOPPED/KEEP y P2 informativo, sin aprobación transitiva |

## Límites y paso habilitado

Las seis salidas funcionales L3 siguen **NOT VERIFIED**. No se ejecutaron funciones006, PostgreSQL, dos API, copias, role rotation, reloj, filesystem Linux, carga ni recovery. Una especificación puede ser suficiente para implementar sin demostrar su funcionamiento; las dos correcciones de interfaz/consumo están cerradas en el objeto final.

El cambio adicional final separa índice físico de copia≤4MiB/10000archivos del manifiesto superior≤256KiB; ambas cotas se verifican y el hash del índice se liga al manifiesto. Se revisó esa precisión sin inferir que cualquier copia cumple las cotas. No degrada integridad, presupuesto o límites de la copia.

No otros REQUIRED ni hallazgos no obligatorios necesarios en este alcance. Trabajo independiente habilitado: root une este peer al otro peer, al modelo limitado y a F14 para valorar el cierre documental de Design Gate; después A exacta del candidato y B/Development/Environment antes del primer código/recurso. No se pide otra decisión comercial ni se aprueba implementación. El revisor sólo es propietario de este informe; no reescribe el corte inicial, modelos o fuentes históricas.
