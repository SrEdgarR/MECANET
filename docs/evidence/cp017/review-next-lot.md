# Revisión documental de P1-L3

2026-10-13T22:34:52.732Z · revisor `l2_ui` · entorno LOCAL, lectura y edición documental únicamente. Preparación autorizada por el coordinador; sin SQL, pruebas funcionales, SSH, Git o recursos nuevos.

Objeto revisado: [.agentic/P1-L3_CANDIDATE.md](../../../.agentic/P1-L3_CANDIDATE.md), ahora **v0.1-CP017-rev1 / SUGGESTED / NOT APPROVED**. Antes de correcciones SHA-256 `3364947c086697a87654d68b1090de36d7593584640c264e483871a380698b4c`; versión final de esta revisión `03627e96621ef3f3fbf41edcbabb73173142834e3a6dc293b1d4bd8c7226e328` (15,952 bytes). Aprobación A/B de L2 no se extiende a este objeto.

## Hallazgos y correcciones acotadas

| Hallazgo concreto | Corrección en el candidato | Estado de la evidencia |
|---|---|---|
| El positivo de una nueva alta podría exigir201 en CP-017 A lleno29/29 | Fuente L3 NUEVA con margen acreditado antes de backup; CP-017 STOPPED/KEEP y cuotas/contadores/datos intactos. Una copia llena debe conservar429 y no sustituye el positivo de alta | RESOLVED DOCUMENTAL;29/29 tiene provenance REPORTED del coordinador, no consulta SQL de este revisor |
| Un UUID histórico no identifica al actor autorizado; el actor usado en ensayos previos puede estar revocado | Principal company vigente de fixture nueva, acciones explícitas y operación original antes de backup; después sesión nueva del mismo actor con permiso original. Otro actor/revocado/old SID no obtiene un positivo ni se reactiva para pasar | RESOLVED DOCUMENTAL; autorización/continuidad real L3 NOT VERIFIED |
| Global readiness=false de un tenant bloqueado podía confundirse con caída o promoverse por comodidad | Propuesta única separa salud del proceso, readiness de servicio y denegación por tenant. Exige conformidad del destino/conjunto elegible y cierre probado del resto; evita detalle/conteos públicos. Adaptación del handler/Compose/consumidores queda pendiente de Design Gate | SUGGESTED, NO SPEC CHANGE APPROVED; no cambiar writer_readiness o balanceador en L2 |
| “Fuente y destino nunca activos” mezclaba PG cerrado de control/clonación con writers/admisión | Prohibir runtime/admisión de negocio simultáneos; permitir PG cerrado de control sólo con fin positivo, ausencia SQL y presupuesto agregado acreditados. Separar cohorte/recursos/generación de systemIdentifier de una copia | RESOLVED DOCUMENTAL; aislamiento/resource preflight L3 NOT VERIFIED |
| Repetición/crash y versiones nuevas no distinguían guardas históricas de promoción del destino | Registro durable por recovery/etapa; custodia estable antes de SQL, no regeneración por retry, ninguna adopción por TTL. Mapping/CAS cerrado→abierto y ventana de acuse/admisión requieren diseño explícito; tombstones/intenciones históricos no se reescriben | SUGGESTED; mecanismo definitivo/ACL/CAS siguen antes del Design Gate/A |
| Gates, recursos y seis criterios podían interpretarse como aprobación o ejecución implícita | Base canónica sólo tras L2 TERMINAL/Integration; A exacta/B diferenciadas y Development/Environment antes de código/recursos. Seis salidas NOT VERIFIED con fuente/entorno; presupuestos finitos y plan de fallos antes de ejecución | RESOLVED DOCUMENTAL; ni Phase Gate ni READY FOR DEVELOPMENT/PRODUCTION L3 |

## Trabajo que falta y gate exacto

1. **F14/Design Gate de protocolo crítico y recuperación (§8.3):** revisar definitivamente elegibilidad/readiness, inventario de secretos/configuración, privilegios del preparador, vínculo manifiesto/journal/recursos y CAS/continuación por tenant ante cada frontera. La propuesta escrita no demuestra estas propiedades ni cierra ese gate por sí sola. El cambio de readiness debe tratarse por su impacto sobre la baseline, sin aprobar una SPEC CHANGE anticipada.
2. **Specification Gate/A (§8.1):** completar límites numéricos por etapa —tiempo/comandos/leases/conexiones, tamaño/espacio y abortos— y modelo coherente de fixture, permisos, recursos y aceptación. Revisar el candidato completo versionado/hash antes de A; no pedir de nuevo decisiones comerciales confirmadas ni trasladar gates de seguridad a P6.
3. **Development/Environment/B (§8.2):** fijar la base real después de Integration Gate L2, A exacta y autorización B diferenciada. Runtime/locks/pruebas base, roles/credenciales nuevas y preflight por recurso deben estar acreditados antes del trabajo dependiente. No usar CP-017 para compensar falta de margen.
4. **Salidas/Integration (§8.4/8.5 y §9):** futura matriz de seis criterios con subpropiedades SQL/HTTP/navegador/host y provenance por productor/verificador; revisión independiente, regresiones afectadas, cleanup y CI/merge canónicos. Restore cerrado L2 no se convierte en reapertura PASS, ni una muestra HTTP en garantía completa.

Trabajo independiente actual: revisión del borrador, coherencia de contratos, vectores de estados y plan de fallos sin destinos reales. Copia externa/RPO/RTO comercial, proveedor/coste/egreso y entrada pública conservan Q-08/23/34/39/41 y los gates del roadmap; no son implementaciones ni permisos ocultos de esta preparación. P1 sigue la única fase activa, P0 PARCIAL y SaaS general NOT APPROVED; no cierre general de P1 ni entrada de P2 por aprobar un lote futuro.

## Fuentes y comprobación proporcional

| Fuente leída, sin modificación | SHA-256 | Alcance |
|---|---|---|
| [Roadmap](../../ROADMAP.md) | `bc0f3ddc5079e480d61bf88ba10e6e13676bb7cc1aef1633a1d1b66ea1e4f78b` | P1 actual; P2…P7/gates y dependencias conservados |
| [Baseline L2 aprobada](../../specs/P1-L2.md) | `776393ad96d1628b6c6e61ff8722257570b058147a94cdd71103419b8ece3cba` | Objeto A/B y frontera de alcance; no aprobación L3 |
| [Snapshot L2](../../specs/p1-l2-approved/baseline.md) | `ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71` | §3/6/7 y L2-A5…A12: actor/clave/epoch/cuotas/restore cerrado |
| [Prompt Maestro](../../methodology/Prompt_Maestro_v2.0.md) | `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d` | §8.1…8.5 y §9: gates, matriz, evidencia/provenance; copia intacta |

Comprobación documental PASS limitada: seis IDs L3-A1…A6 únicos, enlaces locales existentes, SUGGESTED/NOT APPROVED y todas las salidas NOT VERIFIED visibles; snapshot L2 y Prompt intactos. No se ejecutaron tests, backups, restore, promoción, sesiones ni servicios. Sólo se editaron el candidato y este informe; cánones/mapa/matriz/DEC y producto sin modificación por esta tarea. No Git/commit/push de este revisor: la trazabilidad del futuro commit la registra el coordinador, sin SHA autorreferencial.
