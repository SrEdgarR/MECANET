# Mecanet SaaS — candidato de especificación v0.12-CP012

**CANDIDATE / NOT APPROVED — P0, 2026-10-12.** Base comprobada `bf28c4538d9a511a79f3c297d7dffb207879f2ea` (CP-011). Contenedor general v0.12-CP012; revisión limitada [S-18 P1-L1 v0.2-CP012](#s-18--candidato-limitado-p1-l1-v02-cp012). Fuente humana directa actual: PostgreSQL objetivo, operación independiente de Coolify, React/Express, UI cuadrada y NCF/e-CF vigentes. Aprobación A de esta baseline pendiente; B de implementación y posible QA es **condicionalmente autorizada**, efectiva cuando se satisfagan baseline/gates/entorno, sin otra pregunta B. S-00…17 no se incorporan completos a A. CP-011 y sus PASS se conservan en Git y no verifican esta adaptación.

## S-00 — Autoridad, composición y excepciones

La fuente humana de producto CP-009 es el adjunto `3b08888b-83a2-452b-9630-f7a42c8b7b54/Texto pegado.txt`, recibido el 2026-10-08. [DECISIONS](../docs/DECISIONS.md) registra cada alcance. **CONFIRMED/APPROVED** identifica requisitos elegidos; **SUGGESTED**, diseños pendientes de revisión; **DETECTED**, observaciones; **TO DEFINE**, carencias localizadas. Una página pública no acredita la cuenta de Edgar, un contrato privado o el funcionamiento de Mecanet.

El candidato reúne las áreas canónicas sin duplicar sus contratos detallados. La tabla localiza áreas del candidato general, no una incorporación automática a A. Las partes Mongo/Coolify de MT/MC/G/ENG son antecedentes históricos: S-18 y ARCH DEP-IND son las sustituciones actuales para el lote. Las restantes áreas relacionales se revisarán antes de su trabajo dependiente, sin importar contratos incompatibles por referencia. Ante discrepancia, prevalece la decisión humana vigente y debe corregirse el contrato antes de cerrar F14.

| Área canónica | Síntesis de este candidato | Contrato detallado incorporado |
|---|---|---|
| VISION / PRODUCT | S-01/02 | [SAAS F0/F1](SAAS_DISCOVERY.md) |
| BUSINESS_RULES / USER_FLOWS | S-03…06 | [SUB](SUBSCRIPTION_PROPOSAL.md), [SAAS DEM/CC/UI](SAAS_DISCOVERY.md) |
| DATA_MODEL / ARCHITECTURE | S-07/08/18 | S-18 relacional y [ARCH DEP-IND](ARCHITECTURE_OPTIONS.md); MT/MC Mongo históricos |
| SECURITY | S-06/09/10/18 | SAAS F1-A; sesiones/roles/SQL/restore de S-18; MT/G Mongo históricos |
| TECH_STACK / ENGINEERING | S-11/18 | S-18 L-06 y [plan vigente CP-012](../tasks/plan.md); ENG anterior histórico |
| UI_RULES / DESIGN_SYSTEM / UI_SPEC / INTERACTIONS | S-12 | SAAS UI-A…D: 15 pantallas y 11 criterios |
| TESTING / ENVIRONMENT | S-13/14 | Matrices MT/MC/DEM/CC/SUB/UI y [P1-L1](../tasks/plan.md) |
| DEPLOYMENT / OPERATIONS | S-08/10/14/18 | ARCH DEP-IND; G/DEP/runbook Coolify anteriores históricos, sin aprobación transitiva |
| ROADMAP / DECISIONS | S-15/16 | [ROADMAP](../docs/ROADMAP.md), [DECISIONS](../docs/DECISIONS.md), [pendientes](PLANNING_STATE.md) |

Excepciones que impiden aprobar el conjunto: Q-03, contrato de pagos; Q-18, fiscalidad y obligaciones; Q-08, destino y mecanismos de copias; Q-23, presupuesto; Q-38, condiciones comerciales adicionales; revisión Q-02/11/31, entorno Q-32 y cierre/aprobación Q-33/36. Cada una tiene evidencia y gate límite en el registro único.

## S-01 — Visión y éxito

**CONFIRMED:** convertir el POS existente en SaaS de autoservicio para talleres y autopartes de República Dominicana. Edgar actúa como persona responsable. Una empresa por suscripción, DOP/USD, mensual/anual, demo acotada y panel administrativo con métricas. Sucursales y soporte con impersonación quedan fuera del MVP. No se exige compatibilidad comercial local ni se autoriza eliminar el legado.

Éxito verificable propuesto: alta nominal sintética sin intervención del operador, aislamiento de datos, permisos aplicados en API, cambios/cierres sin pérdida ni doble efecto, pagos reconciliables y recuperación ensayada. SAAS F0/UI define objetivos internos medibles; no se prometen conversión comercial, capacidad para veinte empresas o SLA sin evidencia.

## S-02 — Catálogo, conteo y mercado

**APPROVED DEC-018/019/026/039/040.**

| Plan | Mensual DOP | Anual DOP | Mensual USD | Anual USD | Usuarios | Productos |
|---|---|---|---|---|---|---|
| Esencial | 799 | 8,149.80 | 15 | 153.00 | 4 | 300 |
| Negocio | 1,490 | 15,198.00 | 29 | 295.80 | 10 | 4,000 |
| Máxima | 2,490 | 25,398.00 | 49 | 499.80 | 25 | 10,000 |

Anual: 15% sobre doce mensualidades y prepago completo. DOP/USD son tarifas independientes. Cuentan usuarios habilitados, incluido el titular; invitaciones al aceptarse; productos activos/vendibles. Desactivar conserva históricos. No se añaden funciones exclusivas, conversión diaria o aumentos de precio por cuotas técnicas.

Diseño candidato: catálogo versionado, cotización e intento con importe, moneda, frecuencia y versiones inmutables. Importes en unidades menores enteras, sin sumar monedas. Cambiar precios requerirá decisión posterior.

**CONFIRMED CP-012:** NCF y facturación electrónica e-CF están en el alcance. **TO DEFINE Q-18:** impuesto, régimen, tipo de comprobante, requisitos técnicos y habilitación aplicables; no aprobación de una implementación fiscal concreta. No usar cero como sustituto de desconocido ni heredar el 18% del POS. El catálogo no se publica como total fiscal resuelto; tampoco acredita constitución de empresa o afiliación comercial.

## S-03 — Recurrencia, calendario y cancelación

**APPROVED DEC-031/032/034/036/037/041…044:** renovación automática mensual/anual; primer pago verificado antes de activar; cancelación al terminar tiempo pagado. Gracia de siete días para renovaciones de empresas previamente pagadas. Dentro de gracia se conserva calendario; agotada, nuevo período desde reactivación menos los siete días concedidos, **una sola vez por episodio**.

Alta inicial sin deducción. Reintentos/duplicados no vuelven a cambiar el período. Sin meses suspendidos cobrados, deuda, recargos, prorrateos monetarios o cargos extra. Ejemplo normativo: vence 10/11/2026, termina gracia 17/11, reactiva 18/11, vence 11/12. [SUB](SUBSCRIPTION_PROPOSAL.md) concreta instantes, mensual/anual, fin de mes, cambios de frecuencia, eventos tardíos y provisión fallida. La ancla rígida de CP-008 era propuesta descartada.

Con tiempo pagado, cambios de plan/frecuencia desde el siguiente ciclo. Suspendido contrata el nuevo directamente; descensos deben caber mediante acciones voluntarias, sin borrar historia. Mostrar período y próxima fecha antes de confirmar reactivación; los fallos no generan segundo cobro ni disponibilidad retroactiva ficticia. Renovación ordinaria automática no exige confirmar manualmente cada período.

**SUGGESTED SUB:** separar suscripción, período, episodio de gracia, cotización, intento, evento del proveedor y mandato. Identificador durable por intento; ante resultado desconocido, consultar antes de repetir un cargo. Estados reconciliables y autoridad central del período; la redirección del navegador no verifica pagos. Cancelación/revocación detiene nuevas órdenes, conserva acceso pagado y concilia órdenes ya enviadas, sin prometer que pueden retirarse unilateralmente.

Q-38 identifica condiciones adicionales de avisos, reintentos y cambio de moneda. Tras gracia solo se mantienen cuenta, estado, facturas, pago, soporte y exportación autorizada; no POS ordinario. Pago y estado utilizable permiten reactivar, sin quitar una suspensión independiente de seguridad. Impago no equivale a baja para borrar.

## S-04 — Demo

**APPROVED DEC-027:** registro y correo verificado antes del reloj; una demo activa por cuenta, hasta tres inicios por cuenta en 24 horas; IP como control adicional, nunca equivalente a persona o límite vitalicio. Treinta minutos, ficticios precargados, gráficas y hasta diez ventas, cinco cotizaciones y diez ajustes nuevos. No trasladar ficticios al negocio real.

**SUGGESTED DEM/MT/MC:** propósito, sesión y datos de demo separados de empresa. El servidor decide tiempo, cupos y permisos; contador y efecto comparten frontera consistente. Probar último cupo, sesiones concurrentes, reinicio y repetición de petición. Ocultar botones no satisface el contrato. Correo real solo después de acreditar proveedor, destino y envío autorizado.

## S-05 — Caja y cambio inmediato

**APPROVED DEC-029/038:** titular y encargado asignados al turno, suplencias registradas; titular declara apertura/fondo, encargado confirma cierre/diferencias. Cada movimiento pertenece como máximo a un cierre; los cierres históricos son inmutables.

Cambio voluntario hasta treinta días: acreditar venta, línea, cantidad e importe pagado; artículo **sin usar y en buen estado**. Cajero prepara y administrador autorizado confirma. Reemplazos por valor igual o superior y cobro de diferencia; si es inferior, ajustar o cancelar. Sin pérdida de sobrante, efectivo o saldo futuro. La cuarentena no hace elegible ordinariamente un artículo usado/no revendible. Garantías obligatorias requieren revisión jurídica separada Q-18.

**APPROVED DEC-038:** las correcciones posteriores requieren autorización, motivo, evidencia y movimientos enlazados; nunca editar cierres históricos.

**SUGGESTED CC:** operación de cambio durable, importes por línea, reserva, existencias, permiso, diferencia y estado de pago. Transacción por base empresarial y clave idempotente; cancelación, fallo o respuesta perdida mantienen estado consultable. No liberar reservas con resultado incierto. Conservar el resultado de CC-V4: rechazar R1=333 conserva R2=668 centavos; recalcularlo a 667 es la regresión que debe impedirse. Las líneas del mismo SKU a 100/200 deben permanecer diferenciadas, no solo conservar la suma total.

## S-06 — Actores y permisos

**APPROVED DEC-045…048:** operador principal único, MFA, reautenticación sensible válida cinco minutos, sesión de quince minutos de inactividad/ocho horas máximas y motivo/auditoría. Sin POS, secretos, infraestructura o impersonación por ser operador.

Titular empresarial concede/revoca por acción a miembros; admin POS no hereda. Ámbito tenant y controles auditables en API; sin redelegación, propiedad o consentimiento de pago implícitos. Sesiones empresariales de treinta minutos de inactividad/ocho horas máximas. Transferencia voluntaria con aceptación y reautenticación, sin facultad para cualquier delegado.

| Acción | Autoridad | Límite / mecanismo candidato |
|---|---|---|
| Contratar o reactivar | Titular o delegado de contratación | Tenant concreto; autorización empresarial y consentimiento del medio de pago separados |
| Cancelar | Titular o delegado de cancelación | Detener nuevos cobros y conservar acceso pagado; auditar resultado |
| Cambiar plan/frecuencia | Titular o delegado de cambio | Calendario/cupos; nuevo consentimiento si sale del mandato vigente |
| Invitar | Titular o delegado de invitación | Aceptación consume cupo; invitación no concede administración por sí sola |
| Conceder/revocar delegación | Titular | Por miembro, acción y empresa; sin redelegación ni rol confiado desde el cliente |
| Transferir titularidad | Titular actual y receptor autorizado | Aceptación/reautenticación; no transferir medio de pago por extensión |
| Administrar globalmente | Operador en DEC-013/028 | Suscripciones, cuotas y métricas; no contenido POS o facultades financieras implícitas |
| Recuperar host/copias | Edgar, custodio de infraestructura | Separado del panel y de los permisos empresariales |

SAAS F1-A/MT fija nombres candidatos y negativos entre procesos. Revocar exige autoridad central actual; no cancela retroactivamente una orden externa enviada. Efectos ligados al actor y versión de autoridad.

## S-07 — Datos y consistencia

**APPROVED DEC-012:** central de identidades, directorio, membresías y suscripciones; base lógica y credencial propia por empresa, revisadas ahora sobre PostgreSQL dedicado a Mecanet; trabajador privado separado de API. La decisión humana actual sustituye MongoDB como objetivo, no convierte las pruebas históricas Mongo en evidencia PostgreSQL. No servidor físico por empresa inferido.

**SUGGESTED MT/CC/SUB/DEM:** resolver ámbito y conexión desde autoridad central, nunca desde un tenant enviado por el cliente. Repositorios SQL por pool autorizado, claves foráneas e índices dentro de cada base, sin conexión global privilegiada como fallback. Concesiones de permisos, mandato, intento y cambio POS son entidades distintas. Entre central, base empresarial y proveedor no se presupone transacción atómica: usar estados durables, idempotencia y reconciliación.

La migración futura debe inventariar escritores y referencias, normalizar índices/secuencias según MT-D y conservar snapshots. No se ejecutan seed/import/reset sobre bases existentes. Aprobación de topología no prueba aislamiento o alta disponibilidad.

## S-08 — Servicios, rutas y recursos

**APPROVED CP-012:** frontend/backend en el VPS existente con despliegue y operación propios, sin gestión de Mecanet o PostgreSQL por Coolify; preservar Coolify, otras aplicaciones, Nexora, Mecanet-EAK y Vercel actual. Cuotas operativas y límites globales sin reservas físicas por empresa. Perfiles 120/240/360 solicitudes por minuto, 2/3/4 operaciones y 512 MiB/2 GiB/5 GiB son exclusivamente de ensayo.

**SUGGESTED, revisado en S-18:** Docker Compose independiente como mecanismo canónico propuesto, con imagen web con Nginx para landing y React compilado; imagen API Express compartida por trabajador privado con entrada/secretos distintos. mecanet.site público y app.mecanet.site aplicación con API relativa /api del mismo origen. No se necesita host API separado ni otro repositorio por hostname. Origin exacto, cookies host-only y CSRF; SPA, API y errores claramente separados.

QA y producción tienen proyectos Compose, redes, volúmenes y credenciales propios. PostgreSQL/worker internos, sin puertos públicos de DB o secretos de Nexora. MC concreta contadores, admisión durable, cotas y reconciliación de trabajo incierto. Métricas distinguen directo, estimado, compartido y no atribuible, con antigüedad visible; no CPU/RAM exactos por empresa ni ventas/clientes bajo etiqueta “métricas”.

La estimación Mongo de 196 conexiones de MT-C queda histórica; no dimensiona PostgreSQL. S-18 propone una cota nueva, pendiente de medición. G-03 separa mediciones y abortos de compilación, reemplazo, ejecución y tareas de operación.

## S-09 — Seguridad, telemetría y retención

**APPROVED:** Sentry DE/UE, errores depurados, versión e identificadores opacos, máximo 1.000 eventos mensuales; sin contenido del negocio, cuerpos, URL completa o grabaciones. Retenciones:

- Demo ficticia: purga dentro de una hora tras vencer.
- Identidad sin vínculos ni obligaciones: treinta días de inactividad; una suscripción activa impide esta purga.
- Abuso: veinticuatro horas; métricas: veinticuatro horas detalladas y treinta días agregadas.
- Errores: treinta días; copias: siete días.
- POS: treinta días tras baja efectiva para exportar, luego purga. El impago no inicia este plazo.

**SUGGESTED:** cookies opacas Secure/HttpOnly, autoridad central, Origin/CSRF, propósitos separados y bibliotecas estándar. Denegación por defecto y mínimo privilegio. Sentry recibe eventos filtrados y sujetos a cuota global dura; el cupo del plan no sustituye el límite del producto. El frontend tampoco debe permitir egreso sin control. Cuenta/región/contrato/configuración se acreditan antes de transmitir.

Jobs registran progreso y fallos. Separar eliminación activa de expiración de copias. Documentos con conservación obligatoria requieren regla externa Q-18, sin plazo inventado o promesa de retención indefinida.

## S-10 — Recuperación

**APPROVED DEC-050/051/052:** RPO de una hora; RTO de cuatro horas con host utilizable y veinticuatro por pérdida; copia cada treinta minutos, retención siete días, Edgar custodio fuera del panel y destino externo a Oracle. Son objetivos pendientes de ensayo.

**SUGGESTED G-04:** B2 privado en región europea como candidato principal frente a R2 Standard; selección, región y mecanismos de protección pendientes. Recuperación posible sin VPS ni acceso Oracle: cuenta/MFA, manifiestos, configuración y credenciales necesarias bajo custodia independiente.

El diseño anterior de dump/oplog Mongo queda sustituido para el objetivo PostgreSQL. Propuesta: copia física del cluster exclusivo Mecanet con WAL suficiente y verificación, conservando objetivos aprobados de frecuencia/retención. S-18 concreta únicamente el ensayo sintético; cadencia externa, volumen, costes y recuperación productiva requieren nueva acreditación. pg_dump por base no demuestra un punto coherente de todo el conjunto. Borrado por versión y lifecycle siguen propuestos, sin promesa de eliminación física inmediata.

Paquete: central y bases empresariales, referencias/índices/roles, configuración necesaria, manifiesto de integridad/versiones/digests y custodia separada de credenciales. Sin bases de otras aplicaciones o datos reales en QA. Roles de carga, limpieza y restauración separados. Journal mínimo posterior al punto de copia y bloqueo ante huecos de evidencia impiden presentar una restauración que resucite permisos o datos borrados como segura; mecanismo, coste y límites en G-04.

Restaurar aislado con egreso y cobros deshabilitados; verificar hashes, conteos, referencias, permisos, revocaciones y canarios. Reconciliar pagos antes de habilitarlos. Rollback de imagen no revierte cobros. Ensayos sintéticos P1/P2/P3 y pérdida del host/capacidad/RPO/RTO en P6.

## S-11 — Ingeniería

S-18 propone Node 24.21.0/npm 11.9.0, PostgreSQL 18.6 y pg 8.23.1; conserva React/Express y los locks hasta un cambio autorizado, sin reescribir framework o migrar a TypeScript. Bibliotecas de sesión, ESLint y Playwright son candidatos; versiones publicadas, integridad y compatibilidad deben acreditarse antes de instalar. Engines no equivalen a prueba.

Build Linux x64 con Buildx/QEMU para ARM64 fuera del VPS, seguido de QA ARM64 real. Q-32 debe acreditar disponibilidad, sin asumir runner gratuito. npm ci, contextos permitidos y secretos fuera de bundles/capas. Promover el mismo digest probado. Docker API-only, Date.now en Vite y npm install de build:cloud son carencias observadas, sin corregir ahora.

Integración futura: código probado, checkpoint, revisión/CI del candidato, merge autorizado, CI canónico y base siguiente. Antes de push comprobar PR #1, base y triggers para evitar despliegue documental incidental. No push/CI remoto actual. Revisión de dependencias y seguridad antes de cada corte/release correspondiente.

## S-12 — UI e interacciones

SAAS UI-A…D incorpora quince pantallas y once criterios: landing/planes, registro/login/verificación/recuperación, demo, checkout/suscripción, estado/impago, POS/caja/cambio, operador y permisos/titularidad. Conservar base React/Tailwind y marca existentes. **CONFIRMED CP-012: diseño totalmente cuadrado, border-radius:0, sin controles, tarjetas, diálogos, avatares o badges redondeados.** No se ha creado pantalla o prototipo funcional.

Antes de acción monetaria: importe, divisa, frecuencia, fiscalidad resuelta, período, próxima fecha y consentimiento. Procesando, error, cobro pendiente y conciliación no son éxito. Recuperar una intención conserva su identificador y consulta, sin generar segundo cargo. Permisos en API aunque el botón esté oculto. Cambio muestra valor reconocido, reemplazos y diferencia; cierre advierte movimientos pendientes.

Criterios futuros: 320/768/1440 px, teclado/foco, etiquetas, errores asociados, equivalente tabular de gráficas y reduced motion. Prueba por corte y recorrido conjunto P5. Metas internas de feedback y provisión de SAAS son candidatas, no promesas comerciales ni resultados medidos.

## S-13 — Pruebas y gates

| Garantía | Aceptación | Entorno/fase y evidencia actual |
|---|---|---|
| Identidad/delegación/aislamiento | Cero dato o efecto ajeno; revocación falla cerrada; sin rol forjado o redelegación | PostgreSQL QA, dos API; P1/MT adaptado. NOT VERIFIED funcional |
| Cuotas/demo | Último cupo, retry y reinicio sin doble efecto; una activa/tres inicios/24h/30min | Fundamentos P1, datos P2. Modelos CP-006 históricos |
| Caja/cambio | Cierres exclusivos/inmutables; rechazar R1=333 conserva R2=668, nunca recalcular a 667; mismo SKU a 100/200 conserva líneas distintas; fallo/restore sin doble valor | P2 CC/MT; caracterización anterior no prueba PostgreSQL |
| Pago/calendario | Autenticidad, duplicado, tardío, cancelación en vuelo; mes/año/finmes y deducción una vez | P3 sandbox acreditado; casos definidos, integración pendiente |
| Telemetría/retención | Máximo 1.000, redacción y plazos; purga/restore con cambios posteriores | P1/P4; cuenta y servicio antes de egreso |
| Recuperación | Integridad/canarios/permisos, sin cobros, tiempos medidos y abortos | P1 sintético, P2 POS, P3 pagos, P6 desastre |
| UI | Rutas, estados, permisos, foco, tamaños y movimiento reducido | Por corte P1…P4 y conjunto P5; sin captura nueva |
| Capacidad/producción | Consumo de build/runtime/jobs y otros consumidores; costes/RPO/RTO reales | P6, o antes si decide un parámetro |

Cada resultado registra esperado/observado, entorno, fecha, SHA y provenance. Las noventa pruebas de f5afaa2 y los experimentos CP-006 conservan su referencia histórica; documentación nueva no crea código probado nuevo.

## S-14 — Entorno, despliegue y operación

**Precedencia CP-012:** S-18 reemplaza la entrada Mongo/Coolify por PostgreSQL/operación independiente. Las referencias históricas de G/ENG no autorizan esa infraestructura ni aportan PASS transferible; QA en el VPS es posible solo con requisitos específicos acreditados.

QA requiere PostgreSQL exclusivo, dos empresas ficticias, dos API, credenciales/redes/volúmenes propios, egreso denegado y cleanup por identidad exacta. No usar Atlas ni PostgreSQL de Coolify. Una QA privada en el VPS es posible tras acreditar recursos y aislamiento; la autorización condicional no acredita capacidad ni alta disponibilidad.

G describe health/readiness, artefactos, drenaje y rollback compatible. Hosting aprobado no autoriza migrar web, cambiar DNS/redes o reiniciar host. Operación candidata: alertas por cola, conciliación, copias atrasadas, purga fallida, salud y coste; sin contenido sensible en logs. Incidentes conservan evidencia y estado antes de reabrir. No upgrades automáticos.

## S-15 — Factibilidad externa y coste

La comparación AZUL/CardNET en SUB recomienda CardNET de forma condicionada. Publicar tokenización o pagos automáticos no acredita por sí solo ambas monedas, calendario DEC-042, liquidación, autenticidad/idempotencia o admisión de Edgar. Q-03 pide documentos concretos; no se reduce el MVP para acomodar un proveedor.

Contexto fiscal dirigido: [DGII RNC](https://dgii.gov.do/cicloContribuyente/registroRNC/Paginas/default.aspx) distingue inscripción y condición de contribuyente. Se necesita acta, actividad, régimen y comprobantes aplicables. La [consulta DGII de 31/07/2025](https://dgii.gov.do/legislacion/consultas/Consultas%20Tecnicas%202025/Julio/Consulta%206-ITBIS%20software.pdf) trata licencias y soporte bajo condiciones; no acredita el encaje de Mecanet ni autoriza fijar 0% o 18%. La [orientación de Pro Consumidor](https://proconsumidor.gob.do/orienta-a-la-poblacion-sobre-como-hacer-un-consumo-inteligente-al-comprar-un-bien-o-servicio/) identifica remedios ante incumplimientos; no es un dictamen sobre este contrato B2B, SaaS o cambios voluntarios. Q-18 pide criterio específico y conservación obligatoria sin inventar plazos.

Correo candidato: Resend Free, con datos de correo en EE.UU. según su documentación. Esa ubicación no queda aprobada por exigir verificación de email o por aceptar Sentry DE/UE. Q-39 exige decisión de proveedor/destino antes del primer envío real; desarrollo y pruebas pueden usar adaptador sintético sin cuenta externa.

SUB conserva el modelo económico único: tarifas oficiales fechadas, volúmenes hipotéticos separados, paquetes privados y costes operativos desconocidos explícitos. G-04 desarrolla las copias. No se convierte Free Tier en presupuesto o capacidad probados; no hay gasto o reserva financiera aprobados.

## S-16 — Resultado histórico de F14 general y paso siguiente CP-010

[Plan/F14](../tasks/plan.md) registra la revisión efectiva de este candidato y sus contratos. Coherencia documental puede PASS; factibilidad pendiente y baseline/autorización no. Resultado final en [auditoría CP-010](../docs/audit/CP-010.md), sin READY FOR DEVELOPMENT.

P1-L1 conserva ocho cortes: fixture aislado, identidad/revocación, credenciales, recurso autorizado, admisión, observación, rutas/ciclo y restore. No se inicia ni se descompone de nuevo por rutina. Resolver entradas localizadas, revisar candidato, acreditar entorno/tooling, cerrar F14 y aprobar baseline/autorización por separado. Q-38 contiene exclusivamente condiciones comerciales adicionales; las respuestas actuales permanecen cerradas.
## S-17 — Revisión técnica y dependencias históricas CP-010

**Histórico, no diseño vigente:** las menciones siguientes a dump/oplog, B2/full30min, herramientas Mongo y costes son propuestas/evidencia de CP-010. Políticas humanas se conservan; volumen, método SQL, pins y coste operativo se reacreditan en S-18/DEP-IND antes del uso. RG-001 fue aprobado después; no reabre Q-40.

Q-02/MT/MC/G, Q-11/ENG y Q-31/UI fueron revisados completos. Recomendación favorable de los paquetes documentales corregidos para aprobación, **sin aprobación del agente**. Se corrigieron subtotal de conexiones, referencias a decisiones resueltas, alta nueva sin membresía previa, cobertura UI por corte, artefacto compilado por entorno y recuperación/journal. No nueva política o pantalla.

Cada digest con configuración pública distinta se valida aisladamente antes de promoverlo; un rebuild para cambiar VITE_API_URL no hereda el PASS de otro artefacto. Restore individual no puede monopolizar las copias del origen activo; journal cubre todas las copias aún recuperables cuyo punto precede a la revocación/purga, incluso una en curso que termine después. B2/full30min sigue SUGGESTED y condicionado a medir dump+upload+verificación, edad del punto y carga real; 1440ejecuciones no prueban la ventana.

**Entorno parcialmente acreditado:** [plan QA-EXP-02](experiments/cp010/qa-plan.md), [arnés](experiments/cp010/qa-local.cjs) y [resultados](experiments/cp010/qa-results.json). Mongo8.3.11/Windowsx64, Node24.14.0/driver6.20.0: ocho comprobaciones PASS de proceso/listener propios, PRIMARY autenticado, credenciales A/B, denegaciones y transacciones; cleanup confirmado. No entorno Linux/ARM64/Mongo7.0.43, dos API, restore, aplicación o capacidad productiva acreditados. ENG-05 prescribe habilitar/verificar motorLinux local y cadena objetivo; no instala nada ni atribuye ARM64 real a emulación.

[RG-001/DEC-053](../docs/DECISIONS.md#antecedente-de-dec-053-en-cp-010--propuesta-conservada) propone separar dependencias externas de los ocho cortes privados, manteniendo diseño de seguridad/recuperación, entorno suficiente, F14 y baseline/autorización. **Q-40 pendiente, gates vigentes CP-009 sin cambio**; ninguna baseline parcial se aplica por este documento. Si no se acepta la propuesta, se conserva el orden completo actual.

Q-38 está escrito en seis condiciones separables en SUB; CardNET y el profesional fiscal tienen borradores listos para enviar, **no enviados**. No nueva investigación de sus tarifas ni cuentas. Esta versión v0.10-CP010 sigue CANDIDATE / NOT APPROVED y no habilita P1.


<a id="s-18--candidato-limitado-p1-l1-v01-cp011"></a>

La referencia local histórica v0.1-CP011 remite al contenido en Git `bf28c4538d9a511a79f3c297d7dffb207879f2ea`. La sección siguiente es la versión corregida v0.2, no la baseline anterior ni una aprobación heredada.

## S-18 — Candidato limitado P1-L1 v0.2-CP012

**CANDIDATE / NOT APPROVED.** Única baseline limitada sometida a A: S-18, su manifiesto L-01 y los mismos ocho cortes actuales del plan. Contenedor v0.12-CP012; base `bf28c4538d9a511a79f3c297d7dffb207879f2ea`. Se identifica por el SHA del checkpoint CP-012 después de crearlo, sin autorreferencia. Historia y contrato Mongo/Coolify v0.1-CP011 conservados íntegros en ese Git base. Ninguna aprobación o PASS anterior se traslada automáticamente.

### L-00 — Resultado, autoridad y exclusiones

**Resultado:** identidad vigente → empresa autorizada → catálogo ficticio paginado; separación empresa/demo/operador, pools acotados, admisión durable entre dos API, observación local y recuperación sintética. Entrega privada, sin microservicios, bus, ORM o plataforma externa adicionales.

**CONFIRMED:** decisiones comerciales, permisos, privacidad y objetivos aprobados conservan su alcance. El mensaje humano del 2026-10-12 confirma PostgreSQL, React/Express, UI totalmente cuadrada, NCF/e-CF y operación independiente de Coolify. DEC-012 conserva separación multiempresa y mínimo privilegio; implementación relacional siguiente SUGGESTED. DEC-021/SC-005 cambia gestor, DEC-054/SC-006 cambia motor; DEC-055/056 UI/fiscalidad, DEC-057 implementación/QA condicional. La corrección no autoriza retirar recursos existentes de Coolify. No se vuelve a solicitar B ni se infiere A sobre un diseño aún no recibido por el usuario.

**Excluido del lote:** registro público, checkout, Subscription/Payment, tarjeta/calendario/reintentos Q-38, pago ficticio que active clientes reales, correo/Sentry/copias externas reales, panel completo, soporte/impersonación, escrituras POS/caja/cambio/stock/precios/impuestos, NCF/e-CF funcionales, migración real y credenciales heredadas. NCF/e-CF siguen en alcance SaaS, Q-18 antes de su código dependiente. Sin lanzamiento público, DNS, cambios compartidos, producción, Nexora, Mecanet-EAK, Vercel, cuentas, gastos o push/merge/CI por extensión. QA propia requiere acreditar seguridad, recursos y entradas específicas; no modificar otros servicios para hacerla caber.

### L-01 — Manifiesto selectivo y sustituciones

Referencias históricas fijadas al Git CP-011; conservar solo garantías independientes del motor enumeradas aquí, sin transitividad a paquetes completos o código heredado. **S-18 actual y ARCH DEP-IND gobiernan PostgreSQL/operación independiente; MT/MC/G/ENG Mongo son antecedentes, no contratos ejecutables vigentes.** S-00…17 no forman parte de A.

| Referencia en Git CP-011 | Parte conservada | Sustitución o límite CP-012 |
|---|---|---|
| S-18 L-02/03 y ARCH MT-B | Propósitos, permisos, plazos, revocación tras acuse, fixture privado | SQL primario y sesiones PostgreSQL; no majority/linearizable Mongo/connect-mongo |
| S-18 L-04 y ARCH MC-C/D/E | Perfiles, ventanas, tickets, incertidumbre, reducción, CAS/auditoría/reloj | Transacciones en una DB central, bloqueos ordenados; ninguna atomicidad central–tenant |
| S-18 L-05, SAAS F1-A/UI-C/D | Estados seguros, redacción, permisos y accesibilidad mínima | Mismo origen QA, radios cero; no quince pantallas |
| S-18 L-05/07, ARCH MT-E/G-04 | Conjunto coherente, journal, generaciones, canarios, reapertura cerrada | pg_basebackup/WAL del cluster exclusivo, no dump/oplog Mongo |
| Plan CP-011, ocho cortes L1.1…8 | Resultados por garantía y reversión compatible | Repositorios SQL, entorno nuevo y QA VPS condicional; ocho cortes conservados |
| DECISIONS vigente y ARCH DEP-IND | Alcance humano, cambio de infraestructura y diseño independiente | Mecanismos siguen SUGGESTED; A pendiente, B condicional vigente |

Fuentes primarias consultadas el12oct2026 en L-09/SOURCES. La suma de conexiones Mongo, PASS8 nativo, F14-L1 CP-011 y pruebas históricas son evidencia de sus objetos originales, no aceptación de esta versión.

### L-02 — Composición privada, bases y roles

Factorías fuera de `server.js`, que carga .env y rutas heredadas. Arnés privado prepara solo cluster PostgreSQL propio, central `mecanet_control`, bases A/B/demo y cuatro identidades sintéticas. No importar setup/seed/reset, POS, App/Layout completos o Settings global. Fixture, emisor y adaptador de disponibilidad ficticia fuera del entrypoint/imagen pública; nada los habilita por variable, `NODE_ENV=test`, header, body, query o `paid=true`. Aplicación pública sin autoridad comercial real falla cerrada.

A tiene membresía A y B tiene B; mismo UUID de producto con contenido distinto en cada DB. Negativas demo/operador exigen sesión autenticada y vigente mediante store/cookie/verificador estándar, luego denegación por propósito/acción antes de pool empresarial;401 de cookie inválida no acredita esa frontera. Estados MFA/verificación ficticios prueban guardas, no alta/email/MFA reales. Preflight externo valida destino/recursos propios, credenciales, egreso y cleanup **antes de I/O de preparación**. Ninguna cadena del cliente elige servidor, DB, rol, esquema o secreto.

**Topología relacional SUGGESTED:** cluster exclusivo por entorno, DB central y DB/credencial por empresa, demo separada. Nunca usar PostgreSQL de Coolify/Nexora/Mecanet-EAK. Propietario NOLOGIN por DB y preparador/migrador temporal separado. Roles LOGIN A/B solo CONNECT a su DB, USAGE del esquema propio y SELECT de `products(id,sku,name)` en L1; sin DML, CREATE, TEMP, SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, propiedad o pertenencia a otro rol. Revocar CONNECT/TEMP de PUBLIC en todas las DB propias, CREATE/privilegios por defecto públicos y EXECUTE público de funciones nuevas. `pg_hba.conf` allowlist por DB/rol/red, SCRAM y TLS interno validado; sin trust, FDW/dblink, SET ROLE ajeno o fallback privilegiado. Separación por DB no depende de RLS.

Central: identidad de sesión con DML solo sobre store; API con SELECT de identidad/membresía/acción/directorio y DML acotado a tickets/ventanas/fence, no concede permisos o cambia políticas. Reloj privado separado modifica TimeAuthority; API solo lee. Preparador posee DDL de sus recursos y no se monta en API/web. Política/revocación se ejercitan en handlers privados con credenciales técnicas propias; el rol operador de producto no entrega estas credenciales. Backup tiene REPLICATION solo en cluster propio y conexión explícita. Medición aplica L-05, sin pg_monitor/global stats.

**Orden final:** sesión → identidad/versión → membresía/acción → directorio/época/disponibilidad ficticia sin pool empresarial → admisión central → préstamo → consulta acotada → respuesta/fin acreditado. Cola sin préstamo. L1.3/4 internos preceden envoltura L1.5; sin publicación parcial. Bootstrap de reloj/política privado y acotado, independiente de petición admitida. Central y tenant usan conexiones/transacciones distintas: no FK cross-DB, 2PC ni atomicidad distribuida ficticia.

### L-03 — Sesiones, autoridad y datos mínimos

**SUGGESTED:** express-session1.19.0 + connect-pg-simple10.0.0; pool de sesiones limitado, store por propósito. `resave:false`, `saveUninitialized:false`, `rolling:false`, `createTableIfMissing:false`, `pruneSessionInterval:false`, `disableTouch:true`; migrador crea tabla/índice, purga privada acotada. ID CSPRNG32bytes y firma estándar; sin MemoryStore/JWT/localStorage/criptografía nueva. Cookies host-only `__Host-mecanet-session/demo/operator`, Secure/HttpOnly/SameSite=Lax/Path=/, sin Domain. Servidor verifica expiración/actividad/propósito/versión, no confía en que purga haya eliminado fila.

Empresa30min inactividad/8h absoluto; operador15min/8h, MFA/reauth5min; demo≤30min sin renovar. Rotación en login/reauth/cambio privilegio, logout durable; polling no renueva actividad; solo interacción acreditada actualiza lastInteractiveAt y persiste sesión, conservando el vencimiento absoluto. Acciones `catalog.read`, `usage.read`, `quota.change` distintas, denegadas por defecto. Rol POS no hereda contratación/plataforma. Sin UI de delegación, MFA real o soporte global.

QA SPA y `/api` bajo **mismo origen HTTPS privado**. Host/Origin exactos, CSRF sincronizador en mutaciones, Referer solo alternativa verificable cuando falta Origin; pre-sesión login acotada, GET sin efectos. No wildcard CORS ni relajar Secure. Nombre `.test` resuelto dentro de navegador/arnés aislado, CA de prueba confiada solo en ese perfil; sin DNS/confianza global. Remoto: túnel SSH hacia listener loopback propio propuesto18443, comprobando ocupación antes de usar; URL `https://app.mecanet.test:18443`. No proxy compartido para QA inicial.

| Tabla/contrato mínimo | Restricciones y autoridad |
|---|---|
| identities / sessions / session_registry | Identidad UUID PK/email UNIQUE/hash protegido/activo/security_version; store estándar sid PK/sess/expire. Registro autoritativo sid PK, identidad/purpose/generación/status/absolute_expires_at/last_interactive_at, FK central. Store no concede ni reactiva registro |
| memberships / role_policies / action_grants | UNIQUE identidad–tenant/rol/acción; FK dentro central, estados/versiones NOT NULL y CHECK; grants de fixture sin permisos implícitos |
| tenant_directory | UUID, db_name generado/único, secret_ref/credential_version, schema_version/data_epoch/estado; no contraseña, URI externa o nombre cliente |
| products A/B/demo | UUID PK, sku UNIQUE NOT NULL y name acotado; DTO `{id,sku,name}` propio del lote, sin precio/stock/impuestos o compatibilidad ObjectId prometida |
| policies / windows / tickets / time_authority / admission_fence | PK ámbito/carril/tick y ticket opaco único; límites CHECK≥0, versión/generación/owner/reservas/estado; FK central, estado durable |
| policy_audit / usage_projection | Actor/acción/motivo/versiones/instante, calidad/asOf/cobertura; ningún contenido empresarial; política+auditoría misma transacción |
| recovery_checkpoints / journal | Cohorte/generación/high-water-mark/hash/versiones, journal fuera de DB restauradas; roles/configuración bajo custodia propia |

**Logout y guardado concurrente:** cada autorización consulta session_registry vigente junto con identidad/acción; JSON de sessions por sí solo no autoriza. El emisor privado crea SID nuevo y registro en transacción; nunca reutiliza SID. Logout revoca primero el registro con COMMIT confirmado, después intenta eliminar store. Rotación revoca antiguo y registra nuevo en una transacción antes de emitir cookie tras persistencia de store; fallo posterior queda cerrado, sin restaurar SID antiguo. Store tiene DML solo sobre su tabla, nunca session_registry; emisor/revocador tiene privilegios acotados, API solo puede revocar su SID autenticado mediante función acotada, sin activar registros o usar SID de body/query. Un set/upsert tardío puede recrear JSON pero el registro revocado/ausente impide acceso. Limpieza por vencimiento no habilita reemisión/reuso ni convierte ausencia en activo. Pruebas de dosAPI: logout y rotación concurrentes con save tardío, cookie vieja negada tras acuse; fallo entre registro/store/cookie; suplantación de SID en petición no revoca otra sesión. La actividad interactiva actualiza registro bajo condición activo/generación; nunca reactiva ni extiende absoluto.

Revocación aumenta versión en transacción central, `synchronous_commit=on`, fsync/full_page_writes activos; acuse solo tras COMMIT confirmado. Autoridad en consulta única parametrizada con joins, primaria, snapshot READ COMMITTED nuevo por petición y deadline500ms; sin réplica, caché positiva o snapshot largo. Lectura empezada después del acuse ve revocación; operación autorizada antes puede terminar acotada. COMMIT incierto no confirma éxito, cierra acceso y se reconcilia por ID. No se promete cancelación retroactiva ni atomicidad con DB empresarial.

### L-04 — Pools, consulta y admisión SQL

Una pg.Pool por DB/credencial admitida, no por petición. Por API: central5, sesiones2, demo2 y hasta4pools empresariales de2; apertura concurrente≤1 por clave, min0, idle60s. Dos API: máximo34conexiones de aplicación; reloj/medición/preparación≤4adicionales, total propuesto≤38. Backup/restore presupuesto separado, no simultáneos sin medir. Límites de conexiones por servidor/rol con reserva administrativa cuantificada antes de uso; max_connections60 candidato QA, no capacidad. Retirar cifra196 Mongo. Pool antiguo solo cierra sin préstamos; rotación drena antes de reemplazar, sin duplicar cota. Liberar/destruir cliente correctamente, nunca devolver una transacción abortada o sustituir secreto.

`GET /api/tenants/:tenantId/catalog`: tenant/cursor UUID válidos, orden estable, SQL parametrizado, LIMIT≤100/salida≤1MiB, solo id/sku/name. No interpolar SQL/filtros/nombres del cliente. DB exclusivamente desde directorio, search_path fijo sin esquema escribible y tablas cualificadas. Cache/promesas por identidad/propósito/tenant/dataEpoch; invalidar y descartar tardías tras logout/revocación/cambio. ID A/B compartido no permite acceso cruzado. Read-only también por privilegio SQL.

| Perfil | QH/60s · QA · QL aprobados solo para ensayo | Parámetros adicionales SUGGESTED |
|---|---|---|
| Esencial |120 ·2 ·512MiB |B20/1s; QC300/60s y50/1s; QW8; QT10MiB/60s y2MiB/1s|
| Negocio |240 ·3 ·2GiB |B40; QC600/100; QW12; QT20/4MiB|
| Máxima |360 ·4 ·5GiB |B60; QC900/150; QW16; QT30/6MiB|

Global propuesto:8activas(6ordinarias/1esencial/1demo),48esperando(40/4/4), QH600/60s y100/1s(480/60/60 y80/10/10), QC1200/60s y200/1s(1080/60/60 y160/20/20). Sobres auth120/min,2activas/16esperando; operador60/min,2/8. Carril esencial por tenant1activa/1pendiente,12solicitudes/36UC/256KiB por60s y2/6/64KiB por1s. No registro público habilitado por sus números.

QH cuenta cada HTTP admitido una vez; rechazo previo no toma pool ni consume cuota del tenant forjado. Retry/poll admitidos consumen QH; jobs de lectura QA/QC sin HTTP ficticio. Lectura1UC; ningún writer POS. B incluido en N; reservas QC/QT vivas no caducan con ventana, bytes al enviar. QL solo medición/política/deuda, sin límite duro ante escritores excluidos.

Tickets WAITING→ACTIVE→FINISHED; EXPIRED/REJECTED para espera; ACTIVE sin fin acreditado pasa UNCERTAIN. Heartbeat5s/abandono15s detectan, no liberan. Transacción central SERIALIZABLE sobre **el mismo client**; bloquea filas precreadas en orden fence→global→carril→tenant→ticket, verifica versión/generación/tick y actualiza ventanas/cupos/ticket con COMMIT durable. Cambio de política por CAS+auditoría atómicos y acción distinta de usage.read. Error40001/40P01: rollback y retry completo≤3intentos/500ms totales, sin repetir trabajo empresarial ni responder antes del commit. COMMIT incierto: consultar ticket por ID y mantener reserva, nunca reintentar admisión a ciegas.

Reloj privado avanza≤1tick/100ms tras COMMIT, owner/generación;601buckets largos/11cortos sin recuperar ticks tras pausa/reinicio. Cada avance del reloj modifica físicamente clock_version/tick/generación de AdmissionFence y TimeAuthority en la misma transacción, en orden fence→autoridad. La admisión SERIALIZABLE comienza su frontera de escritura con UPDATE de admission_version=admission_version+1 en esa misma fila global, RETURNING tick/generación/clock_version; después lee TimeAuthority y exige coincidencia. Un snapshot anterior al COMMIT del reloj debe fallar con40001 al actualizar la fila cambiada: rollback y reintento completo antes de admitir. Un simple SELECT FOR UPDATE sin versión escrita no satisface esta garantía. API recibe solo UPDATE(admission_version) y SELECT de fence, sin UPDATE de tick/generación/clock_version ni privilegio UPDATE/SELECT FOR UPDATE sobre TimeAuthority. Negativa obligatoria: iniciar snapshot, confirmar avance de reloj, intentar admisión desde snapshot viejo y verificar40001/retry sin ticket ni operación duplicados; además denegar escritura del tiempo con credencial API. API no modifica TimeAuthority; falta de avance1s→503. Bootstrap genera barrera antes de readiness. Coste/conflictos se medirán, no rendimiento garantizado.

Espera≤2s, pool≤2s, consulta≤2s dentro deadline8s; statement_timeout/lock_timeout/idle-in-transaction ajustados al plazo restante. Timeout cliente no demuestra fin SQL: cancelación/cierre confirmados o UNCERTAIN. Retry lectura1/2/4s con jitter≤3 dentro deadline. Reducción conserva reservas/deuda/datos; overrides candidatos QH24–360/QA2–4/QL64MiB–5GiB,24h hasta7d; no editar otros límites libremente. No cambio de cifras comerciales por traducción SQL.

### L-05 — Observación, UI, operación y recuperación

Productor separado con función SQL allowlist para tamaños/proyección de DB propia. Si necesita SECURITY DEFINER: propietario NOLOGIN, search_path fijo, nombres cualificados, ningún SQL dinámico y EXECUTE revocado a PUBLIC; retorno técnico limitado y negativos obligatorios. Sin pg_monitor/pg_read_all_stats, textos SQL/pg_stat_activity, secretos, negocio, Docker socket, Coolify token o quota.change. Fuente/ámbito/unidad/calidad/asOf/cobertura/discontinuidad explícitos; CPU/RAM tenant no disponible, sin heap delta atribuido. Buffer≤4MiB/lote≤64KiB/una muestra activa, vaciado30s/servicio15s/DB5min; detalle24h/agregado30d. Caída→indisponible, no cero/buffer ilimitado/permiso mayor; sin SDK ni egreso Sentry.

| Interacción mínima | Estados y aceptación prevista |
|---|---|
| /login, /cuenta/empresas | Identidad sintética, carga/error/credencial inválida/expirada/autoridad caída/logout/pertenencias propias; sin registro/correo/selector comercial |
| /app/:empresa/catalogo | Contexto visible, carga/vacío/lista/401/403/404/429/503, cursor acotado. Caducidad confirmada limpia→login; red/503 cierra contenido protegido sin inventar logout |
| Propósitos | Sesiones demo/operador válidas denegadas antes de pool aunque conozcan IDs; sin panel/demo comercial/impersonación |
| UI cuadrada | border-radius:0 en controles, tarjetas, tablas, diálogos, badges/avatares. No clases rounded heredadas; teclado/labels/foco/error no solo color,320/768/1440px/reduced motion |
| API/ciclo | /api JSON nunca HTML SPA, assets ausentes404/deep links; errores no-store. Health sin secretos, readiness central/reloj/generación/no drenaje. Drenar≤30s; parada no demuestra finalización de ticket |

**Operación independiente SUGGESTED:** un proyecto Compose por entorno, Nginx no privilegiado para React y `/api`, dos API QA para agregación, PostgreSQL exclusivo y worker privado necesario para reloj/reconciliación/proyección. Worker reutiliza imagen backend, entrada/secretos distintos; sin otro repo. Migración/backup/restore tareas puntuales. PostgreSQL5432 sin publish al host; web/API red frontal propia internal y API/worker/PG red de datos internal, web sin acceso DB. Verificar efectivamente ausencia de egreso y acceso a redes ajenas; internal por sí solo no acredita todo aislamiento. Sin host network/privileged/socket/montajes ajenos/labels de descubrimiento Coolify. Un proyecto Compose no limita al administrador del daemon: rol SaaS no da acceso Docker/root.

QA inicial HTTPS loopback18443+túnelSSH después de acreditar puerto/host, sin tocar80/443/proxy/DNS. Futuro público: mecanet.site landing y app.mecanet.site SPA con API relativa `/api`; no necesidad de api.mecanet.site ni CORS general. Integración futura con proxy compartido requiere mecanismo basado en inspección y permiso específico; entrada compartida no vuelve gestor de despliegues a Coolify. Arquitectura/cotas/puertos actuales y alternativa precisa en ARCH DEP-IND.

Build fuera del VPS compartido salvo presupuesto/autorización específicos; locks/SHA/digests inmutables, sin secretos en contexto/capas/VITE. Runtime no-root/read-only donde viable/tmpfs mínimo/CPU/RAM/PIDs/logs/health revisados antes de crear. Actualizar: preflight→copia requerida→artefacto probado→migración compatible→recrear solo proyecto exacto→readiness/negativos→aceptación. Compose no aporta rollback automático: conservar manifiesto/digests anteriores, drenar y recrear solo release compatible; no resetDB/prune/down-v. Exportar archivos/config no secreta y custodiar secretos independientemente de Coolify; no UUID/token/API o volumen de Coolify como dependencia.

**L1.8 SUGGESTED, ensayo sintético con barrera:** antes de iniciar la copia, cerrar durablemente nuevas admisiones/consumos/emisiones de sesiones y cambios no restrictivos de este QA; registrar intención/barrera/generación en journal externo y central y obtener acuse de ambos procesos. Drenar/reconciliar trabajo previo; conservar reservas inciertas, no liberarlas. Pausar reloj/proyección y no reabrir origen desde esa barrera hasta restauración/corte. Después de la copia solo se permiten canarios restrictivos (revocación/purga) journalizados, sin nuevos tickets/consumos/resultados fuera de la cohorte. La prueba debe intentar admisión/escritura posbarrera por ambos procesos y comprobar rechazo; si aparece consumo o ticket posterior no representado, restauración permanece cerrada. Así no se pierde deuda ausente de una copia antigua: los anteriores están en el conjunto y los posteriores se impiden. Esta barrera es del ensayo L1.8, no una solución productiva de copias cada30min: continuidad/recuperación con escritores reales requiere diseño y evidencia antes de uso en fases posteriores.

pg_basebackup físico del cluster exclusivo QA con WAL stream y backup_manifest, pg_verifybackup de misma versión y replay en segundo cluster/volumen nuevo. Central/A/B/demo/roles pertenecen a la misma cohorte física; esto no crea transacción cross-DB. pg_dump por DB o pg_dumpall secuencial no sustituyen coherencia global. Nunca copiar PostgreSQL de Coolify/otra aplicación. Antes: herramientas/versiones/timeout/cota WAL/disco/slot temporal y cleanup exactos; abortar crecimiento indebido sin sacrificar fuente.

Journal durable externo al cluster restaurado: intención restrictiva+fsync antes de revocación/purga ficticia, COMMIT central y resultado durable por ID/secuencia. Checkpoint/high-water-mark en manifiesto; archivo ySQL no comparten transacción. Intención sin resultado se aplica restrictivamente; éxito sin intención impide aceptación. Canarios posteriores al backup prueban revocación/purga; timestamps no prueban journal completo. Restaurar con egreso/admisión cerrados: hashes/LSN/versiones/roles/grants/índices/constraints/conteos/canarios; replay de journal/tombstones, invalidar sesiones previas/demo terminal, cambiar generación/dataEpoch y rotar credenciales de destino. Antes de arrancar la copia, adaptar HBA/listeners/rutas propias y eliminar cualquier conexión/acción hacia origen; no iniciar configuración copiada sin revisión. Hueco/tamper/origen viejo vivo/ticket incierto impiden reapertura, sin borrar deuda. Cierre anterior/barrera acreditados, no sleep mágico. Repetir negativas afectadas y medir; pg_verifybackup solo no acredita aplicación recuperada. Copia local no demuestra pérdida de host, copia fueraOracle, cadencia/RPO/RTO o costes productivos.

### L-06 — Runtime y entorno por corte

| Elemento | Candidato exacto / tratamiento | Evidencia y límite |
|---|---|---|
| Runtime |Node24.21.0/npm11.9.0|Pins CP-011; binario/digest/integridad/advisories y ejecución por acreditar |
| Motor |PostgreSQL18.6, misma versión en herramientas|Versioning oficial consultado12oct2026; imagen ARM64/digest no adquiridos; no instalación/HA/capacidad acreditadas |
| SQL |pg8.23.1 JavaScript puro, sin pg-native/ORM|Registry oficial, engines≥16; integración NOT VERIFIED |
| Sesión |express-session1.19.0 + connect-pg-simple10.0.0|Store SQL nuevo; engines Node18.18/20.9/≥22, dependencia pg^8.12 publicados, no compatibilidad ejecutada |
| Cliente/API |React18.3.1/Express4.22.3/Vite6.4.3/Vitest4.1.11/Tailwind3.4.18|Locks conservados; Mongoose/driverMongo legado fuera de L1, sin desinstalar/migrar producto completo |
| Estática/navegador |ESLint10.12.0/@eslint/js10.0.1/hooks7.1.1/Playwright1.64.0|Pins propuestos CP-011; revisión/lock/seguridad/integridad/binarios antes de adquirir |
| Build/operación |Docker Compose plugin; Nginx; Buildx solo si cross-build; pg_basebackup/pg_verifybackup18.6|Versiones/digests efectivos antes de cada uso; Docker29.8.1/Compose5.5.1 observados remotamente CP-012 no prueban el paquete ni autorizan cambios compartidos |

Metadatos nuevos leídos sin instalar: pg8.23.1 integrity `sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==`; connect-pg-simple10.0.0 integrity `sha512-pBGVazlqiMrackzCr0eKhn4LO5trJXsOX0nQoey9wCOayh80MYtThCbq8eoLsjpiWgiok/h+1/uti9/2/Una8A==`. Integridad publicada no prueba descarga/seguridad; revisar advisories, compatibilidad, origen/licencia/lock antes de uso. Crítica/alta aplicable bloquea sin exclusión silenciosa. Si debe cambiar diseño/pin de baseline aprobada, registrar diferencia antes de ampliar autoridad.

CP-011 no halló WSL/Docker local el8oct; diagnóstico actual reportado en CP-012 sigue sin WSL/Docker/PostgreSQL local. QA-EXP-02 solo Mongo8.3Windows, no verifica PostgreSQL. Inspección remota actual acredita host ARM64 y motor Docker, no PostgreSQL Mecanet ni capacidad para el ensayo. PostgreSQL15 interno de Coolify fuera de alcance. VPS puede alojar QA propia condicionada; no exigir WSL como única ruta si otra cadena autorizada está acreditada. Build no se ejecuta sobre host compartido por disponibilidad del daemon.

| Momento | Entrada | Salida funcional posterior |
|---|---|---|
| L1.1…3 |A, B condicional vigente, runtime/pins, PostgreSQL propio, recursos/credenciales/egreso/cleanup acreditados|Fixture/autoridad/roles/pools reales; no exigir APIs ya construidas |
| L1.4…6 |Lo anterior, navegador/HTTPS privado/fallos acotados; reloj/fence se construye enL1.5|Recorrido y dos API reales, agregación/permisos/métricas; simulación no da PASS integrado |
| L1.7 |Artefactos por digest/config/entrada privada/presupuesto/reversión; permiso preciso si cambia compartido|Ciclo independiente/rutas/UI/health; ARM64 real para aceptar esa salida, no x64/QEMU |
| L1.8 |Segundo destino propio, herramientas/WAL/espacio/journal/cleanup acreditados|Backup/replay/restore/negativos/cleanup; sin cuenta externa necesaria |

Sobre QA **SUGGESTED, sin suficiencia demostrada:** runtime conjunto≤1vCPU/2GiB RAM; restore adicional≤1GiB en secuencia sin build/release simultáneo, sujetos a límites/medición de ARCH DEP-IND. Fixture≤100productos por A/B y4identidades; datos/WAL/backup≤4GiB/logs≤128MiB. Margen mínimo propuesto host3GiB RAM disponible y disco15GiB/10%, aplicado con criterio más exigente. Verificar recursos/cgroups/consumidores/salud antes de crear, no snapshot como capacidad. Requests/plazo y abortos antes del ensayo: destino/egreso inesperado, secreto, aislamiento fallido, límite o impacto ajeno. Build/deploy/runtime/backup tienen sobres distintos; no quitar controles para caber.

### L-07 — Mismos ocho cortes y aceptación

Archivos siguientes **candidatos, no creados**. Frontera SQL explícita, sin renombrar modelo Mongo para simular compatibilidad. Trabajo interno puede dividirse sin nuevas fases/cortes.

| Corte | Módulos/archivos candidatos | Salida y reversión |
|---|---|---|
|L1.1 Fixture|tests/qa/preflight, fixture SQL/harness/manifiesto privados|Canarios/cleanup reproducibles, destino indebido aborta antes deI/O, emisor fuera de artefacto público; retirar solo propios|
|L1.2 Identidad|server/saas/auth y repositories/control, session store, middleware sin legacy|Sesión/rol/acción/propósito/logout-rotación frente a save tardío entreAPI/revocación trasCOMMIT/caída; cerrar admisión antes de revertir compatible|
|L1.3 Credenciales|server/saas/db/pools, secret resolver y migración inicialQA|A↔B/control/admin rechazadosSQL/HBA; rotación/cotas sin evicción activa/fallback; no ampliar permisos|
|L1.4 Recurso|server/saas/repositories/catalog/ruta parametrizada, client/src/saas|IDs/path/headers/inyección/proyección/paginación/cache tardía sin cruce; retirar ruta si falla|
|L1.5 Admisión|server/saas/admission, clock/fence/tickets/policy/tests dosAPI|Último cupo/ventana/retry/poll/job/snapshot previo al tick y fence versionado/40001/deadlock/ACK perdido/reinicio/reducción/CAS+audit; no liberar porTTL|
|L1.6 Observación|server/saas/observability, productor/proyección/roles mínimos|Canarios sensibles ausentes, calidad/fecha/denegación negocio/cuotas/buffer finito; detener colección|
|L1.7 Rutas/ciclo|entrypoint privado, Dockerfiles/contextos/composeQA/Nginx/ciclo/browser|Same-origin/API JSON/TLS/CSRF/deep links/health/drenaje/UI cuadrada/digest/ARM64; recrear solo proyecto compatible|
|L1.8 Restore|runbook/manifest/harness pg_basebackup/verify/replay/journal|Cohorte/roles/integridad/tombstones/generación/tickets/negativas; hueco cierra, sin sobrescribir origen|

Registrar versión/SHA/actor/destino/esperado/observado/provenance; secretos sin imprimir. Pruebas puras/browser/PostgreSQL real distintas; Mongo8PASS/modelosCP006/90tests no rellenan celdas. Riesgos residuales: API con varios secretos y host/cluster únicos, sin aislamiento ante compromiso total/root o HA inferida. Admisión caliente/restore pueden requerir redimensionar tras medir. Rollback compatible conserva datos/roles/journal; cambio incompatible exige forward fix o migración ensayada, nunca downgrade ciego.

### L-08 — Gates y siguiente acción

[F14-L1 del plan](../tasks/plan.md#f14-l1--revisión-de-coherencia-cp-012) revisa de nuevo impacto; no hereda PASS CP-011. Coherencia, A, B condicional, entorno y salida funcional distintos. F14 general parcial, sin READY FOR DEVELOPMENT global o P0 completa por corrección.

**Bloqueantes:** A de **P1-L1 v0.2-CP012/S-18/manifiesto/ocho cortes**, identificada por SHA exacto e incluyendo SQL/Compose/origen/restore; Development/Environment Gate del corte. **B autorizada condicionalmente por mensaje actual**, no otra pregunta B. Implementar y verificar cuando entradas satisfechas. QA VPS solo con seguridad/recursos/propiedad/permisos/reversión acreditados; modificar proxy compartido exige autorización específica, innecesaria para QA inicial por túnel.

Q03 antes de código de pagos/sandbox antes de integración; Q38 antes de código o publicación comercial dependiente; Q18 antes de NCF/e-CF/impuesto/garantía/conservación obligatoria(posibleP2); Q08 antes de copias externas; Q23 antes de adquisición/gasto; Q39/Sentry antes de egreso; Q34 capacidad/RPO/RTO en destino yQ35 salidas por fase. No reabrir precios/demo/motor/NCF/e-CF ni aprobar SaaS completo porA.

### L-09 — Fuentes primarias y límites

Consulta **2026-10-12**, VENDOR-DOCUMENTATION. Contratos Mecanet propuestos por el agente, no prueba ejecutada:

- PostgreSQL [versionado](https://www.postgresql.org/support/versioning/), [privilegios](https://www.postgresql.org/docs/18/ddl-priv.html), [roles](https://www.postgresql.org/docs/18/sql-createrole.html), [HBA](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html): versión/roles/autenticación, no aislamiento ya medido.
- PostgreSQL [aislamiento](https://www.postgresql.org/docs/18/transaction-iso.html): READ COMMITTED y SERIALIZABLE/reintentos; no transacciones distribuidas entreDB.
- node-postgres [queries](https://node-postgres.com/features/queries), [transactions](https://node-postgres.com/features/transactions), [pool](https://node-postgres.com/apis/pool): parámetros, mismo cliente y préstamo/liberación; límites propuestos propios.
- [connect-pg-simple](https://github.com/voxpelli/node-connect-pg-simple), [pg8.23.1 registry](https://registry.npmjs.org/pg/8.23.1), [store10.0.0 registry](https://registry.npmjs.org/connect-pg-simple/10.0.0): contrato/metadatos; no instalación/advisory/compatibilidad ejecutada.
- PostgreSQL [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_basebackup](https://www.postgresql.org/docs/18/app-pgbasebackup.html), [pg_verifybackup](https://www.postgresql.org/docs/18/app-pgverifybackup.html): DB individual/cluster/archivo verificado; recuperación de aplicación aún pendiente.
- Docker [Compose en producción](https://docs.docker.com/compose/how-tos/production/), [redes](https://docs.docker.com/compose/how-tos/networking/): mecanismos, sin capacidad/aislamiento/autorización implícitos.
