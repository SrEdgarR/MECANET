# Roadmap de regularización y evolución SaaS

Estado CP-014 (2026-10-13): **P1-L1 COMPLETADA, ocho salidas PASS acotadas**, bajo RG-001/DEC-053 y la baseline limitada DEC-058. P1 EN CURSO sigue como única fase activa; P0 general queda PARCIAL y SaaS general NOT APPROVED. Integration Gate preparado en local; PR, CI remoto, merge y CI canónica NOT VERIFIED y no autorizados en esta ejecución. El cierre L1 no cierra toda P1 ni habilita otro lote.

Vigencia SC-005/006/007: frontend/backend/PostgreSQL propios en VPS, sin administración Coolify. Compose y origen quedan aprobados para el alcance limitado de [P1-L1](specs/P1-L1.md) al commit `3b387b38784907b67e2209a35c3d5f400d70742e`; no aprobación del despliegue público. DEC-059 confirma dominio comprado `mecanet.app`, distribución pública propuesta y sin DNS. Vercel, Coolify y sus recursos existentes conservados. S-18/DEP-IND sustituyen mecanismos Mongo/Coolify del lote; sus pruebas antiguas no se transfieren. UI cuadrada y NCF/e-CF confirmados DEC-055/056.

Revisión CP-009 (2026-10-08): respuestas humanas actuales incorporadas mediante DEC-039…052 y ampliaciones exactas. Mensual/anual automáticos, catálogo USD, calendario−7d tras gracia, delegación, POS/demo y retenciones/objetivos están aprobados; no cuenta fiscal/proveedor, plataforma concreta de copias, presupuesto o baseline por extensión.

Antecedente CP-011 aplica RG-001 autorizado: candidato general v0.11-CP011 y fragmento P1-L1 v0.1-CP011/S-18, ambos sin baseline aprobada. F14 del lote evalúa coherencia separada de aprobación/entorno; F14 global PARCIAL.14pendientes con límite por trabajo, Q-40 resuelta. Se reutiliza QA-EXP-02 y se verifica de forma dirigida WSL/Docker, sin implementación.

## Fases

| ID | Nombre | Estado | Dependencias | Propósito | Cierre | Bloqueantes | Evidencia | Documento |
|---|---|---|---|---|---|---|---|---|
| P0 | Adopción y planificación | PARCIAL | Ninguna; dependencias diferidas por RG-001 | Mantener candidato SaaS general y resolver diseños antes de sus módulos; no segunda fase activa | Gates globales antes de baselines posteriores; aceptar L1 no cierra SaaS general | Restos Q-02/11/31/33, proveedores/fiscalidad/servicios en sus resolve-before; Q-36 resuelta por A exacta | CP-014: baseline limitada DEC-058;14 pendientes únicos,0 BLOCKING y14 FUTURE | ../.agentic/PLANNING_STATE.md |
| P1 | Fundación aislada y operable | EN CURSO | P0-L1-S/D/E acreditados para alcance actual según RG-001 | Conservar fundación P1-L1 verificada y preparar su Integration Gate, sin ampliar el alcance autorizado | Salida P1-L1 PASS; Integration Gate y garantías restantes de P1 conservan sus criterios, sin cierre global por extensión | Sin bloqueo de L1; PR/CI/merge NOT VERIFIED y no autorizados; baseline/gates antes de otro lote y preflight de cada recurso | CP-014: ocho salidas PASS acotadas, QA propia PG18.6 ARM64/dos API/Nginx/worker, matriz por SHA | specs/P1-L1.md |
| P2 | POS y comprobantes fiscales por empresa | NO INICIADA | P1 | Extender aislamiento SQL/control a escritores; caja/cambio inmediato, datos/demo y NCF/e-CF con contrato fiscal previo | MT-V1…8, CC-V1…7/9/10 y DEM-V1/2/3: concurrencia, asOf, idempotencia, índices, diferencia monetaria del cambio y restore sintético | Mecanismos relacionales revisados y PostgreSQL QA acreditado; condiciones caja/cambio DEC-029/038 ya aprobadas, sin reabrirlas | PENDING | ../.agentic/SAAS_DISCOVERY.md |
| P3 | Suscripciones y alta automática | NO INICIADA | P2 | Checkout y renovación automática mensual/anual DOP/USD, pago verificado, provisión recuperable, consentimiento/delegación y lifecycle; demo sin datos ficticios | COM-01/02, SUB-V8, DEM-V4: duplicados, alta fallida, reinicio/restore, calendario/gracia 7 días/cambios sin doble cobro | Contrato/sandbox del proveedor elegido Q-03, regla fiscal y condiciones adicionales; catálogo DOP/USD, recurrencia/calendario/activación aprobados | PENDING | ../.agentic/SUBSCRIPTION_PROPOSAL.md |
| P4 | Administración y uso por empresa | NO INICIADA | P3 | Gestionar tenants/suscripciones/pagos, visualizar MC y ajustar cuotas autorizadas | MC-V1…8 completos de panel/fuentes/roles/overrides y coste de observación; calidad visible | DG-ADMIN/OBS; reauth sensible5min DEC-045 antes del primer handler operador; productor privado autorizado y capacidad antes de ofrecer | PENDING | ../.agentic/ARCHITECTURE_OPTIONS.md |
| P5 | Experiencia comercial y onboarding | NO INICIADA | P4 | Landing, mensual/anual, demo registrada y contratación dentro del MVP | DEM-V3/4/5, CC-V8, E2E/UI accesible y responsive, total anual/condiciones claros, errores/cupo/caducidad | Diseño visual/revisión, contenido legal y fiscalidad resueltos; USD y condiciones humanas ya aprobados, sin claims de capacidad ficticios | PENDING | ../.agentic/SAAS_DISCOVERY.md |
| P6 | Validación y lanzamiento controlado | NO INICIADA | P5 | Probar recuperación, seguridad, capacidad y corte propio web/API/PG en VPS | DEP-V1/V2/V3 en destino real; DEP-V4, Production Gate, proveedor, capacidad y Legal Gate | Destino/copia externa acreditados, ensayos de RPO/RTO aprobados como objetivos, revisión y autorización de corte; conservar Vercel hasta decisión de retirada | PENDING | ../DEPLOYMENT.md |
| P7 | Operación y evolución | NO INICIADA | P6 | Medir salud/coste y mantener garantías | Runbooks, alertas, revisiones periódicas y criterios de evolución aceptados | Evidencia operativa y owners | PENDING | TECH_DEBT.md |

## Subgates

| Fase | ID | Nombre | Estado | Criterio |
|---|---|---|---|---|
| P0 | P0-A | Inventario inicial | PASS | Código, Git, dependencias, infraestructura, UI real y pruebas conocidas registrados con límites en CP-001 |
| P0 | P0-B | Specification Gate global | NOT VERIFIED | Candidato SaaS completo pendiente; fiscalidad/pagos/condiciones antes del primer dominio dependiente, sin imponerlas a S-18 por RG-001 |
| P0 | P0-C | Design Gates | NOT VERIFIED | MT-A…F aislamiento/revocación/atomicidad con dependencias resueltas; MC/CC/DEM, administración, pagos, migración y observabilidad; DEP-D1/D2 de origen/empaquetado/redes/capacidad/recuperación aprobados |
| P0 | P0-D | Development Gate global | NOT VERIFIED | Baseline general/runtime/entorno y autorización pendientes; no requisito global para lote limitado conforme RG-001 |
| P0 | P0-L1-F | Coherencia F14 del lote | PASS | Revisión nueva CP-012 y QG de S18relacional/DEP-IND/12criterios; no PASS funcional ni heredado CP-011 |
| P0 | P0-L1-S | Specification y Design Gates del lote | PASS | DEC-058 aprueba A exacta S-18/P1-L1 v0.2-CP012, manifiesto L-01 y ocho cortes al Git3b387b3; no resto del SaaS |
| P0 | P0-L1-D | Autorización y Development Gate del lote | PASS | B/QA explícitas y baseline/runtime/cadena acreditados para el trabajo actual; no aprobación adicional por corte ni permisos compartidos por extensión |
| P0 | P0-L1-E | Environment Gate por corte | PASS | Entrada QA propia acreditada: PG18.6 ARM64, límites/roles/redes/secretos propios y HTTPS por túnel/socket UNIX; cada nuevo recurso conserva preflight, no capacidad general demostrada |
| P1 | P1-L1-OUT | Salida integrada del lote | PASS | CP-014: ocho salidas PASS acotadas, carreras/propósitos/admisión/observación/ciclo reales y restore cerrado CP-013 conservado por SHA; Q-35 resuelve solo L1, no garantías posteriores ni integración Git |
| P1 | P1-L1-INT | Integration Gate del lote (§8.5) | NOT VERIFIED | Código probado, revisión y checkpoint locales preparados; PR/review de PR, CI PR, merge y CI canónica no ejecutados ni autorizados. No nueva baseline o fase por extensión |

## Alcance, exclusiones, entorno y evidencia de cada fase

| Fase | Alcance | Exclusiones | Entorno necesario | Evidencia esperada | Pendientes diferidos |
|---|---|---|---|---|---|
| P0 | Lectura focalizada, investigación, decisiones, documentación/mapa y experimentos locales autorizados | Producto antes de A/gates; cambios compartidos, gasto o lanzamiento | Lectura local/VPS autorizada CP-012 sin .env/DB/datos; QA independiente solo tras entrada | Candidato relacional, evidencia de entorno y cambios de autoridad; históricos conservados | Integración real/capacidad/restore en gates posteriores, sin ensayo remoto implícito |
| P1 | Un corte vertical identidad → ámbito → recurso; frontera demo/empresa/operador; admisión agregada MC/DEM, frontend/API y backup sintético; Sentry tras DG-OBS | Todos los módulos, datos/secretos productivos o corte DNS | Environment Gate antes de uso; credenciales/redes/volúmenes propios | Build arm64/rutas, MT/MC/DEM de fundación, negativos entre procesos, restore sintético y redacción | Cuotas/datos P2, pagos P3, demo pública P5; recuperación total P6 |
| P2 | Cortes POS/caja/cambios/restore por empresa; ámbito demo ficticio, cuotas/caducidad, cobertura de admisión | Nuevas prestaciones comerciales no acordadas | PostgreSQL QA con dos empresas y sesiones demo ficticias, conforme al diseño aprobado | API/DB/E2E, CC-V1…7/9/10/MT/MC, referencias/índices/transacciones, DEM-V1/2/3 y canarios de restore | Alta comercial P3; recorrido público P5; migración real P6 |
| P3 | Identidad provisional → pago mensual/anual verificado → alta según regla aprobada → renovación/baja; demo sin migrar datos | Cobros reales o detalles comerciales/mandatos sin aprobar; automático sí es alcance obligatorio | Sandbox proveedor seleccionado y QA; restore sin jobs ni egreso productivos | COM-01/02, DEM-V4, duplicados/reordenación/ACK perdido/restore sin doble cobro/alta/período | Admisión comercial real antes de P6 |
| P4 | Información administrativa/suscripciones/pagos, métricas MC y cuotas auditadas | Acceso irrestricto a datos por soporte, CPU exacta ficticia | QA con uso controlado y Sentry configurado | Matriz de permisos API/UI, MC-V completos y escenarios de métrica/cuota con valor esperado | Ajustes de capacidad/coste a P6/P7 |
| P5 | Demo limitada, selector mensual/anual, conversión y experiencia completa del MVP | Precios/claims inventados o simulaciones presentadas como operaciones reales | Frontend/API QA sin datos de producción | DEM-V3/4/5, navegador fresco, teclado/mobile, errores/cupo/caducidad, total anual y contrato API | NCF/e-CF y reglas antes del dominio fiscal; suficiencia legal y capacidad conjunta antes de lanzamiento |
| P6 | Migración/lanzamiento reversible y operación verificada | Cargas/pruebas destructivas en host compartido sin procedimiento | Staging y producción con Environment Gate separado | Restore cronometrado, recuperación, observabilidad, capacidad y proveedor real | Evolución/sucursales fuera del MVP |
| P7 | Incidentes, parches, proveedor review, capacidad, backups y evolución | Features fuera del roadmap sin SPEC CHANGE | Producción monitorizada | Historial de revisiones, ensayos y métricas con ventanas explícitas | Nuevos mercados/sucursales por decisión futura |

P1-L1 se completó en ocho cortes internos verificables de tasks/plan.md bajo la baseline limitada DEC-058; su salida PASS se apoya en la matriz, no en un HTTP200 ni en conteos de tests. Q-35 resuelve la salida L1 y conserva garantías futuras por fase. Los lotes siguientes requieren sus dependencias, baseline y autorización pertinentes. Integration Gate preparado en local: código probado → checkpoint → PR/review → CI PR → merge → CI de rama canónica → base siguiente. PR/CI/merge y baseline siguiente permanecen NOT VERIFIED; no push, merge ni CI remoto autorizados en esta ejecución, ni nuevas funciones de la siguiente fase mezcladas con integración.

## Correspondencia con las fases del Prompt Maestro

| Fase metodológica | Estado de evidencia hoy | Gate o fase de producto que la completa |
|---|---|---|
| F0 Visión y éxito | Objetivo/mercado y RPO/RTO confirmados; metas internas UI/alta candidatas, sin SLA/capacidad demostrados | P0-B |
| F1 Producto/dominio | CP-009 confirma catálogo/calendario/recurrencia/demo/POS/roles; condiciones nuevas Q-38 identificadas | P0-B |
| F2 Datos/privacy/lifecycle | Retenciones/baja y alcance NCF/e-CF aprobados; mecanismos relacionales y conservación obligatoria por precisar antes de código dependiente | P0-B/P0-C; suficiencia legal en P6 |
| F3 Arquitectura | Hosting y central/base por empresa/trabajador APPROVED; fragmentos relacionales/Compose/origen de L1 aprobados, otros mecanismos pendientes | P0-L1-S PASS limitado; P0-C antes de módulos restantes |
| F4 Seguridad | Matriz limitada L1 PASS: ámbito/revocación/admisión y negativas reales; seguridad de módulos restantes no verificada | Q-35 FUTURE/P2…P6; reauth sensible5min antes del primer handler operador/P4 DG-ADMIN |
| F5 Runtime | Node24.21.0/npm11.9.0 y cadena QA PostgreSQL18.6 ARM64 acreditados para L1; fuentes/pins/pruebas CP-013/014 separados por SHA | Preflight de cada nuevo recurso y Environment Gate de entornos posteriores |
| F6 UI | UI cuadrada y fragmento privado S-18 verificados, navegador C15PASS; resto de pantallas pendiente, sin auditoría a11y global | P0-L1-S y salida L1 PASS limitados; nuevos Design Gates P2…P5 |
| F7 Ingeniería | L1 completada con pruebas/build/QA y revisión; Integration Gate preparado localmente;90tests/CP-006 históricos, CI remoto no ejecutado | Integración Git antes de baseline siguiente; diseño/cadena de módulos restantes antes de uso |
| F8 Agentes | Protocolo actualizado con baseline limitada, cierre L1 y límites CP-014 | Mantener trazabilidad por entrega sin ampliar aprobación |
| F9 Roadmap | RG-001 y ocho cortes L1 aprobados, dependencias posteriores identificadas | Salida L1 y aprobación de baselines restantes |
| F10 Ejecución | CP-001…013 históricos; CP-014 cierra P1-L1 con ocho salidas PASS, P1 general EN CURSO | Integration Gate local; P2–P7 solo tras gates y autoridad pertinentes |
| F11 Producción | Despliegue legado inventariado; SaaS no validado | P6 |
| F12 Operaciones | Objetivos/custodia/retenciones aprobados; restore físico sintético cerrado CP-013 PASS conservado y ciclo privado CP-014 PASS; destino/presupuesto/RPO/RTO externos pendientes | Evidencias por alcance P1/P2/P3; recuperación externa/desastre P6/P7 |
| F13 Adopción | Inventario inicial PASS; regularización por aprobar | P0 |
| F14 Cierre planificación | Coherencia F14-L1 CP-012 y A/B CP-013 acreditadas para alcance limitado; global PARCIAL | Baselines restantes y P0-D global; salida funcional de L1 separada |

Esta tabla es una precarga de evidencia, no quince fases activas. El progreso global será cualitativo hasta estabilizar y aprobar el roadmap.


## RG-001 — Orden aprobado y aplicado en CP-011

**CONFIRMED / DEC-053 APPROVED**, fuente humana directa del adjunto51b8e835,2026-10-08. Sustituye el orden global como condición de entrada de P1-L1; no elimina los pendientes del SaaS. La propuesta y su riesgo aceptado permanecen en el antecedente de DEC-053/CP-010.

| Dependencia | Límite vigente después de RG-001 | Efecto sobre P1-L1 |
|---|---|---|
| Q-02/11/31 | Aceptar solo S-18/manifiesto limitado antes de implementarlo; resto antes de su módulo | No se pide aprobar paquetes completos/quince pantallas |
| Q-33 | Coherencia F14 del lote antes de presentar A; revisión global y de futuras baselines pendiente | Coherencia no exige primero la aprobación A/B ni funcionalidades aún inexistentes |
| Q-36 | A: versión exacta limitada; B: autorización separada efectiva con Development Gate/entorno | RG-001 no las concedió; resuelta posteriormente por DEC-058/A exacta y B/QA explícitas en CP-013 |
| Q-32 | Runtime/destino/recursos suficientes antes del corte; dos API/restore se prueban como salidas; ARM64 real antes de salida L1.7/P1 | Windows8.3 histórico no es target; no exige todo el entorno de lanzamiento antes de redactar/iniciar cortes independientes |
| Q-03/Q-38 | Q03 contrato técnico/DG-PAY antes del código dependiente; Q38 antes de código o publicación dependiente, incluida UI comercial, normalmente P3. Sandbox antes de integrar; afiliación antes de usar comercialmente | No pagos/checkout/provisión comercial dentro del lote |
| Q-18 | Antes de dominio fiscal, comprobantes, garantías o conservación obligatoria dependientes, posible P2; términos antes de efectos reales | Catálogo ficticio sin precios/impuestos ni conservación real |
| Q-08 | Contrato sintético aprobado en S-18 antes de L1.8; plataforma/región/protección/credenciales antes del uso externo | Restore sintético obligatorio P1, sin cuenta B2 ni RPO/RTO productivos acreditados |
| Q-23 | Recursos locales suficientes en Q-32; presupuesto antes de adquisición/gasto/compromiso de servicios | No presupuesto SaaS completo exigido para arnés privado; tampoco gasto implícito |
| Q-39 y servicios de observación | Destino/permisos/cuenta/contrato antes de transmitir datos; privacidad y presupuesto aplicables | Proyecciones/transporte locales sin Sentry/correo reales |
| Q-34/35 | Pruebas por corte/fase y medición decisiva antes de depender; capacidad/recuperación externa/lanzamiento en gates reales | Ninguna prueba de función inexistente bloquea diseñarla; ninguna garantía se marca PASS por descripción |

**Ruta de autorización histórica CP-011:** F14-L1 de coherencia → decisión A sobre P1-L1 v0.1-CP011 → decisión B diferenciada → comprobar Development Gate y entorno suficiente del corte → implementación futura autorizada → pruebas/salidas por corte → aceptación conjunta. A y B podían presentarse juntas; B solo surtía efecto al satisfacerse sus condiciones. CP-012 adaptó el candidato a v0.2, CP-013 acredita A/B/entrada para esa versión exacta y CP-014 completa sus ocho salidas; hoy corresponde revisar el paquete de Integration Gate local, sin volver a solicitar A/B.

La entrada común del lote se refiere a gates de **ese alcance limitado**, no al cierre global de P0-B/C/D. El registro conserva gates globales NOT VERIFIED y subgates limitados acreditados. CP-013 registra la transición: P1 EN CURSO es la única fase activa y P0 general PARCIAL bajo RG-001, con dependencias diferidas en el registro único. No se proclama P0 global completa o READY FOR DEVELOPMENT general.

Riesgo aceptado: retrabajo de fundamentos si factibilidad comercial/fiscal cambia premisas. Controles preservados: diseño de alto riesgo antes de código, fixtures exclusivamente aislados, ninguna empresa real activada, ocho cortes sin redisección, recuperación P1, prohibición de egreso/producción hasta sus gates. Prompt y garantías humanas intactos.

## Ajuste histórico CP-012 — implementación condicionada y convivencia

SC-005/006 no cambia el orden RG-001 ni reabre los planes: P1-L1 conserva ocho cortes en PostgreSQL, operación propia y UI cuadrada. B recibida según DEC-057; A del candidato v0.2 y Development/Environment pendientes. F14 anterior es histórico. Q41 aísla la autorización de integrar HTTPS compartido, necesaria antes de modificar proxy/red/config compartida, innecesaria para QA por túnel. No trasladar todo a P6: NCF/e-CF Q18 antes del código fiscal en P2/P3, proveedor antes integración, servicios antes egreso, presupuesto antes gasto. La inspección actual acredita motor ARM64 presente, no capacidad/aislamiento/recuperación suficiente. No se crea PostgreSQL dentro de Coolify ni se reutiliza coolify-db. Q32 puede cerrarse para un corte mediante QA privada propia en VPS; WSL no es requisito universal. Toda transición a P1 registra baseline aprobada y entradas efectivas, sin cierre global P0 por extensión.

## Vigencia histórica CP-013 — implementación limitada y salida pendiente

DEC-058 aprueba A exacta, B y QA propias. Los fragmentos Q-02/11/31 y la entrada Q-32 permiten el trabajo P1-L1 actual; sus restos quedan FUTURE antes del primer trabajo dependiente. Q-36 sale del registro pendiente. Q-35 pasa a BLOCKING de salida por verificaciones reales aún faltantes: matriz integrada, ciclo y recuperación, sin requerir otra aprobación humana genérica. Estado:14 pendientes únicos, 1 BLOCKING y13 FUTURE; 4 diseños,3 evidencias,5 decisiones humanas y2 externas.

QA actual: cinco contenedores propios (PostgreSQL18.6 ARM64, dos API, Nginx y worker), Compose independiente; HTTPS local `127.0.0.1:18443` → SSH → socket UNIX exclusivo, redes internas aisladas y sin TCP remoto. No `.env` legacy, cambios a Coolify/proxy/DNS, producción, Nexora ni Mecanet-EAK. DEC-059/SC-007 confirma `mecanet.app` como destino público futuro; distribución landing/app/API propuesta y sin publicación. La evidencia actual y sus límites se registran en [CP-013](audit/CP-013.md); no se transfieren PASS Mongo ni se afirma recuperación verificada.

## Vigencia CP-014 — lote cerrado e integración local preparada

[CP-014](audit/CP-014.md) cierra las cinco salidas parciales de CP-013 y conserva L1.1/3/8 con su evidencia histórica acotada. Resultado: **P1-L1 COMPLETADA, ocho PASS**; P1 general sigue EN CURSO como única fase activa. P0 PARCIAL, F14 global PARCIAL y SaaS general NOT APPROVED. Restore cerrado CP-013 no se reejecuta ni acredita desastre/RPO/RTO externo.

Código final F `b0f5e199e5df457d7f901ff3a3dca5ab3a8d5701`; funcional D `0257d0d98d0c1444f0897bf4d03a36bb1a846ce2` idéntico en E/F. Auth B/C/D, observabilidad y navegador C, admisión D/E y rollback F/A/F conservan SHA/digests/provenance distintos. Controlador QA final `409880a513bee1eff909caf68d23325af55e9be4`, sin cambio del artefacto F. La evidencia de componentes inalterados no se etiqueta como un nuevo ensayo completo de F. Cohorte nueva CP-014 y operación Compose propias, fuente CP-013 cerrada preservada; no cambios de producción, proxy, DNS, Coolify u otras aplicaciones.

Registro único: **14 pendientes,0 BLOCKING y14 FUTURE**;4diseños/3evidencias/5decisiones humanas/2dependencias externas. Q-35 conserva garantías posteriores P2/P3/P4/P5/P6 tras resolver solo el fragmento L1. Reauth sensible5min de DEC-045 debe diseñarse/implementarse/verificarse antes del primer handler operador/P4 DG-ADMIN, sin extender el PASS de propósito L1.

Próximo paso habilitado: revisar checkpoint y paquete de Integration Gate local. No volver a pedir A/B. PR nuevo, CI remoto, push, merge, baseline siguiente, P2, otro lote, gasto o lanzamiento no están autorizados por extensión. QA CP-014 final: cinco contenedores propios STOPPED, sin URL activa; fuente CP-013 y diez consumidores ajenos preservados. Inventario y cleanup en la auditoría CP-014; cada nuevo recurso conserva preflight y autoridad propios.
