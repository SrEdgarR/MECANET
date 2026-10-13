# Tareas de adopción SaaS y P1 limitado

Estado vigente **CP-017 EN CURSO / PRE-INTEGRATION**: P1 única activa; P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. P1-L1 TERMINAL/PR #2; P1-L2 completo v0.2-CP016 APPROVED DEC-061 y B/QA/integración condicionada DEC-062, snapshot ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71. Rama codex/p1-l2, base a0098178fc27467bf4c12da0e97723e0b80ce683. Doce criterios PASS de aceptación limitada local/QA/review/Quality; Integration Gate NOT VERIFIED, P1-L2 NO TERMINAL. Q-35 único BLOCKING de PR/CI/merge/verificación canónica, trece FUTURE. Restore sintético cerrado y cleanup acreditados, sin reapertura. Las casillas T-01…19 y los bloques CP-016 conservan sus estados históricos; la cola CP-017 siguiente es vigente, sin PR/CI/merge nuevo ni producción.

## T-01 — Inventario desde el despliegue existente

- [x] Registrar arquitectura, Git, versiones, consumidores y diferencias frente a SaaS.
- [x] Ejecutar solo pruebas aisladas conocidas; conservar evidencia y límites por SHA.
- [x] Capturar UI real y preservar recursos/cambios ajenos.

Verificación: E-01…E-06, 29 tests Node + 61 frontend, hashes y snapshot de lectura. Dependencias: ninguna. Archivos: INVENTORY, evidencia, PROJECT_STATE. Scope: documental mediano.

## T-02 — Levantamiento de producto y reglas

- [x] Registrar decisiones humanas de empresa/suscripción, sucursales, país, alta, previsión, monedas y preferencia AZUL.
- [x] Registrar foco solo SaaS, presupuesto pendiente y propuesta comercial solicitada; preparar precios/límites para revisión.
- [x] Incorporar CP-006: catálogo DOP/cantidades/15%/prepago, demo registrada/cuotas, arquitectura, caja/crédito y activación aprobados en su alcance.
- [x] CP-009 incorpora conteo/USD/mercado, permisos, calendario automático y retenciones con fuente humana actual.
- [ ] Cerrar fiscalidad/contrato proveedor, condiciones adicionalesQ-38 y revisión final del candidato.
- [x] CP-009 registra retenciones por clase, Sentry y objetivos/custodia de recuperación aprobados.
- [ ] Resolver destino/condiciones externas y conservación obligatoria sin inferir suficiencia jurídica.

Verificación: decisiones independientes APPROVED y criterios de P0-B; fuente de cada respuesta. Dependencia: T-01. Archivos: PLANNING_STATE, SAAS_DISCOVERY, DECISIONS. Scope: documental mediano; continuar por lotes pequeños.

## T-03 — Diseños de riesgo

- [x] Comparar datos compartidos/bases separadas contra el código y el VPS real; registrar condiciones y proyección de índices.
- [ ] Completar DG-TENANT, DG-ADMIN, DG-PAY, DG-MIGRATION y DG-OBS con criterios/contratos verificables.
- [ ] Obtener aprobación explícita del diseño concreto y registrar límites antes de habilitar implementación.

Verificación: matriz por gate, fuentes fechadas, revisión de impacto y aprobación; un documento de proveedor no equivale a integración. Dependencia: T-02 para decisiones afectadas; investigación independiente permitida. Archivos: ARCHITECTURE_OPTIONS, DECISIONS, TECH_DEBT. Scope: subdividir cada Design Gate cuando se complete su entrada.

## T-04 — Checkpoint y mapa local

- [x] Crear documentación viva, índice y copia fiel del Prompt; registrar feedback separado.
- [x] Derivar JSON/vista del mapa desde documentos y verificar filtros, teclado, enlaces y geometría local.
- [x] Revisar coherencia, hashes, alcance del diff y conservar checkpoint Git local (identificado en Git/informe externo, sin push).

Verificación: generación determinista, enlaces locales, informe CP-001, captura del mapa y revisión de cambios; no publicar. Dependencia: T-01 y datos documentales de T-02/T-03. Archivos: CHECKPOINTS, PROJECT_MAP_DATA y project-map. Scope: herramienta documental aislada.

## T-05 — Cierre de planificación

- [x] Preparar candidato versionado con áreas canónicas y ejecutar revisión de coherencia F14 CP-009.
- [ ] Cerrar entradas residuales de F14 y materializar especificación protegida aprobada; revisión realizada no equivale a gate superado.
- [ ] Fijar baseline, runtime/entorno, integración Git y evidencia de todos los gates obligatorios.
- [ ] Obtener aprobación humana y autorización de implementación diferenciadas; solo entonces iniciar P1.

Verificación: P0-B/C/D con matrices y referencias versionadas, no pendientes críticos escondidos. Dependencias: T-02, T-03, T-04. Archivos: specs canónicas registradas en docs/README; dividir por área antes de materializar. Scope: cierre futuro, no ejecutable aún.

## T-06 — SC-001, destino Coolify e impacto (CP-002)

- [x] Recuperar HEAD real 614a74c, estado previo y SHA funcional probado f5afaa2; preservar Prompt/worktree/recursos.
- [x] Registrar DEC-021 APPROVED y sustitución parcial de DEC-009; mantener propuestas de datos y comerciales.
- [x] Inspeccionar stack/metadata VPS; proponer empaquetado/origen mínimos DEC-022/023 y reverse-impact con criterios DEP-D*/DEP-V*.
- [x] Corregir costes/documentos, mantener gates futuros sin bloquear levantamiento independiente y formular hasta tres decisiones humanas.
- [x] Verificar coherencia, referencias, fidelidad, diff y mapa; guardar checkpoint documental local sin push.

Verificación: matriz C-18…C-29 de CHECKPOINTS y auditoría CP-002. Dependencia: instrucción humana actual y CP-001; no depende de carga/restore/deploy real. No repetir los 90 tests ni mover tested_code_sha por documentación. Recursos cloud creados/modificados: ninguno.

## T-07 — Completar lagunas técnicas independientes de P0 (CP-003)

- [x] Comprobar HEAD 973fbf3 y alcance previo; reutilizar CP-002 sin inventario/lectura remota nueva.
- [x] Concretar G-01/G-02: un recurso web, contrato de rutas/configuración, despliegue/rollback y matriz de fronteras por entorno.
- [x] Concretar G-03/G-04: cuatro tipos de consumo, presupuesto/abortos candidatos, paquete recuperable, objetivos y ensayo de consistencia/RPO/RTO.
- [x] Concretar G-05: acciones/campos/fuentes del operador, datos excluidos y diferencia con administración de infraestructura.
- [x] Registrar G-06 y solicitar aclaración del estado de respuestas contradictorias; conservar las tres pendientes, sin bloquear trabajo independiente.
- [x] Validar referencias, estados, alcance del diff y datos del mapa; cerrar un checkpoint documental sustantivo sin push.

Verificación: matriz CP-003 C-30…C-41. Dependencia: estado recuperado y autorización de planificación; aprobación y pruebas funcionales futuras siguen NOT VERIFIED. No crear specs finales equivalentes, ejecutar builds/cargas/restore ni tocar infraestructura. El siguiente trabajo permitido es revisar borrador/decisiones, amenazas/índices/pools y carga objetivo; no repetir este diseño sin una laguna nueva.

## T-08 — Dirección comercial confirmada y diseño de condiciones (CP-004)

- [x] Comprobar HEAD cbb16ce/estado/origen/worktree y reutilizar CP-003; preservar cambios ajenos.
- [x] Registrar DEC-020/024/025 APPROVED con fuente humana actual; SE-001 sin cambio retroactivo de evidencia ni ampliación de aprobación.
- [x] Proponer descuento 15%, fórmula, cálculo hipotético y condiciones separadas DEC-026; mantener precios/límites sin aprobar.
- [x] Preparar demo privada temporal, funciones/restricciones, cuotas/abuso, datos/retención y contratación DEM-01…08, todos SUGGESTED en DEC-027.
- [x] Integrar reglas/flujos, fronteras y negativos COM-01/02/DEM-V1…5 con gates P0 y evidencias por fase; conservar anualidad/demo dentro del MVP.
- [x] CP-006 resuelve porcentaje/base/prepago, registro/30 min/10-5-10 demo y activación; no reenviar estas consultas.
- [ ] Redondeo genérico, condiciones accesorias demo y permisos Q-06/Q-13: no aprobados por extensión.
- [x] Quality Gate proporcional: referencias, estados, aritmética, alcance del diff y mapa; checkpoint documental local sin push.

Verificación documental: C-42…C-51 de CHECKPOINTS y auditoría CP-004. La dirección está resuelta; condiciones/aprobaciones y comportamiento real siguen NOT VERIFIED. Tres consultas prioritarias separadas, sin repetir si quiere anualidad/descuento/demo. Próximo trabajo habilitado: responder condiciones y continuar diseño independiente de amenazas/índices/pools/carga; no implementar, desplegar o crear recursos.

## T-09 — Recomendación multiempresa revisable (CP-005)

- [x] Recuperar HEAD c936468/estado/origen/worktree; reutilizar CP-004 y comprobar que distribución/autoridad/pools/atomicidad eran lagunas reales.
- [x] Leer código y versiones pertinentes sin DB ni inspección remota; registrar observaciones, estimaciones y fuentes primarias fechadas.
- [x] Concretar MT-A/B: ubicación/autoridad, identidad→membresía→permiso→empresa/recurso→operación, revocación y ámbitos demo/operador separados.
- [x] Concretar MT-C/D/E: clientes/credenciales/recursos, índices/unicidad, atomicidad por invariante, provisión/migraciones y restore por empresa.
- [x] En CP-005 se comparó B con A tenantId, se recomendó B como SUGGESTED y se conservó DEC-012 PROPOSED entonces; Q-15 y demo/copias localizados sin ampliar comercio. Aprobación posterior en T-10/CP-006.
- [x] Asignar MT-V1…8 a gates/fases, sin considerar tests diseñados como PASS ni desplazar evidencia decisiva para aprobar el diseño.
- [x] CP-006 aprueba DEC-012, la elección de base por empresa/credencial y trabajador privado; conservar historia CP-005.
- [ ] Resolver mecanismos/custodia/presupuesto y políticas demo antes de DG-TENANT; no se aprueban al entregar borrador.
- [x] Quality Gate documental/mapa y checkpoint local, sin push ni modificación funcional/infra.

Verificación histórica: C-52…C-62 y auditoría CP-005; propuestas/aprobaciones de aquel checkpoint preservadas en Git. CP-006 actualiza el estado mediante fuente humana nueva; no reescribe esa evidencia.

## T-10 — Decisiones e investigación autónoma sustantiva (CP-006)

- [x] T-10A: incorporar aprobaciones exactas, distinguir propuestas aprobadas/nuevas/ampliadas, SC-002/003 y reverse-impact; preservar decisiones previas.
- [x] T-10B: MC-01…18, perfiles/último cupo/control entre procesos, fuente privada y brechas físicas; MC-V1…8 con gates, sin medición del VPS.
- [x] T-10C: CC-A…F, invariantes/ejemplos/cierre/ledger/asOf y caracterización pura del código; sin corregir producto.
- [x] T-10D: catálogo/lifecycle/excepciones/calendario y economía recalculable; 23 aserciones locales, costes desconocidos separados de hipótesis.
- [x] T-10E: demo registrada, fixture determinista, siete grupos de comprobación y comparación --check, permisos/abuso/datos/copias; sin integración ni DB real.
- [x] T-10F: trazabilidad, dependencias, primer lote P1-L1 condicionado/reversión, revisión cruzada y Quality Gate proporcional; mapa/checkpoint local.
- [ ] Resolver condiciones/gates para baseline final y autorizar implementación; no forma parte del cierre experimental CP-006.

Verificación: C-63…C-78, resultados/hashes y auditoría CP-006. Recursos KEEP: diez archivos experimentales; sin procesos persistentes o infraestructura creada. Solo función pura returnPolicy caracterizada; 90 tests históricos f5afaa2 no rerun. P0 EN CURSO; P1-L1 no iniciado. No repetir modelos/inventarios sin nueva carencia. Próximo paso concreto en plan.md/PLANNING_STATE.


## T-11 — Contratos aprobados y preparación de cierre (CP-007)

- [x] T-11A: comprobar HEAD real31a854d/alcance/trabajo previo, registrar DEC-028/034/035 con fuente humana08oct e impacto focalizado; historia intacta, sin errata/cambio ficticios.
- [x] T-11B: completar solicitud/operación/ventana/exceso, calendario de gracia con instantes y crédito individual con prueba de derecho/regresiones; mecanismos propuestos, sin código ni nuevos ensayos.
- [x] T-11C: consolidar registro único32 pendientes tipados con recomendaciones/criterios/gates/evidencia y trabajo independiente; quitar resueltos/duplicados.
- [x] T-11D: consolidar F14 preparatorio y ocho cortes internos P1-L1 con dependencias/entrada/salida/entorno/reversión; verificar expediente/mapa y un checkpoint local.
- [ ] Completar Q-33/36 y entradas obligatorias de P0-D antes de baseline/aprobación/implementación; no se marcan resueltas por este checkpoint.

Verificación: C-79…C-92 y auditoría CP-007. **T-10 no repetida**, experimentos CP-006/historia protegidos, f5afaa2 sigue siendo tested_code_sha histórico. Infraestructura, producto/config, dependencias, secretos, remotos y Prompt intactos. P0 EN CURSO; P1 NO INICIADA. Las verificaciones de integración/entorno posteriores tienen su gate, sin PASS por documentación.

## T-12 — Propuesta final revisable de P0 (CP-008)

- [x] T-12A: Git/base472b685, DEC-036/037/038 y SC-004, historia DEC-030/035; retirar Q-26/27/29 por alcance y resolver Q-20.
- [x] T-12B: calendario anclado único, cambio inmediato durable, condiciones concretas comerciales y monetarias separadas.
- [x] T-12C: completar arquitectura Q-02, ingeniería ENG/Q-11 y pantallas Q-31 como candidatos de revisión, sin implementación.
- [x] T-12D: registro29pendientes, F14/P1-L1 coherentes, Quality Gate documental/mapa y checkpoint local.
- [ ] Revisión de candidatos y condiciones humanas, evidencia externa exacta, Q-33/F14 final, entorno y baseline/autorización Q-36 antes de P1.

Verificación C-93…106 y auditoría CP-008; no repetir90tests o ensayos CP-006. Recursos/producto/Prompt preservados. Bloques independientes terminados; próximo paso revisión con decisiones separadas, no otra ronda equivalente de documentación.

## T-13 — Respuestas, factibilidad externa y candidato integrado (CP-009)

- [x] T-13A: recuperar HEAD3ec4c1e, incorporar respuestas actuales y cierre exacto de17IDs, conservando historia/alcances.
- [x] T-13B: comparar pagos AZUL/CardNET y copias B2/R2; verificar Sentry/correo y calcular costes con fuentes/hipótesis separadas.
- [x] T-13C: integrar recurrencia, delegación, cambiosPOS, retención y recuperación en contratos; candidato v0.9-CP009 listo para revisión.
- [x] T-13D: revisión F14 efectiva PARCIAL, Quality Gate documental y mapa/checkpoint local, sin pruebas históricas repetidas.
- [ ] Resolver Q-03/18, selección/presupuesto/condiciones adicionales y revisión; acreditar entorno/tooling, baseline y autorización separadas antes de P1.

Verificación en C-107…122/auditoríaCP-009. P0únicaactiva; ocho cortesP1-L1 preservados, no nueva descomposición rutinaria. Sin producto/config/infraestructura, secretos, cuentas, contrato/gasto/cobro, push/merge/CI remoto o modificación del Prompt. El próximo intercambio debe resolver carencias finales y revisar el candidato, no repetir descubrimiento.
## T-14 — Revisión técnica, entorno y solicitudes utilizables (CP-010)

- [x] Recuperar HEAD f72bd239 y contratos completos; revisar Q-02/11/31, corregir representación sin decisiones nuevas.
- [x] Localizar dependencias reales de los ocho cortes; presentar RG-001/DEC-053 PROPOSED sin aplicar cambio de gates.
- [x] Extraer seis condiciones exactas Q-38 y preparar mensajes CardNET/fiscal listos para enviar, no enviados.
- [x] Justificar método full30min con cadena completa/RPO/lectura/journal/temporales y mecanismosB2 pendientes; tarifas CP-009 reutilizadas.
- [x] Acreditar motor temporal Mongo8.3.11 Windowsx64/auth/A-B/control/transacciones:8PASS y cleanup propio confirmado; límite de compatibilidad objetivo explícito.
- [x] Identificar acción mínima de cadenaLinux pendiente y pruebas posteriores por garantía; no instalar ni usar host/Atlas/Nexora.
- [ ] Obtener aceptación de paquetes y decisiones pendientes; seleccionar rutaRG-001 o completaCP-009, acreditar cadena objetivo, cerrar F14/baseline/autorización antes de P1.

Verificación C-123…138 y QA-EXP-02 con plan/hash/resultados propios. No repetir90tests oCP-006; no nuevo tested_code_sha del producto. Evidencia KEEP, runtime temporal DELETE. Quality Gate y mapa CP-010 documentan avance sustantivo, no nuevo cuestionario ni aprobación automática.

## T-15 — Orden aprobado y candidato limitado (CP-011)

Las casillas históricas T-12…14 reflejan sus entradas anteriores; el registro vigente y RG-001 sustituyen sus dependencias globales para L1. No se marcan aprobaciones o funciones por haber cambiado el orden.

- [x] Registrar DEC-053 APPROVED con fuente actual/riesgo y resolverQ40 sin duplicar decisión.
- [x] Aplicar dependencias antes del primer trabajo que las necesita; conservar pendientes globales.
- [x] Preparar S-18 P1-L1 v0.1-CP011 con manifiesto selectivo y ocho cortes, sin producto comercial/bypass.
- [x] Comprobar WSL/Docker dirigidamente: no disponible; reutilizar8PASSMongo8.3Windows deCP010 sin repetir.
- [x] Revisar coherenciaF14-L1, separando aprobaciónA/autorizaciónB/entorno/pruebas futuras.
- [x] Finalizar Quality Gate/checkpoint/mapaCP011; F14-L1coherencia PASS, sin aprobaciónA/B ni implementación.
- [ ] A: recibir aprobación de la versión limitada exacta, no del candidato general.
- [ ] B: recibir autorización diferenciada y acreditar Development/entorno por corte antes de implementar.

Sin código funcional, configuración ejecutable, instalación, recursos remotos/temporales, gasto, mensajes enviados, push/merge/CI. Próximo intercambio permite decidirA/B; no vuelve a pedir respuestas comerciales cerradas.

## T-16 — Corrección del despliegue y adaptación relacional CP-012

- [x] Recuperar HEAD bf28c45 y trabajo previo; registrar SC-005/006 y DEC-054…057 con fuente humana actual, preservar historia.
- [x] Inspeccionar VPS en lectura: contenedores, puertos, redes/volúmenes, proxy, recursos, firewall y persistencia; sin secretos o datos. Diagnóstico local focalizado.
- [x] Adaptar candidato S-18/los ocho cortes a PostgreSQL, operación independiente y UI cuadrada; mantener NCF/e-CF global con gates de dominio.
- [x] Definir QA por túnel sin proxy, entrada HTTPS futura con permiso propio, recursos/abortos/rollback/restore y portabilidad.
- [x] Finalizar revisión F14 impactada y Quality Gate documental, checkpoint/mapa.
- [ ] A: aprobar P1-L1 v0.2-CP012 y manifiesto exactos. B condicional ya recibida DEC-057, no pedir otra B genérica.
- [ ] Acreditar Development/Environment por corte y ejecutar implementación autorizada; PostgreSQL/QA todavía no creados.
- [ ] Solo cuando corresponda Q41: permiso específico de integración compartida sobre diff revisado; no bloquea QA por túnel.

T-15 A/B conserva estado histórico CP-011. La autorización condicional actual no marca aquella baseline Mongo aprobada ni cierra gates. No repetir pruebas Mongo o cuestionarios comerciales. Recursos de infraestructura creados/modificados: ninguno en esta ejecución.

## T-17 — Implementación y QA CP-013 (histórico)

- [x] Materializar baseline limitada y dominio futuro; gates A/B/entorno acreditados.
- [x] Implementar los ocho cortes y ejecutar pruebas locales/PG/HTTP/browser privadas.
- [x] Aceptación acotada L1.1/3/8: fixture, dos procesos de pools y recuperación sintética.
- [x] Corregir carrera de timeout con RED→fix→GREEN y repetir HTTP/browser.
- [x] Custodiar credenciales antes de rotación; backup/WAL/replay/canarios/cleanup reales.
- [x] Corregir discontinuidad/generación de métricas;8unitariasPASS, integración pendiente.
- [ ] L1.2 carreras de dos API y fallos registro/store/cookie.
- [ ] L1.4 negativas HTTP demo/operador con sesión estándar válida.
- [ ] L1.5 último cupo y ledger controlado en dos procesos HTTP; diagnóstico de reloj.
- [ ] L1.6 integrar el delta posterior de observación.
- [ ] L1.7 asset404/drenaje/reversión compatible y matriz final.

T15/T16 conservan casillas históricas; A/B/entrada ya están resueltas porDEC058, sin aprobación global implícita. Siguiente paso técnico autorizado: nueva cohorte aislada con preflight/procedimiento revisados; no otra ronda de aprobación por corte.

## T-18 — Cierre funcional e integración limitada CP-014

- [x] Recuperar base real5624ef0, autorización y evidencia CP-013; preservar fuente cerrada, copia, journal y datos anteriores.
- [x] Crear nueva cohorte sintética privada CP-014 con preflight, roles/TLS/redes/recursos propios y ausencia de egreso; conservar consumidores existentes.
- [x] Cerrar L1.2: sesiones estándar/rotación/logout/save tardío/fallos de emisión/respuesta perdida/reinicio entre dos API HTTP y PostgreSQL.
- [x] Cerrar L1.4: permisos empresa/demo/operador válidos y manipulación denegada antes del pool indebido, sin datos ajenos.
- [x] Cerrar L1.5: último cupo/ledger/QH/QC/QT/retry/timeout/reinicio/relevo y prueba de fin antes de conciliar incertidumbre; coste/conflictos medidos solo como ensayo.
- [x] Cerrar L1.6: proyección real/source/generación/discontinuidad, reinicios worker/PG, calidad/antigüedad, grants mínimos y buffer acotado; sin atribución CPU/RAM individual.
- [x] Cerrar L1.7: rutas/asset 404/API JSON, dos drenajes con trabajo en vuelo ≤30 s y tickets finalizados, rollback F→A→F real por digest sin revertir PostgreSQL.
- [x] Conservar PASS acotados L1.1/3/8 y ejecutar únicamente regresiones afectadas; no repetir restore completo sin cambio relevante.
- [x] Consolidar matriz de ocho salidas PASS, revisión/diff/evidencia/mapa y preparación local del Integration Gate; separar SHA probado/checkpoint/HEAD/merge.
- [x] Detener cinco servicios CP-014 y cerrar túnel 18443; conservar datos/redes/artefactos propios y fuente CP-013 detenida con barrera cerrada, sin URL activa. Inventario final y comparación de consumidores propios/ajenos PASS; controlador privado `409880a`, sin cambiar el artefacto F.
- [ ] Ejecutar los pasos de integración que requieran autorización correspondiente: PR/CI remoto/merge siguen NOT VERIFIED; ningún push/merge/publicación efectuado.
- [ ] Acreditar baseline, gates y autorización del siguiente lote antes de implementarlo; no empezar otra fase por el cierre de L1.

Verificación: [auditoría CP-014](../docs/audit/CP-014.md), evidencia de `docs/evidence/cp014/` y mapa derivado. Código F `b0f5e199e5df457d7f901ff3a3dca5ab3a8d5701`, artefacto `sha256:5950ae7e519170ebaaf6cf8c99e9187c14b41f32779044e2829e8de5abbac0a6`; cada ensayo conserva su propio SHA, no todos se trasladan a F. Reanudar solo la cohorte CP-014 conforme al [runbook](../tests/qa/README.md#reanudar-únicamente-la-cohorte-cp-014), nunca `up` indiscriminado de CP-013. Sin infraestructura compartida, Coolify gestor, datos reales, pagos/DGII, gasto, push/merge o cambios al Prompt Maestro.

## T-19 — CP-015 integración Git y preparación focal siguiente

- [x] Verificar cuenta/base/ancestry/PR1/triggers/políticas en lectura; conservar trabajo previo.
- [x] Crear rama local limpia y snapshots normativos byte exactos SE-002, sin commitsPR1.
- [x] Preparar CI sin deploy/secrets y ejecutar regresiones locales afectadas, patches de dos dependencias y hashes de bundle.
- [ ] Resolver Q-42/Q-43 antes de push/PR/merge; CI PR/review GitHub/CI canónica NOT VERIFIED.
- [x] Preparar un solo candidato siguiente y revisión independiente focal; corregir R1…3 antes de presentar A.
- [ ] Obtener A/B exactas del nuevo alcance, acreditar base/Development/Environment y después implementar; P2 no iniciada.

No despertar QA, cambiar infraestructura/Prompt, integrar PR1 o publicar por efecto lateral. El candidato siguiente permanece fuera del PR funcional L1, en la rama fuente de planificación.

## CP-016 — seguridad de integración y preparación focal (historia previa al cierre)

Q-42 resuelta por evidencia humana/plataforma. SC-008/DEC-060 aprobada/implementada: lane propia, audit completo0, tests/build/3assetsF y revisión al SHA0d8285cef117d6174a6053f18ceaac180f8aa1c5; legacy FAIL sigue TD-21 antes del uso afectado. Integration Gate remoto pendiente de ejecución autorizada. L2 v0.2 conserva A/B pendientes y doce criterios funcionales NV; R4/R5 corregidos y15 comprobaciones puras/review documental PASS. Ninguna infraestructura, datos reales, producción o L2 funcional modificados.

El [cierre CP-016](../docs/audit/CP-016.md) posterior acredita PR #2/CI/merge L1. A/B L2 pendientes entonces se resolvieron por DEC-061/062; no se cambian las casillas ni el relato histórico para fingir aprobación anterior.

## CP-017 — cola vigente P1-L2 PRE-INTEGRATION

- [x] Recuperar base develop a0098178fc27467bf4c12da0e97723e0b80ce683 y rama propia codex/p1-l2; conservar PR #1 y trabajo previo.
- [x] Registrar A exacta DEC-061 y B/QA/integración condicionada DEC-062, snapshot protegido byte exacto; gates locales y preflight QA acreditados antes del trabajo dependiente.
- [x] Implementar el lote aprobado y ejecutar verificaciones locales afectadas; [258/258, sintaxis134 y AST Python PASS](../docs/evidence/cp017/local-canonical.json), ligados a hashes y estado anterior al commit del arnés, sin atribuir una ejecución limpia al HEAD2b0 ni declarar doce salidas PASS por conteo.
- [x] Conservar browser252:20 checks/56 HTTP y seis escenarios320/768/1440×100/200%, con fuente/runner/assets propios y fallos anteriores visibles.
- [x] Ejecutar fragmento SQL40001/40P01 b14 con70 comandos/dos leases/huellas iguales; drain/identity/block B conservan PASS acotados y fuentes propias, sin convertirlos en aceptación global.
- [x] Verificar vectores canónicos de hash/actor/acción en2b0:14 HTTP/79 SQL PASS, rollback exterior probado, ningún alta nueva efectiva, huella de B bloqueada intacta y readiness global503 esperado; no reabrir identidades/grants ni declarar A6/A7 completos PASS.
- [x] Verificar restore sintético cerrado nuevo en tres fases: registro/journal/guardas y20 resultados antes/después preservados;40 llamadas de writer obsoleto y seis sesiones antiguas rechazadas;18 credenciales antiguas rechazadas y18 nuevas verificadas. Generación90d78c7c-9efd-437e-844a-a134ce84e514 CLOSED; no heredar PASS L1 ni declarar reapertura.
- [x] Cerrar aceptación limitada de los doce criterios L2-A1…A12 en [matriz final](../docs/evidence/cp017/matrix.md), SHA-2563a8fe79607abefb16f32c5f78b56fb34242d6ba89884ee3ba219f9063351af70; local/QA/review/Quality PASS por unión trazada, sin convertir Integration Gate en PASS ni declarar L2 TERMINAL.
- [x] Consolidar [revisión](../docs/evidence/cp017/review-consolidated.json):0 críticos/0 REQUIRED abiertos; [Quality local](../docs/evidence/cp017/quality-local.json) PASS:258 contratos/134 sintaxis/55 UI/3 sanitizador/4 preload, auditorías completas SaaS/backend0, assets idénticos y cleanup PASS.
- [x] Verificar [cleanup propio](../docs/evidence/cp017/cleanup.json): seis contenedores STOPPED/KEEP,20 consumidores ajenos preservados, datos/copia/journal privados conservados, túnel propio PID4312 detenido y loopback18443 cerrado.
- [ ] Ejecutar rama limpia/PR/CI/review/merge condicionados DEC-062 y comprobar develop/SHA canónica. Ninguno acreditado todavía para L2; Q-35 bloquea sólo cierre del Integration Gate/TERMINAL, no iniciar esta operación ya habilitada ni el restore funcional cerrado ya probado.

Artefacto QA actual 2b0dd67f7f19fa563ae5eae802da533572da7abe / sha256:85f959d949897298450b49a705d30b9688bfbaf9573d142fe4e08acae010e75c; producto8199a414ff06220e147b062ce37fa55709311627. [Plan previo](../.agentic/P1-L2_PLAN.md) y [baseline protegida](../docs/specs/P1-L2.md) delimitan el alcance. P1 continúa EN CURSO; P2 NO INICIADA, SaaS general NOT APPROVED, sin cambios a producción, DNS, Coolify, Nexora, Mecanet-EAK o Prompt Maestro. [P1-L3](../.agentic/P1-L3_CANDIDATE.md) permanece SUGGESTED / NOT APPROVED, sin A/B ni creación de recursos.
