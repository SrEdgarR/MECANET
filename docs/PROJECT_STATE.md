# Estado del proyecto — Mecanet SaaS

Este estado se refiere a la **evolución SaaS**, no invalida la evidencia funcional de la aplicación de un negocio ya publicada. Revisión: 2026-10-13; CP-015 registra integración limpia local y siguiente candidato, sin operaciones remotas. CP-014 conserva **P1-L1 COMPLETADA, ocho salidas PASS acotadas**. P1 continúa como única fase activa; CP-001…013 conservan su evidencia y alcance históricos.

## Estado global

| Campo | Valor |
|---|---|
| project | Mecanet SaaS |
| active_phase | P1 |
| active_phase_name | Fundación aislada y operable |
| status | EN CURSO |
| last_updated | 2026-10-13 |
| next_gate | Resolver Q-42 seguridad de publicación y Q-43 auditoría completa; después PR/review/CI/merge/CI canónica. P1-L2 solo candidato independiente pendiente de A/B |
| readiness_scope | P1-L1 v0.2-CP012/S-18/L-01 APPROVED por DEC-058; Development y Environment acreditados para QA limitada. SaaS general NOT APPROVED |
| progress_basis | Estado cualitativo, sin porcentaje. P1-L1 COMPLETADA con ocho salidas PASS y trazabilidad por suite; esto no cierra P1 general ni el SaaS |
| implementation | P1-L1 COMPLETADA: ocho cortes privados PostgreSQL/React/Express; P1 general EN CURSO, sin funcionalidad comercial pública |
| current_checkpoint | CP-015 |
| hosting_target | CONFIRMED DEC-021/SC-005: VPS existente, operación propia independiente de Coolify; PostgreSQL DEC-054. Dominio futuro mecanet.app DEC-059/SC-007 |
| hosting_execution | Cohorte CP-014 privada instalada y probada con Compose, PostgreSQL18.6 ARM64, dos API, worker y Nginx; sin puertos públicos. Cinco contenedores propios STOPPED al cierre, sin URL activa; aislamiento y diez consumidores ajenos preservados. Inventario/cleanup en auditoría CP-014; fuente CP-013 cerrada y hashes preservados |

## Readiness

| ID | Gate | Estado | Evidencia / pendiente |
|---|---|---|---|
| R-01 | READY FOR SPECIFICATION | PASS | Adopción y dirección registradas; no cierre de especificación general |
| R-02 | Specification Gate del lote | PASS | DEC-058, S-18/L-01/ocho cortes al SHA3b387b3; el resto del candidato no se aprueba por extensión |
| R-03 | Design Gates del lote | PASS | A humana exacta incluye PostgreSQL y operación propia limitada; integración pública compartida pendiente |
| R-04 | READY FOR DEVELOPMENT limitado | PASS | Baseline A, B y QA explícitas; preflight, cadena Node24.21/PG18.6, cuotas, secretos y redes propios acreditados antes del uso |
| R-05 | READY FOR PRODUCTION | NOT VERIFIED | No producto SaaS completo, pagos/fiscalidad, capacidad, custodia externa, operación ni autorización de corte públicos |

## Trazabilidad

| Campo | Valor |
|---|---|
| base_sha | 010aab670c638d168c971df3e3e53b97e72ff443, base limpia de integración; fuente CP-014 9fcdd9540848edbbdef1cfc94667491c9ab2ba92 preservada |
| research_head_sha | 9fcdd9540848edbbdef1cfc94667491c9ab2ba92; lectura focalizada sin reinventariar el VPS |
| tested_code_sha | a89cc2eee43a8f60f3464bea26a6ea4f9ddfc867 — regresión local CI de integración; objetos SaaS/arnés y bundle idénticos a CP-014, evidencia PG/ARM64/browser/restore conservada con sus SHA |
| qa_controller_sha | 409880a513bee1eff909caf68d23325af55e9be4; normalización del inventario ajeno y regresión del controlador QA, sin cambio del artefacto F desplegado/probado |
| experimental_test_reference | CP-006/010 históricos no repetidos ni atribuidos a PostgreSQL; las90 pruebas Mongo f5afaa2 no prueban este lote |
| HEAD | Resolver git rev-parse HEAD en cada worktree; checkpoint final no se escribe en su propio commit |
| checkpoint_sha | CP-014 9fcdd9540848edbbdef1cfc94667491c9ab2ba92; CP-015 documental final identificado en informe externo/Git |
| approved_head_sha | 3b387b38784907b67e2209a35c3d5f400d70742e, solamente S-18/manifiestoL-01/ocho cortes por DEC-058 |
| merge_sha | Ninguno: no push, PR nuevo, merge o CI remoto por safety gate pendiente |
| current_main_baseline_sha | 010aab670c638d168c971df3e3e53b97e72ff443 — develop remoto consultado CP-015, sin cambio |
| next_phase_base_sha | No definido: Integration Gate pendiente; a89cc2eee43a8f60f3464bea26a6ea4f9ddfc867 es candidato local, no baseline canónica fusionada |
| local_branch | codex/integrate-p1-l1 preparada en worktree propio; codex/saas-discovery conserva fuente y planificación siguiente |
| remote_branch | Sin rama SaaS publicada; codex/deploy-vercel-coolify y PR #1 intactos |
| worktree | Primario fuente/planning y C:/Users/thede/.codex/worktrees/p1l1-integration/MECANET-develop; .kilo/worktrees/majestic-chiller conservado |
| integration_target | develop 010aab670c638d168c971df3e3e53b97e72ff443; PR exacto L1 preparado localmente, sin candidato siguiente mezclado |
| CI | Workflow propio sin deploy/secrets, regresión local PASS y auditoría runtime PASS; audit frontend completo FAIL por tooling heredado. CI PR/canónica NOT VERIFIED |

## UI actual

| ID | Módulo | Fidelidad | Verificación | Preview | Evidencia |
|---|---|---|---|---|---|
| UI-01 | Landing pública existente | IMPLEMENTED | VERIFIED: carga y contenido; no auditoría responsive/a11y completa | evidence/ui/current-public.jpg | E-06 · REMOTE · 2026-10-07 |
| UI-02 | Dashboard POS de un negocio | IMPLEMENTED | VERIFIED: sesión existente y carga sin errores; no prueba de todos los flujos | evidence/ui/current-app.jpg | E-06 · REMOTE · 2026-10-07 |
| UI-03 | Resto de módulos POS | IMPLEMENTED | NOT VERIFIED de extremo a extremo en CP-001 | — | E-02 código; tests aislados E-04 |
| UI-04 | Landing con planes y checkout | PENDING | NOT VERIFIED; no implementada | — | SAAS_DISCOVERY |
| UI-05 | Panel operador multiempresa | PENDING | NOT VERIFIED; no implementado | — | SAAS_DISCOVERY |
| UI-06 | Suscripción/autoservicio | PENDING | NOT VERIFIED; no implementado | — | SAAS_DISCOVERY |
| UI-07 | Demo gratuita limitada | PENDING | NOT VERIFIED; registro/email/1activa/3inicios24h/30min/10-5-10 confirmados; mecanismo comercial no implementado | — | DEC-025/027; SAAS_DISCOVERY |
| UI-08 | Login, empresa y catálogo QA ficticio | IMPLEMENTED | VERIFIED limitado: browser15 en CP-014/C, 320/768/1440, teclado/foco, radio0, tema, texto200% y reduced-motion; reintentos/deadlines con regresión local, sin auditoría a11y completa | evidence/cp014/catalog-1440.png | CP-014 · LOCAL + REMOTE · Ce25a9f3; frontend idéntico D/E/F |

Objetivo CONFIRMED DEC-055: UI totalmente cuadrada, sin bordes redondeados; NCF/e-CF CONFIRMED DEC-056 en el alcance SaaS. La UI mínima privada de L1 sí está implementada; NCF/e-CF continúan fuera del lote. Sistema visual heredado DETECTED: landing CSS estático; POS React/Tailwind, estilos glass y temas claro/oscuro. UI Q-31 completa como candidata, sin diseño SaaS aprobado. Responsive y reduced motion verificados solo para UI-08; accesibilidad completa y resto de producto NOT VERIFIED. El mapa documental tiene su propia verificación, separada de la UI del producto.

## Resultado histórico CP-011

**RG-001/DEC-053 APPROVED y aplicado**, fuente humana directa adjunto51b8e835-d246-41a7-8f4c-f54901984f96/Texto pegado.txt. Acepta orden limitado y riesgo de ajustes comerciales posteriores; no baseline/implementación/paquetes completos/proveedores/políticas/gastos. Q-40 resuelta sin otra DEC.53decisiones:48APPROVED,2PROPOSED,3SUPERSEDED.

**Candidato limitado listo para revisión:** [S-18 P1-L1 v0.1-CP011](../.agentic/SPECIFICATION_CANDIDATE.md#s-18--candidato-limitado-p1-l1-v01-cp011), dentro del contenedor general v0.11-CP011, ambos NOT APPROVED. Manifiesto selectivo contra Git4b2f272, sin incorporación transitiva del resto del SaaS. Ocho cortes conservados: identidad→empresa→catálogo ficticio, conexiones/admisión entre dosAPI/observación local/rutas/restore sintético. Sin pagos/fiscalidad/escritoresPOS/servicios reales ni bypass para empresas reales.

**F14-L1 de coherencia PASS y Quality Gate PASS:** candidato limitado listo para presentar A/B. F14 global sigue PARCIAL. A aprueba únicamente versión/fragments del lote; B autoriza implementación futura solo con gates/entorno del corte satisfechos. Ninguna registrada por anticipado. No se exige antes de implementar que funciones aún inexistentes pasen sus pruebas.

**Entorno CP-011 LOCAL:** comprobación dirigida2026-10-08: wsl.exe está presente pero --status informa no instalado(exit1); Docker no encontrado en PATH/ubicacionesProgramFiles/usuario, sin procesos/servicio. No endpointLinux efectivo acreditado ni daemon externo contactado. Acción humana mínima: habilitar/instalar WSL2 y Docker Desktop Linux, aceptar condiciones y completar reinicio si corresponde; agente valida endpointlocal/engine/versiones/recursos después. Sin instalación, aceptación, reinicio ni experimento nuevo ahora.

**Historia reutilizada:** QA-EXP-02 CP-010, Mongo8.3.11Windowsx64/Node24.14/driver6.20,8PASS ycleanup. No targetMongo7.0.43/Node24.21/LinuxARM64, integraciónMecanet/dosAPI/restore demostrados.90tests f5afaa2 yCP-006 no se repitieron. Sin nuevo tested_code_sha.

**14pendientes:5BLOCKING de entrada L1 y9FUTURE con límites;5humanas/4diseños/3evidencias/2externas.** Q02/11/31 pertinentes quedan dentro de decisiónA, Q36 separaA/B yQ32 entorno. Q33 global conserva revisión futura, con lote evaluado separadamente. Q03/38 antes de código/publicación dependientes, Q18 posibleP2, Q08/39 antes de egreso, Q23 antes de gasto, Q34/35 medición y salidas por fase. Ninguno se convierte enNOTAPPLICABLE por estar fuera deL1.

Recursos/infraestructura creados o modificados: **ninguno**, tampoco instancia temporal nueva. Sin código funcional/configuración ejecutable/dependencias/secretos/datos reales, cambiosremotos, gasto, cuenta/contacto/envío,push/merge/CI/despliegue. Producción/Nexora/otrasapps/worktreeprevio yPrompt conservados.

Siguiente paso: revisar el checkpoint limitado y resolver juntas pero diferenciadas **A**(especificación exacta) y **B**(implementación condicionada); acreditar entorno antes del trabajo dependiente. No repetir cuestionario comercial o diagnóstico/prueba ya resueltos sin cambio concreto.

## Resultado histórico CP-012

SC-005/DEC-021 elimina a Coolify de la administración de Mecanet; SC-006/DEC-054 sustituye motor por PostgreSQL conservando separación/mínimo privilegio de DEC-012. DEC-055/056 confirman UI cuadrada y NCF/e-CF con fuente humana actual, sin fecha histórica inventada. DEC-057 registra B condicional y posible QA aislada; A del diseño adaptado no concedida. 57 decisiones:52APPROVED/2PROPOSED/3SUPERSEDED; Compose/origen propuestos.

[S-18 P1-L1 v0.2-CP012](../.agentic/SPECIFICATION_CANDIDATE.md#s-18--candidato-limitado-p1-l1-v02-cp012), contenedor v0.12, reemplaza la propuesta Mongo. Ocho cortes preservados. Diseño relacional/recuperación/operación propia concretos; ningún PASS de Mongo o Coolify transferido. F14-L1 de coherencia PASS en12criterios tras revisión independiente y QG, separado de A, entorno y readiness global.

[Entorno CP-012](evidence/CP-012-environment.json): VPS Ubuntu24.04.5/ARM64, Docker29.8.1/Compose5.5.1,2CPU,11925MiB RAM,8397MiB disponible y133GiB libres en snapshot. Diez contenedores existentes; Traefik3.6 ocupa80/443, PostgreSQL15 corresponde a Coolify y no se reutiliza. Recursos casi todos sin cuotas; snapshot no acredita capacidad. Firewall leído: UFW ausente, cadenas Docker y políticas IPv4/IPv6 separadas; NSG/alcance externo/aislamiento QA no verificados. Volúmenes/reinicio/persistencia observados; backups no leídos ni recuperación probada. Ningún recurso Mecanet-EAK inequívocamente identificado: todos preservados.

Local: Docker/psql no disponibles en búsqueda dirigida, WSL no instalado, Node24.14. QA remoto privado es alternativa autorizada bajo gates; no se impone instalación Windows ni se usa el PostgreSQL compartido como sustituto. Propuesta QA por127.0.0.1:18443/túnelSSH/TLSpropio, redes/volúmenes/credenciales propios. HTTPS de dominio futuro exige integración específica con proxy y permiso aparte, no la administración de deployments por Coolify.

15 pendientes:5BLOCKING/10FUTURE. Q36 conserva solo A como aprobación de entrada pendiente; B condicional documentada. Q41 localiza permiso/integración HTTPS compartida antes de modificarla, no bloqueo del QA por túnel. Q02/11/31 quedan en A, Q32 acredita entorno por corte. Q18 conserva NCF/e-CF en alcance y debe resolver detalles antes del primer código fiscal; demás comerciales/externos mantienen sus límites.

Código realmente implementado: ninguno. Pruebas PostgreSQL/integración/build/restore: ninguna; solo diagnóstico y revisión documental nuevos. Instalación QA: no realizada por falta de A y preflight efectivo. Recursos de infraestructura creados/modificados: ninguno. Producción/Nexora/Mecanet-EAK, secretos/datos y Prompt intactos. Próximo paso: aprobar candidato exacto; B ya recibida permite avanzar al preflight y corte cuando gates se acrediten. No repetir descubrimiento ni pedir de nuevo decisiones de producto.

## Resultado histórico CP-013

**Ocho cortes implementados; tres salidas verificadas y cinco parciales.** P1 única activa; P0 general PARCIAL, SaaS general NOT APPROVED. Los conteos de tests no sustituyen contratos de salida. [Auditoría completa](audit/CP-013.md) y [operación QA](../tests/qa/README.md).

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

QA Compose independiente:5contenedores propios, dos redes aisladas, límite runtime0,95CPU/1568MiB; sin TCP remoto/publish PostgreSQL ni acceso a redes ajenas en sondeos finitos. Dos API, web y worker se detuvieron antes de copiar. pg_basebackup/pg_verifybackup18.6:73.911.359bytes,2.285archivos,7,197s del paso backup/verificación, no RTO. Restauración en nueva red/almacenamiento con origen detenido; cohorte, dos canarios posteriores, cuatro sesiones antiguas, credenciales y epochs verificados. Barrera permanece cerrada. Contenedor/red destino retirados;5contenedores origen detenidos y datos/copia/journal privados preservados; túnel local cerrado. **No URL QA activa ni servicio público nuevo.**

Evidencia por versión:86a31ef (local46/PG33/UI19/build/HTTP8/browser15 iniciales);1a4e578 (timeout corregido, HTTP8 repetido/pools5; boundary2 por archivo idéntico);b7ed0bf (local50 y recuperación real);2cd4494 (delta observación,8unitarias, sin integración remota). No atribuir pruebas antiguas al último HEAD ni duplicar conteos. La implementación UI no cambió tras el build.

Revisión detectó y corrigió la propiedad de la respuesta en timeout HTTP, custodia previa de claves y orden de parada del mantenimiento. El worker salió tras COMMIT incierto durante pausa humana: readiness503 confirmado, relevo verificado y browser15PASS; causa del fallo de reconciliación no diagnosticada. Un status HTTP previo sin captura sigue desconocido. No se inventa corrección por rerun.

14pendientes únicos:1BLOCKING(Q35 salida) y13FUTURE. No decisión humana nueva imprescindible para continuar L1. Preparar pruebas faltantes/cohorte privada revisada es el próximo trabajo habilitado. No P2, pago, NCF/e-CF, Sentry externo, producción, DNS/proxy, Nexora/Mecanet-EAK, gasto/push/merge. Prompt Maestro intacto.

## Resultado histórico CP-014

**P1-L1 COMPLETADA: ocho salidas PASS acotadas.** [Auditoría CP-014](audit/CP-014.md) registra pruebas, fallos y correcciones por SHA/artefacto/entorno. P1 sigue EN CURSO como única fase activa, P0 general PARCIAL bajo RG-001 y SaaS general NOT APPROVED. No se aprueban otros módulos ni se cierra toda P1.

| Corte | Verificación de salida | Evidencia y límite |
|---|---|---|
| L1.1 | PASS acotado | Fixture/preflight/roles sintéticos CP-013 reutilizados; cohorte CP-014 nueva y exclusiva, sin reabrir la fuente cerrada |
| L1.2 | PASS acotado | HTTP real B/C/D: cookies/stores estándar, logout y rotación concurrentes, save tardío, fallos de emisión/contabilidad, respuesta perdida y SID revocado tras reinicio |
| L1.3 | PASS acotado | Roles/cotas/dos procesos CP-013 conservados; deadline monotónico por fase corregido y regresión de préstamos tardíos, rotación y cierre; lectura real D/E |
| L1.4 | PASS acotado | HTTP D: empresa/demo/operador con sesiones válidas, solicitudes falsificadas denegadas antes del pool y sin datos ajenos; catálogo sintético, sin escritores POS |
| L1.5 | PASS acotado | D/E: último cupo y QH/QC/Qt en cuatro ámbitos, conflicto SERIALIZABLE real, timeout/respuesta perdida conservan UNCERTAIN; prueba de fin runner/SQL/respuesta antes de reconciliar, reinicio de API y relevo de worker sin reset |
| L1.6 | PASS acotado | C: proyección real, fuente/generación/discontinuidad inicial CPU/RSS, calidad/asOf, buffers finitos y mínimos privilegios; reinicio real PG/worker; sin Sentry externo ni CPU exacta por empresa |
| L1.7 | PASS acotado | D: asset404/API JSON404 y drenajes0,929/0,945s con trabajo en vuelo; F→A→F por digest conserva sesión/datos/generación y PostgreSQL; entrada propia privada, no lanzamiento |
| L1.8 | PASS acotado | Restore físico sintético cerrado CP-013 conservado con sus SHA/cohorte/canarios/barrera; no repetido ni atribuido a F, sin RPO/RTO externo acreditado |

La configuración y los arneses evolucionaron entre artefactos; el código funcional D es idéntico en E/F. La evidencia B/C/D/E conserva su provenance y no se presenta como una ejecución completa nueva de F. Se corrigieron emisión implícita de cookie tras fallo, aceptación tardía al deadline, cota de pool por fase, resolución de upstream/IP propios y comparación de consumo compartido. El incidente histórico del worker CP-013 sigue sin causa acreditada: nuevos diagnósticos y relevo correcto no prueban retrospectivamente su causa.

**Integration Gate preparado en local**, con matriz y revisión del lote. PR, CI PR, merge, CI canónica y baseline siguiente siguen NOT VERIFIED; push/merge/CI remoto están prohibidos en esta ejecución. Próximo trabajo habilitado: revisión del checkpoint local y del paquete de integración, sin iniciar P2 ni otro lote.

Registro único: **14 pendientes,0 BLOCKING y14 FUTURE**, manteniendo4diseños/3evidencias/5decisiones humanas/2dependencias externas. Q-35 resuelve únicamente la salida L1 y conserva garantías de fases posteriores. Antes del primer handler sensible del operador/P4 DG-ADMIN debe implementarse y verificarse la reautenticación5min de DEC-045; las negativas por propósito de L1 no la acreditan. Ningún egreso, dominio público, producción, pago, fiscalidad funcional o permiso compartido se autoriza por este cierre.

## Vigencia CP-015 — integración local y continuación independiente

P1-L1 mantiene ocho salidas PASS; **Integration Gate NOT VERIFIED y lote no TERMINAL**. Autorización humana actual admite Git/CI bajo condiciones, sin despliegues. Se traslada a rama limpia desde develop, excluyendo los dos commits del PR #1, con código/arnés idénticos y baseline aprobada preservada mediante SE-002. Dos patches de dependencias cliente (DOMPurify3.4.16 y source-map-js1.2.2) se verifican con regresión y hashes de bundle; no se cambia el producto SaaS ni se instala en QA.

Bloqueo localizado: conector Vercel no expone triggers Git y navegador requiere login; Coolify antiguo tiene auto/preview desactivados. No hay prueba de push/PR/merge seguros. Full audit mantiene5high/2moderate en tooling frontend heredado; no major de Tailwind por efecto lateral ni waiver silenciosa. Runtime backend/client0avisos. Q-42/43 bloquean únicamente integración/remoto, no diseño local.

Siguiente candidato **P1-L2 v0.1-CP015**, en .agentic/NEXT_LOT_CANDIDATE.md de la rama fuente: writers aislados por alta+recepción ficticias, idempotencia/revocación/crecimiento/migración/restore/UI; ajuste P1/P2 SUGGESTED, no A/B ni implementación. Doce salidas futuras NOT VERIFIED. NCF/e-CF mantienen contrato antes del primer código fiscal. QA CP-013/014 conserva STOPPED/KEEP según evidenciaCP014; no se despertó ni reensayó. [Auditoría CP-015](audit/CP-015.md).

Registro vigente:16pendientes,2BLOCKING/14FUTURE;4diseños/5evidencias/5decisiones humanas/2externas. P1únicaactiva, P0PARCIAL, SaaSgeneralNOTAPPROVED. No nueva fase/baseline canónica por copia, tests locales o aprobación funcional histórica.
