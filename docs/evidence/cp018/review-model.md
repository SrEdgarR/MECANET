# CP-018 — revisión independiente del modelo abstracto

**REVIEW PASS, alcance local abstracto únicamente.** Revisor `l2_service`; autor del modelo y su corrección: coordinador `root`. Sin edición del modelo/resultados, Git, SSH, secretos, producto, DB, HTTP, Docker o recursos. Este informe es el único archivo nuevo de la tarea. Base informada y registrada por el modelo: `86985fe7589032f202ebf0cb057a9b1384217151`; no comprobación Git nueva por el revisor.

## Objeto y provenance

| Objeto | SHA-256 / procedencia |
|---|---|
| [Modelo final](../../../.agentic/experiments/cp018/model.mjs) |`a22befb8e11be7182128699885b2af595c6cd6df7e975993c331caa9caeaeda0`|
| [Resultados de root](../../../.agentic/experiments/cp018/results.json) |`49746141fe4d010447592ed888955b23969af9864a6b08315308f7827c5adcc7`;2026-10-13T23:51:52.563Z;Node24.21.0/Windows x64;13checks/40estados/230aristas/4mutantes;7ms informado |
| [Plan previo](../../../.agentic/experiments/cp018/plan.md) |LOCAL, preparación de diseño, límites20.000estados/100.000aristas/30s; no producto/infra |
| Modelo anterior revisado |`79291a5d844e8a10cc42adf302374adab171d503759e383b66e6380ac5dc2131`;12checks/28estados/158aristas/4mutantes |
| Resultados anteriores leídos |`921510d3edf10c238983ff7ff16ea6a752453d78d36c0c97bff468ca874d0bf3`;2026-10-13T23:40:13.067Z. Identifican la observación previa, no un PASS de la corrección |

Los hashes son archivos locales, no stdout remoto ni código probado de PostgreSQL ARM64. La corrección anterior no se oculta ni se convierte retroactivamente en PASS causal.

## REQUIRED detectado y corrección

**MODEL-01 — negativas de prerrequisitos no causales: RESOLVED LOCAL.** En el modelo anterior `uncertainty-process-dependency-negatives` tomaba `initial()`, donde A era ELIGIBLE/CLOSED, y sólo marcaba acked/complete. `ready` ya era false antes de quitar origen/manifiesto/journal/reloj/proceso o introducir UNKNOWN. Se reprodujeron en memoria los seis pares **false→false**; no acreditaban sus guards. El hallazgo se comunicó a root antes de la corrección y no se editó el modelo por este revisor.

La fuente final incorpora `promoted()`, ejecuta el camino de promoción completo y **afirma ready=true dentro de ese helper** antes de cada patch individual. Las cinco eliminaciones y UNKNOWN son entonces **true→false**. La causa ajena A CLOSED desaparece. No se quitaron assertions ni se sustituyeron por campos manuales que eludan la transición positiva.

Otra corrección de representación: `central` prepara la etapa3 pero conserva central CLOSED; la transición `complete` abre central A y registra complete en el mismo paso abstracto. Así corresponde al COMMIT final propuesto de activación. El caso nuevo distingue `complete:lostApplied` (central OPEN/complete durable, acuse incierto) de `complete:lostNotApplied` (central CLOSED/no complete); ambos niegan admisión hasta observación exacta. Repetir el estado confirmado es estable. No se afirma que un fence que ya quedó OPEN siga CLOSED después del crash.

## Reevaluaciones independientes sin sobrescribir resultados

1. **Programa final normal evaluado en memoria: PASS.** Se leyeron los bytes finales, se eliminaron únicamente las declaraciones de import al disponer de sus bindings estándar, y se sustituyó `import.meta.url` por la URL exacta del archivo. Las funciones, checks, exploración y mutantes permanecieron iguales. `writeFileSync` se interceptó en memoria: sólo aceptó la ruta conocida results.json y capturó su JSON, sin escribirlo. La reevaluación produjo13checks/40estados/230aristas/4mutantes y8ms; el SHA de modelo y casos/estados concordaron con el reporte de root. El resultado físico guardado permaneció byte exacto.
2. **Variante insegura final ejecutada como proceso local: negativa PASS.** `node .agentic/experiments/cp018/model.mjs --unsafe-closure` terminó con **exit1/ERR_ASSERTION** en `eligible-unpromoted-is-not-a-legitimate-closure`, donde obtuvo true en vez de false. Falló antes del bloque que escribe results.json. Se revalidaron hashes de modelo/resultados después; no se sobreescribieron ni se atribuyó esa salida1 a un fallo del producto.

## Propiedades, límites y sensibilidad revisados

| Propiedad abstracta | Lectura/resultado y límite |
|---|---|
| Ready con cero empresas / todas cerradas legítimamente / A OPEN+B CLOSED |Checks positivos distintos. A elegible sin promocionar se rechaza; el flag unsafe demuestra sensibilidad de esa distinción |
| Prerrequisitos y UNKNOWN |Seis patches causales desde `promoted()`; niegan ready. Modelo asume que los flags de proof reflejan verificaciones reales, no lo demuestra |
| Autoridad |Contexto/session freshness, propósito company, permiso, generation, epoch y versión incompatible niegan admisión. Es un actor abstracto, sin cookie/issuer/SQL |
| Ventana local OPEN/central CLOSED |Niega admisión antes de complete, incluidos ACK perdido y su observación; no convierte apertura local en autorización global |
| Versiones/retentativas |BigInt/monotonía en exploración, overflowMAX rechazado, ninguna adopción de versión7 después de restricción frente a target6. El modelo fija esa pequeña secuencia, no todos los enteros/protocolos SQL |
| Material y owner |Iguales a través de retentativas y aristas; observación comprueba referencias exactas. No demuestra creación exclusiva, fsync, no-clobber, crash filesystem o custodia fuera del cluster |
| Restricciones |B siempre restringida; A nueva restricción cierra ambos fences y no permite continuar el CAS anterior. Ese cierre se modela atómico y no demuestra lock/drain/SQL real |
| Propiedad de exploración |El oracle no llama `ready` para decidir sus assertions: si hay admisión, exige origen ended, sin UNKNOWN, complete, proceso, A no restringida/ACK/version6/ambosOPEN; toda arista mantiene material/owner, versiones monotónicas y deniega actor viejo y B |
| Cotas |Checks explícitos durante la exploración:≤20.000estados/≤100.000aristas/<30s; final40/230 y medición8ms en reevaluación. No se subieron cotas ni se usa30s como prueba de fin/TTL. El modelo no implementa watchdog de I/O ni capacidad del VPS |
| Cuatro variantes |Contraejemplos explícitos para exigir un OPEN, ignorar barrier/pareja central-local, adoptar versión actual y revivir sesión antigua. Son predicados deliberados de modelo; no cuatro mutaciones del producto ni cobertura completa de todos sus guards |

**0 CRITICAL / 0 REQUIRED abiertos para este modelo y la corrección acotada.** No hay falso PASS causal pendiente en los seis negativos corregidos. La variante insegura está detectada, no silenciada ni marcada skip.

## Alcance que permanece NOT VERIFIED

El plan es más amplio que el estado abstracto explorado: esquema006/schema3, modo NORMAL frente a RECOVERY, inventario esperado completo/vacío frente a filas ausentes, draining técnico, firmas/grants/locks/CAS SQL, clock transfer real, config segmentada, publicación/fsync/ACL/symlinks y recuperación física requieren diseño y ensayos propios. El modelo los presupone en flags o no los representa por separado; no afirmar que los13 checks prueban todos esos vectores del plan o cierran L3-A1…A6. No hay pruebas físicas de origen/destino sin writers simultáneos por tener `originEnded=true`.

Los estados UNKNOWN del modelo pertenecen al procedimiento de promoción, no al UNKNOWN ordinario de una escritura cuyos recursos permanecen retenidos. Sus ready/proofs no añaden autorización al operador ni cambian la semántica histórica L2.

Este review PASS no es Design Gate global, A/B, READY FOR DEVELOPMENT, Phase/Integration Gate ni reapertura de CP017. Próximo paso habilitado: integrar el contrato definitivo en el candidato único, revisar sus vínculos/CAS/continuidad/readiness/custodia/presupuestos y matriz antes de fijar el objeto A. Runtime/QA nueva siguen tras A/B y Development/Environment Gates, con recursos y permisos propios. Prompt Maestro y fuentes históricas intactos.

## Complemento focal — inventario esperado, 2026-10-14 UTC

**Objeto vigente: REVIEW PASS limitado al modelo abstracto de14checks.** Este apéndice sustituye únicamente la identificación de la fuente vigente y amplía cobertura de inventario. El texto anterior conserva la revisión del **2026-10-13 UTC**, snapshot13checks/modelo `a22befb8…` y resultados `49746141…`; el archivo de aquella revisión tenía SHA-256 `2caa4c7308198f123bea23a2267a7a2ee0a154ee63ee669b941d24956b34d2e8`. No se atribuyen los14checks ni el quinto mutante a aquella fuente.

Fuente final leída/revisada después de la corrección de root por el hallazgo del peer `l2_ui`:

| Objeto vigente | SHA-256 / procedencia |
|---|---|
| `model.mjs` |`f211a552ee872f4bc49ae2d75ec215fa7b3748301c28460625c15aaa3188b414`|
| `results.json` |`7473aada512364f46b060c1277c5552da2d9cf9a84c47bb4f87c9a05827fc578`; productor root2026-10-13T23:57:39.681Z;14checks/40estados/230aristas/5mutantes;9ms |
| Observación de este complemento |Inicio2026-10-14T00:00:11Z UTC; LOCAL/Node24.21.0/Windows x64; sin ejecución física o cambios del modelo/resultados |

**MODEL-ROSTER — ausencia legítima frente a carga incompleta: RESOLVED LOCAL.** Antes, el cero-empresas positivo se obtenía eliminando A/B sin una expectativa custodiada representada: el modelo no distinguía pérdida de la empresa esperada de ausencia legítima. El hallazgo del peer originó `expectedTenants`, `expectedAnchor`, `loadedTenants` y `loadComplete`. `roster` exige carga completa, arrays, identidad exacta de la expectativa con su ancla, unicidad de ambas listas y coincidencia total con las filas A/B presentes. No basta que el JOIN/listado cargado quede vacío.

El positivo cero empresas declara ahora explícitamente expected=[],anchor vacío,loaded=[] y ausencia de A/B. Las cinco negativas parten de `promoted()`, que primero afirma ready=true: A omitida; filas cargadas duplicadas; loadComplete=false; fila extraC; listado cargado vacío con expectativaA/B. Cada patch obtiene ready=false sin otra carencia de dependencia. Se conserva la corrección causal MODEL-01 de los seis prerrequisitos y el caso de activación final con ACK perdido; no hay regresión de aquellas assertions.

Recheck independiente del programa vigente **en memoria**, con el mismo mecanismo de interceptación de escritura descrito arriba:14checks/40estados/230aristas/5mutantes,11ms; SHA de modelo, casos y conteos coinciden con results de root. Ningún byte de results.json se escribió. La BFS conserva sus cotas y exploración40/230; los vectores de inventario se ensayan como casos focales, no se declara una nueva exploración de todas las listas posibles.

Sensibilidad nueva: `node .agentic/experiments/cp018/model.mjs --unsafe-roster` termina con **exit1/ERR_ASSERTION** en la primera omisión de A de `roster-omitted-duplicate-load-error-and-extra-denied` (línea80 del objeto vigente), true en vez de false. Ocurre antes del writer de resultados. Se comprobaron hashes finales idénticos tras normal en memoria y proceso inseguro; el quinto contraejemplo no es una mutación del producto ni se silencia la salida1 esperada.

**0 CRITICAL / 0 REQUIRED abiertos para este complemento.** El ancla/expectativa son valores abstractos de custodia asumida; no se acredita origen confiable de un manifiesto, hash SQL, snapshot atómico, paginación productiva, ni parser de todos los IDs/filas reales. El universo del modelo son A/B; una filaC cargada se rechaza, pero no se extrapola esa comprobación a inventarios arbitrarios. NORMAL/RECOVERY, schema006/3, draining, permisos/locks/clock/fsync/no-clobber y pruebas físicas continúan con los límites NOT VERIFIED señalados anteriormente. Revisión/candidato/gates L3 conservan su separación; ningún recurso/commit/archivo adicional creado por este complemento.
