# Plan de Mecanet — adopción, especificación y P1 limitado

Estado vigente CP-014: **P1 EN CURSO**, única fase activa; **P1-L1 COMPLETADA**, ocho salidas PASS de la baseline limitada DEC-058. P0 general PARCIAL bajo RG-001 y SaaS general NOT APPROVED. Integración local preparada; PR/CI remoto/merge NOT VERIFIED, sin push o lanzamiento autorizado. Este documento no concede aprobaciones adicionales. Tareas en [todo.md](todo.md); la historia siguiente conserva los estados originales y no gobierna por encima del cierre CP-014.

## Cola histórica CP-012 — PostgreSQL y operación independiente

Base real **bf28c4538d9a511a79f3c297d7dffb207879f2ea**, fuente humana directa2026-10-12. DEC-021/SC-005 elimina gestión de despliegue Coolify, DEC-054/SC-006 fija PostgreSQL, DEC-055/056 conserva UI cuadrada/NCF/e-CF y DEC-057 registra B condicional. [S-18 P1-L1 v0.2-CP012](../.agentic/SPECIFICATION_CANDIDATE.md#s-18--candidato-limitado-p1-l1-v02-cp012) es el único lote para aprobación A, sin reincorporar S-00…17 o los paquetes Mongo completos.

| Trabajo | Resultado | Límite / evidencia |
|---|---|---|
| T-16A | Decisión corregida, SPEC CHANGE/impacto y fuente actual | Historia preservada, sin fecha antigua inventada o transferencia de PASS |
| T-16B | Mismos ocho cortes adaptados a SQL, roles/pools/admisión/restore/UI y Compose independiente propuesto | Candidato v0.2-CP012, A pendiente; B condicional no se pregunta otra vez |
| T-16C | Inspección remota lectura de coexistencia, entrada HTTPS privada y presupuestos de ensayo | Snapshot no es capacidad; ninguna creación/reinicio/cambio compartido |
| T-16D | F14-L1 por impacto, QG documental/mapa/checkpoint y próximos pasos concretos | Sin producto, QA instalada o readiness general; código solo después de A/gates/entorno |

**Precedencia:** las secciones ENG y dependencias CP-010/011 que siguen son antecedentes conservados. Para el lote actual se aplican S-18 y ARCH DEP-IND CP-012; no adoptar Mongo/Mongoose/connect-mongo, oplog o administración Coolify por una referencia histórica. La inspección del VPS queda ahora autorizada, y QA aislada permitida condicionalmente; prohibiciones históricas de usar el VPS no son veto absoluto sobre esa ruta actual.

## Cola histórica CP-011 — candidato limitado y aplicación RG-001

Base **4b2f272b197619c87e2dff0cd8578da6b9037041**, adjunto51b8e835-d246-41a7-8f4c-f54901984f96. Orden/riesgo APPROVED, baseline/implementación/paquetes completos/proveedores/gasto NO aprobados. [S-18 P1-L1 v0.1-CP011](../.agentic/SPECIFICATION_CANDIDATE.md#s-18--candidato-limitado-p1-l1-v01-cp011) es la única especificación sometida a A; ocho cortes conservados.

| Trabajo | Entrega | Límite |
|---|---|---|
| T-15A | DEC-053 actualizado, Q40resuelta, dependencias y entradas efectivamente reubicadas | No nuevas aprobaciones por extensión |
| T-15B | S-18/manifiesto selectivo/datos/permisos/admisión/UI/restore y fuentes de pins | CANDIDATE NOT APPROVED, no especificación SaaS paralela |
| T-15C | Comprobación dirigidaWSL/Docker y reutilizaciónQA-EXP-02 | No nueva pruebaMongo ni instalación; entorno por corte separado de su salida |
| T-15D | F14-L1/QG/mapa y decisionesA/B concretas | F14 global parcial y P1noiniciada |

## Cola histórica CP-010 — revisión técnica, evidencia y acciones utilizables

Base f72bd2393e26eeaf97f6962baf520a71e50e356b, adjunto65a09515-e7d6-477b-b4bf-79cba4986b17. No nuevas aprobaciones. Q-02/11/31 revisados completos; ocho cortes conservados. QA-EXP-02 autorizado solo para resolver disponibilidad/aislamiento básicos.

| Trabajo | Entrega realizada | Límite |
|---|---|---|
| T-14A | Recomendación técnica Q-02/11/31 y correcciones materiales de representación | Aceptación de paquetes pendiente; no baseline |
| T-14B | Dependencias A/B/C/D y RG-001/DEC-053 para revisión; Q-38 exacto y dos mensajes listos | Gates vigentes, mensajes NO ENVIADOS, sin nuevos proveedores/políticas aprobados |
| T-14C | Copias full30min justificadas bajo medición; QA-EXP-02 réplica/auth/negativos/transacciones y cleanup PASS | No capacidad/restore/ARM64/Mecanet validados; sin instalación o infraestructura productiva |
| T-14D | Candidato v0.10-CP010, registro/mapa y auditoría con evidencia separada | Quality Gate proporcional, checkpoint local; no push/merge/CI o inicio P1 |

## Cola CP-009 — respuestas incorporadas y candidato para revisión final

Base/HEAD inicial **3ec4c1ea5ab12fdff9c7be42864d708757e93be1**, rama codex/saas-discovery. Fuente humana completa del adjunto CP-009, recibida2026-10-08. Se actualizan las decisiones en su alcance exacto, los contratos existentes y el candidato integrado; no se reinicia descubrimiento ni se redisecciona P1-L1. Ninguna implementación, infraestructura, cuenta, gasto o ejecución remota autorizados.

| Bloque | Resultado concreto | Dependencia / límite | Comprobación |
|---|---|---|---|
| T-13A | Incorporar catálogo, calendario automático, permisos, demo/POS, retención y recuperación | Cerrar las respuestas exactas; preservar historia y condiciones no aprobadas | DEC existentes y039…052; revisión de impacto única, sin SC/ERRATA ficticios |
| T-13B | Comparativa oficial de pagos y servicios/costes completa | AZUL/CardNET, B2/R2, Sentry/correo; no cuenta/contacto/contrato | Requisito→fuente→estado; tarifas frente a volúmenes hipotéticos; documentación privada exacta |
| T-13C | Candidato versionado y contratos MT/ENG/UI coherentes | Datos/consentimiento/proveedor/fiscalidad pendientes localizados | SPECIFICATION_CANDIDATE incorpora las áreas canónicas y contratos del mismo commit |
| T-13D | Revisión F14 efectiva, Quality Gate y mapa/checkpoint local | Coherencia documental distinta de factibilidad, aprobación y funcionamiento | Matriz F14 de esta sección, C-107… posteriores y auditoríaCP-009; sin pruebas históricas repetidas |

## Cola CP-008 — propuesta final revisable, 2026-10-08

Base/HEAD inicial **472b6853173d8fdee46e831ef32ada5319da5578**, rama codex/saas-discovery. Texto humano CP-008 §§1…5: DEC-036 impide extender recurrentemente períodos por pago tardío; DEC-037 aprueba Q-20; DEC-038/SC-004 sustituye el saldo futuro por cambio inmediato durable. Se conserva CP-006/007 sin repetir experimentos, inventarios o pruebas históricas. Delegación por archivos ya autorizada; integración central de evidencia/decisiones. Un checkpoint por completar contratos independientes, no por cambiar etiquetas.

| Bloque | Resultado observable | Dependencia / límite | Verificación proporcional |
|---|---|---|---|
| T-12A | Decisiones exactas, SPEC CHANGE y retiro de complejidad obsoleta | Historial DEC-030/035 conservado; no ficha/PIN/saldo futuro obligatorio | Q-20 resuelta; Q-26/27/29 DISCARDED por alcance, nunca PASS funcional |
| T-12B | Cambio inmediato, calendario único y condiciones comerciales completas | Q-16/19/28/37 siguen SUGGESTED; valores por línea, confirmación durable y fallos | Recorrido CC, GRA y contratos UI; regresiones CP-006 conservadas |
| T-12C | Q-02/Q-11/Q-31 completos como candidatos de revisión | Mecanismos internos integrados; decisiones humanas de dinero/permisos/privacy separadas | Diseño MT/MC/G, ENG y UI; no implementación, QA, capacidad o proveedor acreditados |
| T-12D | Registro depurado, preparación F14 y lote P1-L1 coherentes | Resolver condiciones críticas antes de baseline/autorización | Quality Gate documental, mapa y un checkpoint local; sin push/merge/CI |

## Q-11 — Contrato de ingeniería histórico ENG, revisado en CP-010

**Histórico:** versiones, pruebas y mecanismo de este bloque describen CP-010. La sustitución PostgreSQL/Compose de CP-012 y adquisición por corte se especifican en S-18 L-06; esta conservación no aprueba o reintroduce Mongo/Coolify.

**SUGGESTED, listo para revisión técnica conjunta**, no especificación aprobada ni configuración ejecutable. Resuelve qué construir, con qué cadena y cómo integrar; disponibilidad del entorno Q-32, aprobación de diseño y evidencia por fase siguen separadas. Propuesta ajustada al repositorio existente, sin migración de framework, TypeScript o gestor de paquetes por iniciativa del agente.

### ENG-01 · Runtime y herramientas

| Asunto | Recomendación única y fundamento | Evidencia / límite / gate |
|---|---|---|
| Node | Fijar **24.21.0 LTS** en desarrollo de entrega, QA y runtime Linux ARM 64. Pin de imagen por digest al acreditar el builder; no usar latest ni un tag mutable como identidad de release | SRC-59/60 verifican LTS y binario Linux ARM 64 el 2026-10-08. Local24.14.0 y Dockerfile24-bookworm-slim DETECTED, no se actualizaron. Versión propuesta satisface engines declarados; compatibilidad real P1 |
| npm / locks | Fijar **npm 11.9.0**, conocido en entorno previo, y conservar ambos lockfileVersion3. npm ci separado en raíz y client, sin regenerar locks en CI. Flags de resolución iguales a los que generaron el lock | SRC-61 describe contrato de ci. No afirmar npm incluido con Node 24.21.0. Cambios de dependencias requieren diff, fuente/advisory y prueba focal; ninguna instalación ahora |
| Aplicación actual | Conservar Express4.22.3, Mongoose8.24.4/driver6.20.0, React18.3.1, Vite6.4.3, Vitest4.1.11, Rollup4.63.4 y esbuild0.25.12 de locks; Mongo7.0.43 de evidencia previa, sujeto a revisión de seguridad antes de fijar imagen | Lectura LOCAL CP-008 de manifests/locks, SRC-62 solo contexto Vite6. Engines Vite ^18/20/22+ y Vitest20/22/24+ admiten Node 24; no prueba binarios nativos ni ausencia de vulnerabilidades |
| Estática y disciplina | JavaScript/JSX y ESM existentes. Recomendación de lint: ESLint con configuración plana, reglas de JS, React Hooks y promesas según módulos; pin exacto/lock y comando se incorporarán en el primer corte autorizado de ingeniería. Sin migrar a TS; typecheck TS N/A mientras no exista TS | Actualmente no hay script lint operativo acreditado; eslintConfig heredado no equivale a gate. No ejecutar comando imaginario, instalar o declarar lint PASS. Configuración mínima revisable antes del primer cambio funcional; errores no silenciados globalmente |
| Prueba en navegador | Vitest/jsdom para componentes; **Playwright** como único candidato de E2E real, versión/binarios fijados al crear el arnés autorizado | Los archivos e2e existentes usan render/MemoryRouter/mocks y no prueban navegador→API→Mongo. Nueva herramienta pendiente de revisión/pin, no instalada. Q-32 y Environment Gate antes del uso |
| Sesiones | express-session1.x + connect-mongo6.x recomendados: cookie opaca firmada por biblioteca y almacén central estándar; genid mediante CSPRNG nativo32bytes. Sin adaptador criptográfico nuevo; registros de sesión son sensibles | MT-B/SRC-68/69; patch compatible/pin y pruebas expiración/revocación/CSRF en primer corte autorizado. No bibliotecas instaladas ni compatibilidad efectiva acreditada; SRC-69 master no prueba publicación del patch |
| Adquisición | Revisar origen/integridad de dependencias, incluidos tarball SheetJS fuera de npm y binarios Rollup/esbuild por arquitectura; escaneo de advisories y secreto antes de aceptar cada release | No escaneo remoto o certificación nueva CP-008. Vulnerabilidad crítica/alta aplicable al alcance bloquea; documentar aplicabilidad y resolución, no ocultar hallazgo con exclusión genérica. Nuevos advisories requieren evaluación antes de congelar el pin |

Los digests y pins de herramientas **aún no adquiridas** son evidencia que se captura en Q-32/ENG antes de ejecutar el primer corte; no se inventan hashes ni una instalación disponible. Esta carencia concreta no vuelve incompleto el diseño de la cadena: bloquea su acreditación. Las versiones del producto permanecen sin cambios en P0.

### ENG-02 · Build y artefactos

Un repositorio y dos imágenes de entrega: **web** (landing web/ + client/dist/ servido por Nginx) y **api** (Express; el trabajador privado comparte imagen/versionado, con entrada y secretos distintos). Así no aparecen repos/proyectos por cada hostname. API permanece en api.mecanet.site según DEC-023 candidata; web atiende mecanet.site y app.mecanet.site con selección por host. Rutas/headers/health detallados en G-01/MT; no proxy abierto ni servidor Vite de desarrollo en producción.

Cadena recomendada: builder **Linux x64 aislado con Buildx/QEMU para linux/arm64**, fuera del VPS compartido; se valida después el mismo digest en QA ARM 64 real. Emulación sirve para producir/probar compatibilidad inicial, nunca para inferir capacidad o tiempos físicos. Q-32 debe acreditar esa disponibilidad y sus límites antes de build; no se presume Docker local, runner externo, gratuidad o cuenta de registro. Si no está disponible, el build queda localizado en Q-32, sin fallback al host productivo. No ejecutar CI remoto ahora ni montar el Docker socket productivo en un runner.

Secuencia futura, sin ejecutar en CP-008/009/010: checkout del SHA revisado → preflight de destinos/locks/runtime → npm ci raíz y client → checks focales → compilación del cliente → ensamblado de web/API ARM 64 con contexto permitido → inspección de contenido/secrets/arquitectura → smoke y negativos en QA → manifiesto de release con digests, SHA, locks, runtime/toolchain, parámetros públicos y resultados. Construir por configuración de entorno y promover **el mismo digest validado para esa configuración**; cambiar endpoint público compilado produce otro artefacto. El digest productivo se prueba aisladamente, con nombres/TLS de QA y egreso denegado, antes de promover; no hereda el PASS de un build con otro endpoint. No afirmar reproducibilidad bit a bit sin comprobar dos builds aislados.

Carencias DETECTED en lectura focal CP-008: Dockerfile actual solo API y SERVE_FRONTEND=false; .dockerignore deniega todo salvo lista API. El futuro contexto web tendrá lista propia, nunca inclusión indiscriminada de .env/docs/backups. build:cloud usa npm install; no es cadena congelada recomendada. client/vite.config.js incorpora Date.now() en nombres: proponer hash de contenido + release SHA estable en su cambio autorizado, sin adjudicar reproducibilidad al código actual. Variables VITE_* son públicas; secretos Mongo/sesión/Sentry privado/AZUL solo runtime backend o mecanismo seguro del build según caso, nunca embebidos en bundles/logs/capas.

### ENG-03 · Pruebas y Quality Gates por riesgo

| Cambio / garantía | Prueba y criterio de salida | Entorno / gate |
|---|---|---|
| Solo documentos/mapa | Enlaces/anclas/tablas/IDs, decisiones sin promover estado, historia/hashes protegidos, diff permitido; generar/check mapa y comparar siete fuentes | Local, CP-010; conservar resultados históricos CP-009. Sin volver a ejecutar90tests, fixtures o build del producto |
| Lógica/API sin DB | node:test focal y regresiones afectadas; conjunto conocido scripts/http.test.js, security.test.js, localSetup.test.js, setup-client.test.js solo cuando el cambio lo requiere | Local aislado, sin .env/DB/red. PASS ligado al SHA real, no arrastre de f5afaa2 |
| React/estados | Vitest unit/integration con VITEST_REAL_API=false y REAL_API=false explícitos; assertions de error/permiso/estado | Local/QA, por corte. No activar REAL_API en equipo con Atlas o credenciales heredadas |
| Identidad/admisión/DB | Dos API, réplica Mongo QA, A/B/demo/operador; concesión/revocación por acción, no redelegación ni consentimiento de pago implícito; límites/credenciales/rollback/ACK perdido/reinicio; cada negativo debe acreditar cero dato/efecto ajeno | P1 y ampliación P2/P4, MT/MC. Semilla sintética nueva exclusiva del arnés, nunca seed/setup/reset de DB existente |
| Cambio/cierre | Moneda entera y cantidades por saleLineId; rechazar R1=333 conserva R2=668, nunca recalcular a 667; mismo SKU a 100/200 mantiene líneas distintas; stock/reservas/frontera cierre, retry/cancel/commit desconocido y compensación enlazada | P2 CC-V. Pruebas puras CP-006 son antecedentes, no implementación validada |
| Cobro/lifecycle | Dobles avisos, reordenación, pago tardío, restaura sin recobrar, períodos/planes/divisas y deducción7d por episodio; revocación/cancelación frente a cobro en vuelo y reintentos acotados; redirección no activa | P3 sandbox del proveedor seleccionado/acreditado Q-03, COM/SUB; ningún cobro real para pasar este gate |
| UI de recorridos | Playwright navegador fresco→API→DB sintética, teclado/foco/lectores mediante semántica,320/768/1440px, reduced motion; prueba de permisos servidor aunque botón oculto | Negativos del corte en P1/P2/P3/P4 y experiencia comercial conjunta P5; no posponer toda UI a P5 |
| Release ARM 64 / recovery | Imágenes por digest, deep links/CORS/cookie/CSRF/health, rollback compatible; restaurar canarios y verificar aislamiento | DEP-V en QA P1, datos POS P2, billing P3; desastre/capacidad en P6 |

Criterio común: ningún fallo crítico de identidad, autorización, dinero, integridad o destino se acepta como flaky ni se deshabilita para pasar. Guardar reproducción y evidencia sanitizada; corregir causa y volver a probar el alcance afectado. No exigir porcentaje de cobertura arbitrario que sustituya invariantes. Publicar tamaño comprimido de bundles y tiempos del build como baseline medida; advertir aumento >10% por chunk respecto al artefacto anterior para revisión, sin prometer presupuesto aún no medido. G-03 contiene abortos de recursos; jamás probar carga en el VPS sin Environment Gate y autorización específicos.

### ENG-04 · Integración y reversión

Local CP-008: develop es ancestro de HEAD inicial, merge-base **010aab670c638d168c971df3e3e53b97e72ff443**, divergencia **0/9** local. Esto **no** confirma estado remoto, PR#1, protección, triggers de Coolify/Vercel ni disponibilidad de Actions. Antes del primer push autorizado: inspección focal de esas dependencias, establecer base canónica, preservar el worktree ajeno y aislar integración de despliegue. No fusionar PR#1 como efecto lateral de planificación.

Propuesta de CI: GitHub Actions solo SrEdgarR/MECANET, PR con checkout del SHA de revisión, permisos contents:read, acciones fijadas a SHA completo verificable y caché de paquetes por OS/arquitectura/Node/npm/lock. No compartir caché privilegiada con código no confiable, ni ejecutar checkout ajeno en pull_request_target/workflow_run con secretos. SRC-63 sustenta controles, no disponibilidad/gratuidad. El runner de build anterior debe estar acreditado y aislado; no runner autohospedado sobre VPS compartido. CI puede comenzar local hasta autorizar plataforma/ejecución; no afirmar que se ha configurado.

Orden: lint/pruebas focales → build/artefacto → integración QA/negativos aplicables → revisión → CI de candidato exacto → merge autorizado → comprobar CI del merge/base siguiente. Requisito previo al primer push autorizado: impedir que rama documental/PR desplieguen automáticamente; estado real de triggers NOT VERIFIED hasta inspección. Promoción posterior por Coolify y Production Gate. Comparar tested_code_sha, checkpoint_sha, approved_head_sha, merge_sha y next_phase_base_sha por separado; una aprobación de reglas no aprueba un commit distinto.

Añadidos ENG CP-009: restaura con tombstones/revocaciones posteriores al dump y egreso de cobros cerrado; ensayo de borrado por versión/retención7d/journal antes de afirmar recuperación segura. Sentry debe respetar límite de producto1000/mes aunque el plan permita más; no egreso sin cuenta/región/contrato acreditados. Correo solo por bandeja/servidor de pruebas mientras no haya proveedor/destino autorizados. Cada prueba tiene su fase, sin exigir servicios productivos para verificar una unidad aislada.

Rollback recomendado: conservar release anterior y manifiesto compatibles con esquema vigente, cerrar nuevas admisiones/checkout si hay incertidumbre, drenar/reconciliar trabajos en vuelo y seleccionar digest anterior mediante Coolify. No reconstruir tag viejo ni revertir Mongo a ciegas; cambio de esquema incompatible exige migración reversible ensayada y copia acreditada. Fallo de health/rutas/auth/aislamiento/finanzas aborta promoción. Restore de datos es procedimiento distinto, en G-04; un rollback de imagen no deshace cobros ni cierres.

**Salida de Q-11:** contrato candidato completo para revisión; falta aceptar revisión técnica y acreditar pins/entorno/seguridad en Q-32 antes de P0-D. ENG no abre P1 ni crea workflow/Dockerfile/paquetes/servicios. UI Q-31 y arquitectura Q-02 se revisan conjuntamente por coherencia, conservando decisiones humanas independientes.

### ENG-05 · Revisión técnica y entorno CP-010

**LOCAL, 2026-10-08, base f72bd2393e26eeaf97f6962baf520a71e50e356b.** Revisión completa ENG-01…04 y coherencia con MT/MC/G/UI y los ocho cortes. Recomendación **favorable para aprobación del paquete corregido**, sin aprobación ni cierre de Q-11 por el agente.

- Conservar Node24.21.0/npm11.9.0 candidatos, locks y stack; sesiones estándar, ESLint y Playwright acotados al corte que los use. Runtime local24.14.0 no acredita el pin24.21.0. Digests/pins exactos adquiridos, integridad/advisories/licencias y compatibilidad nativa siguen evidencia del Development/Environment Gate; no instalación actual ni nueva pregunta comercial por cada dependencia.
- Corregir la representación «construir una vez»: un cambio de VITE_API_URL produce otro artefacto. Cada entorno tiene parámetros públicos/manifiesto identificables; el digest destinado a producción requiere validación aislada exacta antes de promoverlo. Nombres/TLS de prueba y egreso denegado impiden consultar producción; no llamar al rebuild posterior a QA «el mismo artefacto». Mantener dos imágenes web/API y trabajador con entrada/credenciales distintas; sin secretos VITE_*.
- No exigir que ya existan dos API de Mecanet para acreditar el motor anterior a su implementación: Q-32 acredita destinos, réplica y recursos; el arnés de dos procesos reales y sus negativas se implementa y verifica en L1.2…6. El experimento CP-010 no acredita esos procesos.
- **Evidencia nueva Q-32 parcial:** [QA-EXP-02](../.agentic/experiments/cp010/qa-plan.md), script/hash y resultado: Mongo8.3.11 nativo Windows x64, driver6.20.0 y Node24.14.0. Réplica PRIMARY autenticada, A/B/control ficticios, acceso propio, rechazo13 cruzado/administrativo/anónimo, commit/abort reales: ocho comprobaciones PASS. Un miembro no acredita HA, ni la aplicación, Mongo7.0.43/Linux ARM64 o restauración.
- Recursos propios: un proceso temporal, puerto53670 solo127.0.0.1/PID14736 comprobado antes de conectar, dbpath/keyfile privados efímeros; 4,593s, muestras RSS165,19MiB/CPU0,89s/directorio200,72MiB. Cleanup PASS; servicio MongoDB/PID5100 preservado sin conexión. Valores de muestra, no máximos físicos garantizados o ensayo de carga.
- Docker/Podman no encontrados en PATH/ubicaciones dirigidas; WSL informa no instalado. Faltan builder Linux/Buildx y ejecución ARM64, herramientas dump/restore y runtime elegido. **Acción humana mínima propuesta:** habilitar mediante instalación gestionada por Edgar WSL2 y Docker Desktop con motor Linux local, si acepta sus requisitos/licencia, y avisar cuando el motor esté iniciado. Esta ejecución no autoriza esa instalación, gasto o cambios del sistema. No hace falta volver a instalar Mongo nativo para repetir la prueba ya pasada.
- Comprobación posterior del agente, sin confiar solo en PATH: endpoint de Docker por pipe local, engine Linux/arquitectura/recursos efectivos, buildx inspect y plataformas acreditadas sin recursos remotos; disponer del motor Mongo objetivo y Database Tools por versión/digest, credenciales/volúmenes/redes propios. L1.1…6 necesitan entorno suficiente antes de sus pruebas; ARM64 real antes de la salida DEP de P1/L1.7, no se finge mediante emulación. Un entorno Docker x64 instalado no acredita automáticamente ARM64 nativo.
- No hay runner ni registro externo asumido gratuito. Si ARM64 real no está disponible, solicitar un destino QA aislado específico antes de esa salida, conservando prohibición de usar VPS compartido/Atlas/Nexora. Mantener el build y Phase Gate bloqueados en la garantía ausente.

**Carencias materiales restantes:** aprobación de paquetes Q-02/11/31; acreditación de versiones/entorno suficiente por corte; decisión propuesta RG-001 si se quiere separar carencias externas del arranque del lote; baseline/autorización Q-36. No nuevo bug de producto declarado ni auditoría de dependencias ejecutada. Las90pruebas y CP-006 siguen históricos; QA-EXP-02 es evidencia de entorno separada, no nuevo tested_code_sha general.

## Cola CP-007 — consolidación histórica del 2026-10-08

Base/HEAD inicial comprobado **31a854db72e6012cc26fcf17ead2287c107a5790**, rama codex/saas-discovery. Fuente directa CP-007 §2A/B/C: DEC-028 concretada, DEC-034/035 nuevas, sin ampliar aprobación. T-10 ya completada; no reejecutarla. Solo documentación y mapa, sin nueva incertidumbre que justifique un ensayo. Delegación autorizada por archivos distintos; coordinación mantiene registro canónico, F14 y trazabilidad.

| Bloque | Resultado observable | Dependencia / límite | Verificación proporcional |
|---|---|---|---|
| T-11A | Tres aprobaciones exactas e historia/impacto preservados | Mensaje humano y DEC vigentes, no SPEC CHANGE/ERRATA ficticios | DEC-028/034/035, sin convertir perfiles de ensayo o mecanismos en configuración productiva |
| T-11B | Contratos MC, SUB y CC cerrados como propuestas revisables en lagunas pedidas | Archivos separados ARCHITECTURE_OPTIONS, SUBSCRIPTION_PROPOSAL y SAAS_DISCOVERY | Ventanas/admisión, calendario con instantes, prueba de derecho/ledger/regresiones; ningún resultado funcional nuevo |
| T-11C | Registro único depurado y revisión preparatoria F14 | Propuestas liberadas y decisiones contrastadas | Cada Q indica tipo/prioridad/gate/evidencia/trabajo permitido; resueltos y duplicados retirados |
| T-11D | Cortes internos verificables P1-L1, mapa/checkpoint coherentes | Preparación, nunca autorización | Entradas/salidas separadas por garantía, references/diff/historia/mapa; un checkpoint local documental |

## Cola autónoma CP-006 — 2026-10-07 a 2026-10-08

Base comprobada fcd93a809d907e06e2ce514f71437827c993c74a, codex/saas-discovery. Fuente: dos textos humanos de esta ejecución; la ampliación permite experimentos locales acotados, sin producto/infra/gastos, y delegación con archivos separados. No preguntas durante la sesión. P0 es la única fase activa; decisiones pendientes se formulan como propuestas. El Prompt y toda evidencia histórica se preservan.

| Bloque | Resultado concreto / responsable | Dependencias y alcance | Evidencia de cierre / bloqueo localizado |
|---|---|---|---|
| T-10A Decisiones | Coordinador: DEC existentes/nuevos independientes, clasificación de cambios y revisión de impacto | Mensajes actuales, CP-005; solo expediente | Aprobaciones exactas y contradicciones vigentes resueltas, sin aprobar parámetros adicionales |
| T-10B Recursos | Subtarea recursos: contrato de medición/control, perfiles, admisión agregada y permisos mínimos | Arquitectura ahora aprobada; ARCHITECTURE_OPTIONS propio | Matriz completa y negativos; CPU/RAM exactos o reserva por tenant se delimitan, sin medición del VPS |
| T-10C Caja/crédito | Subtarea integridad: invariantes/ejemplos, discrepancias del código y ensayo de estados si aporta evidencia | Cajas/cierres/crédito aprobados; SAAS_DISCOVERY propio | Trazabilidad y escenarios concurrentes; condiciones adicionales del crédito quedan propuestas |
| T-10D Comercio/economía | Subtarea economía: catálogo, lifecycle, proveedor/fuentes y modelo recalculable | DOP/15%/prepago aprobados; SUBSCRIPTION_PROPOSAL propio | Aritmética exacta y sensibilidad, incertidumbres de tarifas/impuestos/cuenta explícitas |
| T-10E Demo | Coordinador: registro/admisión, dataset ficticio y cuotas, permisos, almacenamiento/copias | Condiciones de demo confirmadas; integración documental después de liberar archivos de otras subtareas | Fixture determinista y resultados locales; datos de identidad/seguridad separados, retención propuesta |
| T-10F Gate | Coordinador: coherencia previa a F14, primer lote condicionado, QG/mapa/checkpoint local | Bloques sustantivos revisados | Matriz requisito→decisión→diseño→prueba, evidencias por fase, sin baseline aprobada ni P1 |

Experimentos únicamente en `.agentic/experiments/cp006/`, fuera de la lista permitida del Dockerfile/contexto y sin importación en aplicación. Cada ensayo registra pregunta, posible impacto, entorno/destino, límites, resultados esperados/aborto y conservación antes de ejecutarse. No cargar .env, usar bases reales ni iniciar servicios del sistema. Se conservan scripts/fixtures/resultados sanitizados útiles (KEEP); cualquier recurso temporal propio debe quedar identificado y retirado. Un resultado experimental no verifica producto, Mongo real ni ARM 64/VPS. No se repiten los 90 tests por rutina.

**Cola T-10 completada en su alcance autorizado:** decisiones y reverse-impact, MC/CC/DEM/lifecycle/economía, tres ensayos acotados y revisión preparatoria F14. Resultados por bloque en CP-006; no cierres de gates por simulación. Los tres agentes trabajaron archivos distintos y el coordinador integró/revisó; revisión cruzada de DEM/MC y de claims del fixture corrigió dos descripciones de evidencia (determinismo fuera de los siete grupos y dos archivos escritos).

Código probado histórico f5afaa2, 90 pruebas no repetidas. Base inicial real CP-006 fcd93a8; Prompt original, copia y worktree previo preservados. No producto/config ejecutable, secretos, inspección remota nueva, DB, build/carga VPS o servicio permanente. La búsqueda de herramientas no acreditó Mongo local aislado; prueba de credenciales/pools reales omitida, sin usar Atlas/VPS.

## Orden y dependencias

1. Inventario y evidencia base (T-01).
2. Levantamiento de producto/negocio y datos (T-02), usando decisiones ya respondidas.
3. Diseño de aislamiento, permisos, pagos, observabilidad y migración (T-03), con riesgos y fuentes vigentes.
4. Coherencia, documentación y mapa del checkpoint inicial (T-04). Este mapa documental es la excepción explícita solicitada en §6 del Prompt; no cambia ninguna interfaz productiva.
5. Completar preguntas críticas y especificaciones, segunda auditoría F14, aprobación humana y baseline trazable (T-05).

T-01 habilita trabajo documental T-02/T-03/T-04 dentro de la misma P0. El Design Gate de pagos no impide investigar aislamiento. Ninguna tarea abre P1 automáticamente.

## Decisiones y riesgos

DEC-009 SUPERSEDED solo en hosting por DEC-021/SC-001. SC-004 sustituye saldo futuro DEC-030/035 por cambio inmediato DEC-038; DEC-036 no extensión recurrente y DEC-037 acceso posgracia aprobados. Resto de decisiones conservado, DEC-014 APPROVED en política; DEC-022/023 PROPOSED. Mecanismos Q-02/ENG/Q-31 completos como candidatos; riesgos aún abiertos de autorización/admisión, integridad POS/pagos, privacidad/restore, proveedor/coste/QA/capacidad. Aprobar un título no ratifica detalles del borrador.

## Checkpoints

- CP-001: inventario y adopción documental verificados; evidencia focalizada del mapa y coherencia en CHECKPOINTS. Commit local identifica el checkpoint, sin push ni cierre de P0.
- CP-002: cambio material de alojamiento SC-001, reverse-impact y Quality Gate documental; no cierre de P0. El cierre de planificación previsto antes como siguiente checkpoint queda pendiente sin reservar un ID nuevo. Este checkpoint registra un cambio de arquitectura aprobado, no una pregunta aislada.
- CP-003: contrato técnico propuesto para lagunas G-01…G-05 y trazabilidad de la contradicción G-06; checkpoint único por diseño sustantivo, no administrativo ni cierre de planificación.
- CP-004: SE-001 y dirección humana aclarada; propuesta de descuento con cálculo/ejemplos, condiciones DEM-01…08, flujo de contratación y matriz de negativos/gates. Un checkpoint por este diseño sustantivo, no por buscar una aprobación ya proporcionada.
- CP-005 histórico: recomendación concreta B frente a A sobre código real; distribución, contexto/revocación, credenciales/pools, índices/invariantes, mantenimiento/restore y MT-V1…8. DEC-012 permaneció PROPOSED entonces; CP-006 registra su aprobación posterior.

- CP-006: decisiones directas e impacto, contratos MC/CC/DEM/SUB, evidencia local acotada, modelo económico y preparación del siguiente gate. Un checkpoint local de planificación y experimentos por avance sustantivo, no commits por cada consulta ni baseline aprobada.

- CP-007: tres aprobaciones, contratos de admisión/gracia/beneficiario, registro único y cortes internos P1-L1; Quality Gate documental/mapa, sin ensayos nuevos ni P0 cerrado.

- CP-008: SC-004/DEC-036…038, contratos técnicos/ingeniería/UI completos como candidatos, condiciones humanas concretas y registro depurado; sin baseline ni implementación.
- CP-009: respuestas actuales incorporadas, proveedor/copias/costes investigados, candidato v0.9-CP009 y revisión F14 real con entradas pendientes; sin código/infra/gasto ni implementación.
- CP-010: revisión técnica completa, RG-001 propuesto y QA-EXP-02 real acotado con cleanup; solicitudes listas y Q-38 concreto, candidato v0.10 sin aprobación.

## Dependencias reales de P1-L1 — revisión CP-010

**Historia CP-010:** matriz conservada como análisis previo a aprobación; resolve-before vigentes en ROADMAP RG-001 y PLANNING_STATE CP-011.

Clases: **A** diseño antes de implementar; **B** entorno antes de ejecutar/probar; **C** integración externa; **D** contratación/cobro/lanzamiento. Pueden coexistir en una entrada. Tabla analítica: **los gates vigentes CP-009 no se cambian aquí**. La corrección propuesta RG-001/DEC-053 requiere decisión separada Q-40.

| Pendiente / clase | Garantía concreta y corte afectado | Mínimo necesario | Trabajo independiente posible | Gate vigente | Límite propuesto, solo si se aprueba RG-001 |
|---|---|---|---|---|---|
| Q-02 · A | Autoridad, permisos, ámbito/pools, admisión, rutas y journal; L1.1…8 | Aprobar mecanismos MT/MC/G corregidos y amenazas/negativas | Contrato/revisión/arnés experimental de entorno autorizados; no producto | P0-C, DG-TENANT/ADMIN/OBS/MIGRATION, DEP-D1/D2 | Sin rebaja: contrato de cada garantía antes de implementarla; diseño completo del lote en baseline |
| Q-03 · C/D | Pago auténtico/token/currency/calendario; ningún cobro en L1 | Para L1: límite explícito sin proveedor, con estados sintéticos; para billing: expediente técnico suficiente | Identidad, lectura, admisión y restore ficticios no consumen pasarela | DG-PAY P0-C; sandbox P3/comercio P6 | DG-PAY y factibilidad antes del primer corte que implemente pagos/provisión, normalmente P3; sandbox antes integrar; alta comercial antes uso real. Riesgo de inviabilidad comercial aceptado explícitamente si se adelanta L1 |
| Q-08 · A/C | Integridad/revocación/purga después de restore L1.8; B2 no usado por ese arnés | Aprobar contrato de copia/journal/restore sintéticos; proveedor/credenciales/lock antes de conectar destino | Fixture y restore local no necesitan bucket ni governance | DEP-D2/DG-MIGRATION P0-C; acceso antes egreso | Mantener diseño previo a L1.8; selección/configuración B2 antes de su primer uso, no diferir la seguridad de recuperación |
| Q-11 · A/B | Cadena reproducible, herramientas, fuente de prueba; todos, build L1.7 | Aceptar ENG y acreditar pins/seguridad/arquitectura de lo que se va a ejecutar | Revisión documental, inventario dirigido y evidencia local actual | P0-D/Development/Integration Gate | Runtime/tooling del lote fijados antes de implementación; binarios de cada prueba antes de usarla. Ningún pin inventado o advisory ignorado |
| Q-18 · A/C/D | Total fiscal, comprobantes, garantías y conservación; no venta/factura/purga real en L1 | Para L1: fixture etiquetado no fiscal/no contractual; criterio externo antes de lógica dependiente | Datos ficticios y credenciales no requieren liquidar ITBIS | Regla P0-B/DG-PAY; Legal Gate P6 | Criterio antes del primer corte de impuestos/comprobantes/garantía/purga dependiente, incluso P2 si aplica; nunca aplazarlo automáticamente a P6 |
| Q-23 · B/D | Recursos disponibles para ensayo vs viabilidad económica del servicio | Recursos locales/límites aprobados sin gasto para L1; presupuesto antes de adquirir recursos/servicios | Diagnóstico y experimento mínimo con herramientas ya instaladas | DEP-D2/P0-C; antes de gastar | Presupuesto del lote antes de gasto si lo necesita; presupuesto operativo antes de comprometer servicios/lanzamiento. No techoUSD0 impuesto ni gasto inferido |
| Q-31 · A | Login/ámbito/errores y estados seguros del recurso, rutas L1.2/4/6/7 | Aprobar UI/seguridad pertinente al lote; resto de15pantallas sigue contrato candidato | Revisión de contratos/criterios, sin prototipo funcional | Specification/UI Design P0-B/C | Sin rebaja de UX que cambie permisos/consentimiento/recuperación; contrato aplicable antes de cada módulo |
| Q-32 · B | Motor, auth, transacciones, rutas/aislamiento y build; L1.1…8 | Motor/credenciales propios y prueba efectiva; cadena y destino de arquitectura identificados | QA-EXP-02 acredita parte nativa; no necesita cuenta de pasarela/B2 | P0-D/Environment antes del corte | Mantener suficiencia antes del corte; dos API se prueban al implementarlas, ARM64 antes de salida correspondiente. No PASS global por pruebaWindows |
| Q-33 · A | Coherencia de baseline y pendientes con límites, todo L1 | Cierre F14 del alcance de baseline acordado, sin ocultar exclusiones | Revisión puntual y matriz actual; no repetir auditoría desde cero | P0-D tras entradas críticas | Cierre trazable para baseline acotada solo tras aprobar RG-001; conjunto comercial sigue condicionado y no autorizado |
| Q-34 · B/D | Capacidad, coste efectivo y desastre; P1 solo capacidad mínima del entorno | Medir la garantía al necesitarla, sin reclamar capacidad20tenants | Cálculo con hipótesis y muestra acotada actual | P6 o antes si decide diseño | No cambia: full30min debe probar ventana y edadRPO antes de depender; ninguna cargaVPS ahora |
| Q-35 · B/C | Garantías implementadas por corte | Pruebas reales después de implementar con autorización, fuente y SHA | Contrato/criterios sí; funcionamiento no se presupone | P1…P6 según garantía | No cambia; no exigir producto implementado como precondición circular de todo P0 |
| Q-36 · A | Autoridad sobre código, todo L1 | Baseline versionada y autorización expresa separadas | Planificación/evidencia autorizada actuales | P0-D tras F14 | Se conserva en ambas rutas: esta revisión no abre P1 |
| Q-38 · A/C | Avisos/reintentos/moneda/cambios durante gracia/recontratación | Decidir condiciones exactas SUB antes de convertirlas en contrato/código | L1 sin billing ni mensajes reales usa entitlements sintéticos | P0-B/DG-PAY | Antes del primer corte que implemente esas condiciones; normalmente P3, UX monetaria también sujeta al mismo límite |
| Q-39 · C | Correo real, fuera del transporte sintético L1 | Proveedor/destino/datos y autorización de egreso | Bandeja/adaptador local sin envío | Antes del primer egreso real P1/P5 | No cambia; verificaciónemail aprobada no autoriza correoUS |
| Q-40 · A, alternativa opcional | Cambiar únicamente el orden de dependencias, no producto | Aprobar/rechazar RG-001/DEC-053 con riesgos/exclusiones | Seguir ruta completa CP-009 y obtener solicitudes externas | Antes de cambiar cualquier resolve-before | No requisito extra si se conserva la ruta CP-009; ningún gate se considera modificado por su propuesta |

**Conclusión:** el arnés de ocho cortes no consume un contrato comercial de pasarela, impuestos reales o un bucket externo. Sí necesita diseño de seguridad/recuperación, cadena fijada, entorno suficiente, baseline y autorización. El bloqueo global actual por entradas externas sigue vigente hasta decidir RG-001. Aceptar la propuesta no equivale a aprobar Q-02/11/31, contratar, aprobar políticas nuevas, cerrar P0 o empezar código.

## F14 — Revisión histórica global del candidato CP-010

**Revisión actualizada sobre el candidato v0.10-CP010 y contratos completos revisados**, no otra precarga administrativa. [SPECIFICATION_CANDIDATE](../.agentic/SPECIFICATION_CANDIDATE.md) materializa áreas canónicas por secciones y referencias de la misma versión Git; README registra esa composición. La baseline aprobada aún no existe. Se revisan autoridad→regla→modelo/flujo→negativo→gate, no se confunde diseño con implementación.

| ID / criterio | Resultado | Evidencia y carencia localizada | Resolve-before |
|---|---|---|---|
| F14-01 · Autoridad y alcance | PASS | Fuente humana CP-009, DEC039…052 y ampliaciones exactas;17IDs cerrados; propuestas manual/oldplan/cuarentenaordinaria/OCI retiradas, historia conservada | Coherencia actual; cambios futuros mediante autoridad correspondiente |
| F14-02 · Catálogo y dominio | PASS | S-02/04/05, COM/CC/DEM: USD/conteo/eligibilidad/caja/demo coherentes; no impuesto inferido o saldo futuro | Producto candidato; pruebas P2/P3, fiscalidad F14-06 |
| F14-03 · Calendario y eventos | PASS | S-03/SUB: período−7d una vez por episodio, alta inicial sin deducción; mes/año/finmes/frecuencia, duplicados/tardíos/provisión tratados. Detalles nuevosQ-38 explícitos | AceptarQ-38 en P0-B/DG-PAY; integración P3 |
| F14-04 · Autoridad por acción | PASS | S-06/SAAS F1-A/MT/ENG distinguen titular/delegado/POS/operador/custodio; consentimiento del medio de pago separado, permisos enAPI y revocación | Revisión de mecanismosQ-02/31 P0-C; negativosP1/P3/P4 |
| F14-05 · Contrato de pagos suficiente | NOT VERIFIED | Comparativa oficial realizada, CardNET candidato condicional; faltan respuestas/documentos concretos de Q-03 para Edgar/DOPUSD/MIT/calendario/consulta/idempotencia/paquete | DG-PAY P0-C; sandboxP3/comercioP6 no exigidos ahora |
| F14-06 · Fiscalidad y obligaciones | NOT VERIFIED | Mercado/persona confirmados; contexto DGII/ProConsumidor no acredita actividad/régimen/exenciones/garantías/retención obligatoria específicos | Regla fiscal/excepciones P0-B/DG-PAY; términos finales/Legal GateP6 |
| F14-07 · Operación, datos y coste | PASS | S-09/10/15, G-04/05 y SUB separan retención7d de latencia de borrado, tarifas de hipótesis y objetivos de ensayos; destino externo recomendado, presupuesto no aprobado | Selección/revisiónQ-08/23 P0-C; datos/cuentas antes de su egreso; capacidadP6 |
| F14-08 · Diseño técnico aceptado | NOT VERIFIED | Q-02/11/31 revisados completos CP-010 con recomendación favorable y correcciones; aceptar paquete sigue pendiente. DEC-022/023/053 PROPOSED; RG-001 no aplicada | Design/Development Gates, Q-40 antes de cambiar orden |
| F14-09 · Entorno/tooling suficiente | NOT VERIFIED | QA-EXP-02 PASS8 de Mongo8.3Windows/auth/A-B/transacciones y cleanup; faltan cadena/runtime objetivo Linux/ARM64, herramientas de restore y pruebas de dosAPI por corte. ENG-05 acción humana concreta | Q-32/Environment Gate antes de la garantía dependiente; no PASS global |
| F14-10 · Pruebas y roadmap proporcionales | PASS | S-13/14, matrices MT/MC/CC/DEM/SUB/UI/DEP y8cortesP1-L1 preservados; ensayos futuros en sus gates, no90tests nuevos | P1…P6 por garantía, sin exigir SaaS implementado para P0 |
| F14-11 · Referencias y datos derivados | PASS | Quality Gate CP-010: referencias/IDs/tablas/cálculos/historia/hashes, alcance permitido y evidencia experimental sanitizada coherentes; mapa generado y verificado contra siete fuentes. No implica baseline aprobada | Comprobado sobre diff CP-010; revalidar tras cambios |
| F14-12 · Salida posterior a F14: baseline y autorización | NOT VERIFIED | Candidato versionado preparado; Q-36 es paso posterior al cierre de revisión F14 y exige baseline/autorización diferenciadas, no dependencia circular para realizar/cerrar la auditoría | P0-D después de entradas críticas anteriores |

**Resultado F14: PARCIAL, no cerrado.** La revisión se ha hecho y deja localizadas las entradas pendientes; no se marca globalPASS ni se solicita otra auditoría general como sustituto de obtener evidencia. Al resolver una entrada, revisar su impacto/diff y cerrar el criterio correspondiente. Capacidad, restore real, cuentas activas y pruebas funcionales siguen en fases posteriores cuando procede; no usar su ausencia como bloqueo indiscriminado de P0.

**Readiness:** R-01 READY FOR SPECIFICATION conservaPASS de adopción; Specification Gate/Design Gates/READY FOR DEVELOPMENT/READY FOR PRODUCTION siguen NOT VERIFIED. Condiciones pendientes únicas en [PLANNING_STATE](../.agentic/PLANNING_STATE.md), no cuestionario duplicado. Fuente/conteos finales y calidad de referencias se verifican con CP-010.


## F14-L1 — Revisión de coherencia CP-011

**HISTÓRICO:** resultados documentales de CP-011 sobre v0.1. No se transfieren a v0.2/SQL/operación independiente. La revisión actual y estados de A/B/entorno están en el bloque CP-012 siguiente.

Objeto único: **P1-L1 v0.1-CP011, S-18/manifiesto selectivo** del candidato v0.11-CP011, sobre Gitbase4b2f272. Revisión contra contratos completos vigentes para delimitar fragmentos, sin volver a comparar proveedores. Resultado documental del lote separado del F14 general CP-010, de entorno y de decisiones A/B.

| ID | Garantía de coherencia revisada | Resultado | Evidencia / límite |
|---|---|---|---|
| F14-L1-01 | Autoridad y alcance selectivo | PASS | DEC-053 APPROVED solo orden/riesgo; S-18L00/01 delimita los contratos y excluye incorporación transitiva o aprobación general |
| F14-L1-02 | Dependencias sin círculo | PASS | L1.1prepara arnés, L1.2autoridad, L1.3conexión, L1.4recurso interno, L1.5admisión; recorrido final verifica autoridad→admisión→préstamo. Reloj bootstrap privado; no exige API inexistente antes de implementar |
| F14-L1-03 | Autorización previa al dato | PASS | Sesión/propósito/identidad/membresía/acción/directorio/época; negativas y frontera posterior al ack majority, sin fallback/cache de permiso antigua |
| F14-L1-04 | Empresa/demo/operador y fixture seguro | PASS | Sesiones de propósito válidas para negativas; arnés externo y no distribuido, destinos/cuentas propios; no paid=true ni variable/header de bypass o writers legacy |
| F14-L1-05 | Conexiones/admisión/trabajo incierto | PASS | Pools/préstamos/ventanas/carriles/tickets/reloj/fence/CAS precisos; dosAPI como salida real L1.5, sin liberar por TTL o perder deuda al reducir/restaurar |
| F14-L1-06 | Recuperación sin resurrección | PASS | L1.8dump/oplog/journal posterior independiente, generaciones/canarios/hueco fail-closed; no B2 ni RPO/RTO productivos acreditados |
| F14-L1-07 | Datos/interacciones proporcionales | PASS | DTO _id/sku/name, lectura paginada; login/contexto/catálogo/errores/UI por corte, sin importar quincepantallas ni caja/pagos |
| F14-L1-08 | Runtime/herramientas y fuentes | PASS | Node24.21/npm11.9/Mongo7/locks conservados; pins publicadosSRC107…112, adquisición/seguridad pendientes explícitas por herramienta; ningún diagnóstico8.3 convertido en objetivo |
| F14-L1-09 | Diseño→prueba→entorno | PASS | MatrizL06/L07: requisitos antes del uso, aceptación funcional después de construir. x64 no acreditaARM64; salida ARM64 L1.7/P1 conservada, no precondición global para todo corte |
| F14-L1-10 | Ausencia de producto comercial indirecto | PASS | Sin Subscription/pagos/fiscalidad/escritoresPOS/alta real/egresos; jobs/polls de prueba son lecturas sintéticas. Q03/18/38 antes de dominio dependiente, no relegadas aP6 |
| F14-L1-11 | Riesgo/reversión/trazabilidad | PASS | SHA/blobs CP010 y versión/S18/checkpointCP011; rollback compatible y cleanup exacto, ocho resultados conservados y riesgoRG001 aceptado |
| F14-L1-12 | Documentos/IDs/mapa | PASS | Quality Gate CP011: referencias/tablas/IDs/hashes/blobs/historia/alcance y mapa comprobados; enlaces históricos reparados, sin ensayos repetidos |

**Resultado de coherencia del lote: PASS.** Doce criterios documentales revisados y comprobados, sin hallazgos materiales abiertos; candidato listo para presentar A. No se pospone la aprobación humana dentro de una supuesta revisión técnica interminable; tampoco se declara aprobado el diseño.

| Gate distinto | Estado actual | Acción / momento |
|---|---|---|
| Coherencia F14-L1 | PASS | Revisión sustantiva y Quality Gate documental completados; no entorno/aprobación implícitos |
| A · Specification/Design del fragmento | NOT VERIFIED | Edgar aprueba/corrige versión exacta después de coherencia; incluye únicamente mecanismos S-18 de Q02/11/31 y restore sintético |
| B · Autorización de implementación | NOT VERIFIED | Decisión separada; efectiva solo con baselineA y Development/entorno suficientes del corte |
| Entorno/Q32 y adquisición | NOT VERIFIED | WSL no instalado/Docker no disponible; activar por Edgar, verificar endpoint/engine/runtime/pins/recursos antes de uso. Sin aceptar condiciones/instalar aquí |
| Salidas funcionales L1.1…8 | NOT VERIFIED | Se implementan y prueban después de A/B/entrada; dosAPI/restore no son requisito circular previo |
| F14/Readiness SaaS general | PARCIAL / NOT VERIFIED | Dependencias comerciales/externas/de otros módulos siguen abiertas con su resolve-before |

### Secuencia de trabajo habilitada tras revisión

Ahora se puede revisar y decidir A y B diferenciadas sobre el checkpoint limitado; no nuevos interrogatorios de precios/pagos/demo. El agente continúa adquisición/validación del entorno cuando exista autorización/disponibilidad suficiente; no instala nada global ni acepta condiciones en nombre de Edgar. Solo después de verificar entradas puede comenzar el corte autorizado, registrando transición de fase sin declarar P0 global completa por extensión.


## F14-L1 — Revisión de coherencia CP-012

Objeto: **P1-L1 v0.2-CP012/S-18/manifiesto**, base Git bf28c453; revisión del impacto SQL/operación independiente y decisión directa del 12 de octubre. No hereda PASS CP-011. Resultado técnico documental separado del Quality Gate, A, B condicional, entorno y funcionamiento.

| ID | Garantía revisada | Resultado | Evidencia / límite |
|---|---|---|---|
| F14-L1-01 | Autoridad y alcance | PASS | DEC-021/054…057; A limitada pendiente, B condicional actual, Compose propuesto, sin incorporación transitiva de Mongo |
| F14-L1-02 | Dependencias sin círculo | PASS | Mismos ocho cortes, bootstrap privado y pruebas después de construir; sin exigir contratos comerciales globales |
| F14-L1-03 | Autorización previa al dato | PASS | Registro SID autoritativo impide resurrección por save tardío/logout/rotación; READ COMMITTED trasCOMMIT, límite de operaciones previas explícito |
| F14-L1-04 | Propósitos y permisos DB | PASS | Sesiones válidas en negativas, DB/rol propio, propietario NOLOGIN/HBA/grants; sin fallback, privilegios públicos o secretos ajenos |
| F14-L1-05 | Pools y admisión SQL | PASS | Hasta 38 conexiones propuestas; dos API, SERIALIZABLE/mismo client, fence físicamente versionado por tick, snapshot viejo exige40001, rolAPI no cambia tiempo; reintento/deuda/COMMIT incierto |
| F14-L1-06 | Recuperación multiDB | PASS | Barrera durable antes de backup y hasta corte impide nuevos consumos; cluster físico/WAL/verify, journal restrictivo/generación; no pg_dump global ni cross-DB |
| F14-L1-07 | Datos y UI limitados | PASS | UUID/id/sku/name sin precio/fiscalidad; interfaces mínimas, radios cero y accesibilidad; NCF/e-CF fuera de L1 y dentro de SaaS |
| F14-L1-08 | Runtime y fuentes | PASS | PostgreSQL18.6/pg8.23.1/store10.0.0 candidatos publicados; versiones/digests/seguridad antes de uso, ninguna instalación |
| F14-L1-09 | Entorno y pruebas | PASS | QA VPS condicional, límites/adquisición antes de uso; snapshot no demuestra capacidad, ARM64 real antes de aceptar su salida |
| F14-L1-10 | Ciclo independiente y convivencia | PASS | Compose/web/API/worker/PG propios; QA loopback+túnel sin 80/443/proxy global; integración futura requiere autorización |
| F14-L1-11 | Trazabilidad y reversión | PASS | CP-011 preservado en Git; release/digest/config/DB compatibles, rollback propio sin reset ni recursos ajenos |
| F14-L1-12 | Documentos/IDs/mapa | PASS | Quality Gate integrado:24archivos/20Markdown,192referencias/148tablas, historia/contratos/IDs/hashes/mapa coherentes; no acredita producto |

**F14-L1 de coherencia PASS:12criterios revisados y Quality Gate integrado superado.** Las discrepancias de SQL y despliegue se resolvieron en S-18. A se refiere a esta versión exacta; no depende de una aplicación ya implementada. F14 general no está cerrado.

| Gate distinto | Estado | Momento / siguiente acción |
|---|---|---|
| Coherencia F14-L1 | PASS | Revisión independiente y QG integrados; fence SQL, logout concurrente y barrera de restore corregidos documentalmente |
| A · baseline limitada | NOT VERIFIED | Aceptar v0.2-CP012/S-18/manifiesto/ocho cortes por SHA tras coherencia; no paquetes Mongo o SaaS general |
| Registro de B condicional | PASS | Fuente del 12 de octubre/DEC-057; ejecutar con A, Development y Environment satisfechos, sin volver a solicitar B |
| Entorno/Q32 | NOT VERIFIED | Host/Docker detectados no son PostgreSQL Mecanet ni capacidad; verificar pins, recursos propios, egreso y límites por uso |
| Salidas L1.1…8 | NOT VERIFIED | SQL/dos API/browser/restore sobre SHA implementado, ninguna herencia de Mongo |
| SaaS general | PARCIAL / NOT VERIFIED | Dependencias comerciales, externas, fiscales y otras áreas conservan su resolve-before |

## Plan aprobado en CP-012 — P1-L1 (estado histórico anterior a DEC-058)

**Resultado:** identidad vigente → empresa autorizada → catálogo ficticio PostgreSQL A/B, separado de demo/operador; admisión durable entre dos API, observación mínima, ciclo independiente y recuperación sintética. Ocho cortes interiores de P1, no ocho fases/PR/checkpoints.

**Entrada común:** S-18 v0.2-CP012 aprobado como A, B condicional vigente y Development/Environment por corte. Q-02/11/31 son solo los fragmentos incorporados; no requieren el SaaS comercial completo. PostgreSQL, pins, seguridad, credenciales y límites antes del uso. QA propia en VPS posible tras acreditar recursos y aislamiento; no tocar recursos compartidos, Atlas, datos reales o secretos heredados. Dos API y restore se construyen como salidas; ARM64 real antes de aceptar L1.7/P1. CP-0108PASS y F14 CP-011 no prueban la nueva arquitectura.

**Exposición:** arnés privado sin clientes ni rutas públicas parciales hasta aprobar las ocho salidas. Identidad, aislamiento y admisión son garantías complementarias; una no compensa otra. Después solo se habilita la QA prevista, no producción.

| Corte / resultado | Dependencias y módulos candidatos | Entrada → salida verificable | Entorno / reversión |
|---|---|---|---|
| P1-L1.1 · Fixture y arnés | Preflight/fixture SQL/harness privados, A/B/demo/operador; capacidad para dos API todavía no construidas | Destinos/credenciales/egreso antes de I/O → canarios, cleanup y reproducibilidad; destino/secreto indebido aborta | Cluster PostgreSQL propio, sin publicación. Retirar solo IDs propios, no prune/reset global |
| P1-L1.2 · Identidad y revocación | L1.1; repositorios centrales/sesión/autoridad, sin recurso empresarial | Contrato A → logout/rotación contra save tardío en dosAPI, expiración/revocación/propósito/acción, tenant/rol forjado, no herencia/redelegación, denegación tras COMMIT y caída central | Arnés privado/fallos, READ COMMITTED real. Cerrar admisión y revertir compatible, sin fallback heredado |
| P1-L1.3 · Credenciales y pools | L1.1/2; roles por DB, propietario NOLOGIN, gestor de pools y secretos | Roles/cotas aceptados → A/B/control/admin rechazados por SQL/HBA; concurrencia/rotación/evicción respetan préstamos y cotas sin fallback | PostgreSQL QA/dos procesos/conexiones medidas. Drenar sin conceder privilegios |
| P1-L1.4 · Lectura autorizada | L1.2/3; repositorio/ruta SQL y cliente mínimo; sin escritores POS | Identidad/pool verificados → cero dato ajeno ante path/body/header/ID/inyección; sesiones demo/operador válidas denegadas; paginación/cache/tardías seguras | QA A/B/demo/operador con DB consultada acreditada. Retirar ruta si falla |
| P1-L1.5 · Admisión durable | L1.2/3/4; políticas/ventanas/tickets/reloj/fence, dos API reales | Contrato SQL → último cupo/ráfaga/ventana/retry/poll/job; snapshot previo a tick/fence versionado y rol API sin escritura de tiempo; reinicio/40001/deadlock/COMMIT incierto/reducción sin liberar falsamente; CAS/audit/permiso atómicos | SQL central/reloj/fallos acotados. Cerrar y reconciliar por ID, nunca liberar por TTL |
| P1-L1.6 · Observación mínima | L1.2/3/5; productor/proyección allowlist/redacción, sin panel o Sentry | Roles/fuentes → sin contenido/secreto, calidad/asOf/ámbito, credencial de medición sin negocio/cuotas y buffers finitos | QA aislada/función SQL revisada; sin pg_monitor/socket. Detener colección y conservar evidencia sanitizada |
| P1-L1.7 · Rutas y ciclo independiente | L1.4/5/6; Nginx/Compose propios, entrypoint/health/browser | Empaquetado/origen A + entorno → API JSON/SPA/TLS/CSRF/readiness/drenaje, UI cuadrada/accesible y artefacto por digest/ARM64 real | QA privada/VPS condicional/túnel sin proxy global. Rollback compatible solo del proyecto propio |
| P1-L1.8 · Restore sintético | L1.1…7; pg_basebackup/verify/replay/manifiesto/journal/canarios | Barrera antes de backup hasta corte, negativa de admisión/consumo posterior; segundo destino/WAL/espacio/límites → cohorte/roles/índices/referencias/revocaciones/tombstones/generación; hueco/incertidumbre bloquean reapertura; negativas afectadas | Segundo cluster propio/egreso cerrado, sin sobrescribir origen. Retirar restore fallido, conservar copia íntegra; no capacidad productiva |

Revisiones internas tras L1.3 antes de consulta y tras L1.6 antes de ciclo/restore; mismos ocho resultados. Dividir tareas si superan cinco unidades sin esconderlas bajo PASS genérico. **Matrices funcionales: todas NOT VERIFIED** hasta ejecutar sobre SHA, fecha, entorno, actor/destino, esperado/observado y provenance. No trasladar caracterización o fixtures Mongo a SQL.

Reversión común: cerrar admisión, drenar/reconciliar, usar artefacto/config/esquema compatibles, conservar operaciones/journal/deuda. Incompatibilidad requiere forward fix o migración ensayada, nunca downgrade ciego/limpieza. Compose no aporta rollback automático. L1 no cierra toda P1 ni prueba HA, capacidad o RPO/RTO; garantías restantes según roadmap.

## Punto histórico de reanudación CP-012

Aprobar/corregir A sobre versión limitada después del QG; B condicional ya existe. Acreditar cadena de ejecución/build/PostgreSQL QA y controles por corte; usar VPS propio solo si satisface entorno sin alterar terceros. Después registrar P1 e implementar/verificar los ocho cortes, sin otra ronda comercial. Proxy compartido requiere permiso específico cuando se decida utilizarlo; QA loopback evita esa dependencia. No instalaciones, código o recursos creados en esta actualización documental.

## Ejecución histórica CP-013 — P1-L1 en curso

DEC-058 hace efectiva A/B al acreditar entrada. Se implementaron los ocho cortes: **3 salidas PASS acotadas y5 PARCIALES**, lote no cerrado. [Auditoría](../docs/audit/CP-013.md) separa versiones, pruebas reales, dobles y límites.

| Corte | Implementación | Verificación de salida | Evidencia / límite |
|---|---|---|---|
| L1.1 | Implementada | PASS acotado | Fixture exclusiva/preflight/roles/canarios/cleanup propio; datos sintéticos preservados explícitamente |
| L1.2 | Implementada | NOT VERIFIED / PARCIAL | SQL11 y HTTPlogout pasan; faltan carreras logout/rotación/save tardío entre dos API y fallo registro/store/cookie |
| L1.3 | Implementada | PASS acotado | Dos procesos reales,4conexiones TLS medidas, límites/préstamos/evicción/rotación de descriptor; cambio real de clave probado en restore |
| L1.4 | Implementada | NOT VERIFIED / PARCIAL | Lectura/DTO/A-B/UI pasan; demo/operador denegados en autoridad SQL pero falta HTTP con cookie/store estándar válidos por propósito |
| L1.5 | Implementada | NOT VERIFIED / PARCIAL | Tick601/deadlock/snapshot/reducción/CAS/ACK perdido probados; falta último cupo/ledger controlado ligado a ambos procesos HTTP reales; incidente de reloj por diagnosticar |
| L1.6 | Implementada y corregida | NOT VERIFIED / PARCIAL | Productor/grants SQL pasan; delta de generación/discontinuidad tiene8unitariasPASS y no integración del worker/PG posterior |
| L1.7 | Implementada | NOT VERIFIED / PARCIAL | TLS/CSRF/API/SPA/UI/ARM64/readiness pasan; faltan asset ausente404, drenaje acotado con trabajo en vuelo y reversión de release compatible. No se exige OCI propia por inferencia |
| L1.8 | Implementada | PASS acotado | Copia física/WAL/verify, segundo destino, cohorte/replay/canarios/credenciales/sesiones/barrera/cleanup pasan; no reapertura HTTP ni RPO/RTO externo |

QA temporal instalada y probada; al cerrar restore permanece fuente detenida/barrera cerrada, destino retirado, datos/copia/journal privados conservados. No URL activa. Próximo trabajo autorizado: completar arneses de las cinco salidas pendientes y preparar una cohorte privada revisada para integración, sin reabrir la fuente restaurada por simple up ni borrar evidencia. No requiere nuevas decisiones humanas para continuar este lote. Q35 sigue BLOCKING de salida; Q03/18/38/39/41 solo antes del trabajo futuro dependiente.

No build en VPS, infraestructura compartida, DNS, datos reales, pago/emisión fiscal, push o merge. La aprobación no convierte gates globales en PASS.

## Cierre vigente CP-014 — P1-L1 COMPLETADA

Fuente humana: adjunto7cc3bf6b, continuidad de la baseline exacta DEC-058; base real `5624ef0da489d2285534a942bd6ce9eab22f280d`. Los cinco cortes parciales se cerraron mediante pruebas reales y correcciones dentro del lote, sin otra aprobación por corte. La [auditoría CP-014](../docs/audit/CP-014.md) conserva provenance, SHA/artefacto por resultado, RED→fix→GREEN y límites. Los PASS CP-013 no se presentan como pruebas recién ejecutadas.

| Corte | Salida CP-014 | Evidencia / límite |
|---|---|---|
| L1.1 | PASS | Fixture/aislamiento propios CP-013 conservados; cohorte CP-014 nueva, preflight/redes/negativas/retención sin reabrir origen anterior |
| L1.2 | PASS | Dos procesos HTTP/PG, save tardío/logout, rotación concurrente, revocación tras COMMIT, fallos registro/store/cookie, respuesta perdida y rechazo anterior tras reiniciar |
| L1.3 | PASS | Roles/HBA/TLS/pools medidos CP-013 conservados; regresiones focalizadas de plazos/fases de pool y aislamiento CP-014, sin fallback ni ampliación de privilegios |
| L1.4 | PASS | Cookies estándar empresa/demo/operador válidas, negativas path/body/header/ID antes del pool indebido y DTO sin datos ajenos |
| L1.5 | PASS | Último cupo y QH/QC/QT entre dos API HTTP, retry/timeout/respuesta perdida/reinicio/relevo, deuda retenida hasta prueba de fin y conciliación contra ledger compartido; costes/conflictos medidos sin afirmar capacidad |
| L1.6 | PASS | Worker/PG reiniciados, source_id/generation/discontinuidad inicial, calidad/asOf, allowlist/grants y buffer finito con fallo SQL real; sin CPU/RAM exacta por tenant |
| L1.7 | PASS | Asset 404/API JSON, dos puntos de operación/respuesta en vuelo con drenaje ≤30 s y ticket FINISHED, despliegue/rollback F→A→F por digest con sesión/datos/generación/salud conservados |
| L1.8 | PASS acotado conservado | Restore sintético cerrado CP-013: copia/WAL/verify/replay/canarios/credenciales/barrera; no repetido al no invalidarse su evidencia, sin reapertura productiva ni RPO/RTO externos |

Código final F `b0f5e199e5df457d7f901ff3a3dca5ab3a8d5701`; artefacto `sha256:5950ae7e519170ebaaf6cf8c99e9187c14b41f32779044e2829e8de5abbac0a6`. Esta identificación no absorbe suites previas de versiones B…E: la auditoría registra qué delta final afecta cada garantía y su regresión correspondiente.

**Siguiente paso habilitado:** revisión e integración local del lote conforme al Integration Gate. PR, CI remoto y merge permanecen NOT VERIFIED; no se ejecutan por extensión. Antes de comenzar otro lote, acreditar su baseline/gates y autorización correspondientes. P1 permanece EN CURSO y P2 no empieza por el cierre de L1.

**QA final:** cinco servicios CP-014 detenidos/KEEP, artefactos/datos/redes privados retenidos, túnel 18443 cerrado y sin URL activa. Los cinco servicios CP-013 siguen detenidos con barrera cerrada; backup/journal/destino conservados. [Inventario final](../docs/evidence/cp014/final-infrastructure.json). [Runbook de reanudación CP-014](../tests/qa/README.md#reanudar-únicamente-la-cohorte-cp-014): preflight/propiedad/recursos/TLS/egreso→solo PG/salud→worker anterior exited y relevo CAS→recrear API1/2 (.3/.4) y web(.2)→readiness/HTTPS privado. Controlador privado actualizado en `409880a513bee1eff909caf68d23325af55e9be4`, sin cambiar el artefacto F. Nunca `up` general sobre cualquiera de las cohortes, downgrade/secretos ajenos o infraestructura compartida.
