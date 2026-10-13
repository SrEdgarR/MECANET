# Decisiones — Mecanet SaaS

**Vigencia CP-012, 2026-10-12:** mensaje humano «Corrección obligatoria del modelo de despliegue». DEC-021/SC-005: operación propia junto a Coolify, sin gestión de Mecanet por Coolify. DEC-012/054/SC-006: PostgreSQL objetivo. DEC-055/056: UI cuadrada y NCF/e-CF confirmados; DEC-057: implementación/QA autorizadas condicionalmente, baseline A aún pendiente. No se atribuyen estas aprobaciones a una fecha histórica no acreditada. Compose/origen siguen PROPOSED. Los registros previos se preservan como antecedentes.

Registro inicial: 2026-10-07. APPROVED significa aprobado **solo en el alcance indicado**, no implementación ni despliegue autorizados. Nivel de validación: la aprobación humana define intención; no demuestra factibilidad técnica/comercial. Todas las propuestas deben volver al usuario con evidencia concreta.

CP-006, fuente humana directa del 2026-10-07: se aprueban el alcance exacto de DEC-012/013/018/019/026/027 y las decisiones independientes DEC-028…033. DEC-016 amplía el objetivo económico. Mensual/anual, descuento y demo de CP-004 se conservan. Valores técnicos, USD, fiscalidad, condiciones adicionales de demo/lifecycle/crédito y mecanismos no confirmados siguen SUGGESTED/TO DEFINE en los borradores. Una decisión APPROVED no aprueba todos los detalles del documento enlazado ni autoriza implementación.

CP-007, fuente humana directa recibida el **2026-10-08**, §2 A/B/C del texto adjunto: concreta DEC-028 (modelo operativo y tres perfiles solo de ensayo) y aprueba por separado DEC-034 (gracia) y DEC-035 (beneficiario). No se retrofecha la aprobación ni se ratifican por extensión los mecanismos de los borradores. Historia CP-006 y SC-001/002/003/SE-001 conservada.

Historia CP-008, fuente humana directa2026-10-08 §§1A/B/C: DEC-036/037/038 aprobadas en alcance exacto; SC-004 sustituye DEC-030/035 únicamente en saldo futuro incompatible. Q-20 resuelta, Q-26/27/29 descartadas por cambio de alcance, no verificadas funcionalmente. Candidatos Q-02/11/31 completos para revisión, sin baseline ni autorización de implementar.

**Vigencia CP-009 (2026-10-08):** fuente humana directa `3b08888b-83a2-452b-9630-f7a42c8b7b54/Texto pegado.txt`, §§2…8. Se amplían DEC existentes en su alcance exacto y se registran DEC-039…052; calendario automático, delegación, retenciones y recuperación ahora tienen autoridad humana. Servicios/contratos fiscales, destino concreto de copias, presupuesto, mecanismos técnicos y baseline siguen sujetos a sus gates. Los textos históricos no reabren decisiones resueltas. Revisión de impacto única al final; no nueva SPEC CHANGE/ERRATA ficticia por sustituir propuestas nunca aprobadas.

## DEC-001 — Metodología

- Fecha/estado/tipo: 2026-10-07 / APPROVED / proceso.
- Problema: evolucionar un proyecto existente con control de gates y trazabilidad.
- Decisión: aplicar Prompt Maestro v2.0 adjunto; registrar AUD sin editarlo silenciosamente.
- Alternativas/motivo: ejecución directa sin gates no satisface la petición explícita.
- Alcance/documentos: adopción y evolución completa; AGENTS, índice, estado, checkpoints, mapa y feedback.
- Validación/fuente: HUMAN-ASSISTED, petición del usuario en esta conversación; hash de la copia en README.
- Límites/revalidación: no es aprobación de arquitectura, planes o código; cambiar metodología exige revisión explícita.

## DEC-002 — Unidad de suscripción

- Fecha/estado/tipo: 2026-10-07 / APPROVED / producto.
- Problema: determinar qué separa a los clientes del SaaS.
- Decisión: una empresa por suscripción con usuarios y datos propios.
- Alternativas/motivo: suscripción por usuario u otro agrupamiento no elegidos; respuesta explícita del usuario.
- Alcance/documentos: PRODUCT, DATA_MODEL, USER_FLOWS, SECURITY futuros; borrador SAAS_DISCOVERY.
- Validación/fuente: HUMAN-ASSISTED, primer lote de respuestas.
- Límites/revalidación: no decide DB por empresa ni si una identidad puede pertenecer a varias empresas; DG-TENANT.

## DEC-003 — Sucursales

- Fecha/estado/tipo: 2026-10-07 / APPROVED / alcance.
- Problema: evitar asumir jerarquías adicionales en el MVP.
- Decisión: las sucursales quedan para después del MVP.
- Alternativas/motivo: sucursales desde el inicio descartadas para este alcance por elección del usuario.
- Alcance/documentos: PRODUCT, ROADMAP, DATA_MODEL; no implementar branchId preventivamente.
- Validación/fuente: HUMAN-ASSISTED, respuesta explícita del usuario.
- Límites/revalidación: reabrir con SPEC CHANGE si se adelantan al lanzamiento.

## DEC-004 — Jurisdicción del operador

- Fecha/estado/tipo: 2026-10-07 / APPROVED / producto-legal.
- Problema: evaluar proveedores de cobro y estrategia jurídica.
- Decisión: la persona/empresa que cobrará se registrará en República Dominicana.
- Alternativas/motivo: no asumir entidad extranjera para habilitar proveedor.
- Alcance/documentos: BUSINESS_RULES, SECURITY/legal inventory, integración de pagos.
- Validación/fuente: HUMAN-ASSISTED, respuesta del usuario; no es verificación documental de constitución.
- Límites/revalidación: países de compradores, requisitos fiscales y suficiencia legal TO DEFINE; antes de Legal/Production Gate.
- **Vigencia CP-009, 2026-10-08:** CP-009 §2 identifica a Edgar como persona (DEC-040) y talleres/autopartes RD como mercado (DEC-039). No se infiere empresa constituida ni alta fiscal. La descripción anterior persona/empresa era el alcance histórico.

## DEC-005 — Alta de clientes

- Fecha/estado/tipo: 2026-10-07 / APPROVED / producto.
- Problema: fijar si el MVP puede depender de activación manual.
- Decisión: autoservicio con registro y pago en línea desde el lanzamiento.
- Alternativas/motivo: alta asistida no elegida como sustituto del MVP.
- Alcance/documentos: PRODUCT, USER_FLOWS, UI_SPEC, ROADMAP y DG-PAY.
- Validación/fuente: HUMAN-ASSISTED, respuesta del usuario.
- Límites/revalidación: no define prueba gratuita, proveedor, estados de impago ni precios; completar antes de Specification Gate.

## DEC-006 — Previsión inicial

- Fecha/estado/tipo: 2026-10-07 / APPROVED / planificación de capacidad.
- Problema: dimensionar escenarios de evaluación.
- Decisión: usar hasta 20 empresas en los primeros seis meses como previsión comercial.
- Alternativas/motivo: rangos mayores no elegidos; respuesta del usuario.
- Alcance/documentos: escenarios de ARCHITECTURE/ENVIRONMENT/TESTING.
- Validación/fuente: HUMAN-ASSISTED; previsión, no resultado de benchmark.
- Límites/revalidación: concurrencia, tráfico, datos y crecimiento fuera de esa ventana TO DEFINE; revalidar ante cambio de volumen y antes de capacidad/producción.

## DEC-007 — Monedas de suscripción

- Fecha/estado/tipo: 2026-10-07 / APPROVED / producto-comercial.
- Problema: evitar mezclar moneda operativa del POS con cobro del SaaS.
- Decisión: ofrecer cobros de suscripción en DOP y USD.
- Alternativas/motivo: moneda única no elegida; respuesta del usuario.
- Alcance/documentos: BUSINESS_RULES, catálogo versionado de planes/precios, checkout, métricas separadas por moneda.
- Validación/fuente: HUMAN-ASSISTED; capacidad del proveedor todavía NOT VERIFIED.
- Límites/revalidación: precios, impuestos, liquidación y conversión no aprobados; DG-PAY. El 18% del POS no se hereda como regla fiscal del SaaS.
- **Vigencia CP-009, 2026-10-08:** Tarifas USD/DOP independientes aprobadas en DEC-019 por CP-009 §2. Liquidación y requisitos bancarios del proveedor permanecen NOT VERIFIED, separados de moneda cobrada e impuestos.

## DEC-008 — Evaluar AZUL

- Fecha/estado/tipo: 2026-10-07 / APPROVED / investigación de proveedor.
- Problema: elegir un proveedor viable para un comercio de RD.
- Decisión exacta: evaluar AZUL como preferencia del usuario; no hay cuenta de comercio aprobada.
- Alternativas/motivo: Stripe/Paddle solo referencias exploratorias; no seleccionados ni contratados.
- Alcance/documentos: ARCHITECTURE_OPTIONS y SOURCES; futura decisión de integración separada.
- Validación/fuente: HUMAN-ASSISTED + SRC-03/04 VENDOR-DOCUMENTATION consultadas 2026-10-07.
- Límites/revalidación: no confirma DOP/USD, alta, checkout seguro ni webhooks; obtener contrato técnico vigente y sandbox antes de DG-PAY/integración real.
- **Vigencia CP-009, 2026-10-08:** CP-009 §4 confirma que AZUL fue sugerencia, **no proveedor obligatorio**. Q-03 compara AZUL y CardNET; solo una tercera alternativa si hay evidencia de adecuación. Selección recomendada/documentos faltantes en SUB, sin modificar automático/DOP/USD/gracia para acomodar proveedor; no cuenta, contacto o contrato autorizados.

## DEC-009 — Plataformas existentes

- Fecha/estado/tipo: registrada 2026-10-07; sustituida en CP-002 / SUPERSEDED / infraestructura.
- Problema: preservar el destino solicitado del despliegue existente.
- Decisión: Vercel para web/frontend y VPS con Coolify para backend/MongoDB; usar mecanet.site y app.mecanet.site según su función aprobada.
- Alternativas/motivo: cambio de proveedor no solicitado; decisión previa del usuario en esta conversación.
- Alcance/documentos: DEPLOYMENT existente; inventario y roadmap.
- Validación/fuente: HUMAN-ASSISTED previa; REMOTE confirma recursos actuales.
- Límites/revalidación: no obliga a mantener para siempre un solo host ni aprueba recursos nuevos/gastos; revisar tras capacidad/aislamiento y antes de cambios materiales.
- Sustitución parcial: DEC-021 / SPEC CHANGE SC-001 sustituye el destino futuro Vercel+VPS por frontend y backend en VPS/Coolify. Se conservan las funciones de mecanet.site y app.mecanet.site, MongoDB en Coolify y los recursos actuales. La aprobación original fue real; SUPERSEDED no borra su historia ni significa que ya se migró producción.

## DEC-010 — Cuenta GitHub

- Fecha/estado/tipo: registrada 2026-10-07 / APPROVED / operación.
- Problema: proyecto migrado de cuenta.
- Decisión: trabajar exclusivamente sobre SrEdgarR/MECANET.
- Alternativas/motivo: cuenta anterior fuera de alcance; instrucción explícita persistente.
- Alcance/documentos: Git, CI, despliegues, AGENTS y checkpoints.
- Validación/fuente: HUMAN-ASSISTED previa; cuenta/remote verificados LOCAL/PLATFORM-CONFIRMATION en CP-001.
- Límites/revalidación: comprobar antes de cada mutación remota; no autoriza merge/push incidental durante P0.

## DEC-011 — Dominios y recursos ajenos

- Fecha/estado/tipo: registrada 2026-10-07 / APPROVED / operación.
- Problema: VPS y dominio compartidos con otras aplicaciones.
- Decisión: conservar nexora.mecanet.site y otros subdominios/recursos existentes fuera de Mecanet.
- Alternativas/motivo: reemplazar toda zona DNS o limpiar recursos por prefijo viola el alcance.
- Alcance/documentos: ENVIRONMENT/DEPLOYMENT futuros, AGENTS, inventario.
- Validación/fuente: HUMAN-ASSISTED previa; inventario REMOTE de consumidores.
- Límites/revalidación: inventariar consumidores y blast radius antes de cada cambio; sin prune global ni reboot incidental.

## DEC-012 — Base central y base por empresa con PostgreSQL

- Fecha/estado/tipo: 2026-10-12, actualización CP-012 / APPROVED / arquitectura-seguridad; SC-006 y DEC-054.
- Decisión vigente: conservar separación multiempresa y mínimo privilegio, central y base lógica/credencial por empresa y provisión privada; sustituir exclusivamente el motor MongoDB por PostgreSQL. La implementación relacional se somete a revisión en S-18 v0.2-CP012; ninguna garantía se obtiene por cambiar el nombre del motor.
- Fuente: mensaje humano actual §4 «PostgreSQL como motor objetivo del SaaS»; React/Express se conservan. No se busca ni inventa una aprobación previa.
- Límites: los roles SQL, pools, admisión, revocación y recuperación nuevos siguen SUGGESTED hasta A. Sin migración, datos reales ni reutilización de coolify-db. Las pruebas Mongo históricas no acreditan PostgreSQL.

### Antecedente DEC-012 hasta CP-011 — conservado

- Fecha/estado/tipo: aprobación CP-006, 2026-10-07 / APPROVED / arquitectura-seguridad.
- Problema: modelos/configuración globales impiden alojar empresas aisladas.
- Decisión exacta: una base central para identidades/suscripciones y una base lógica por empresa con credenciales propias, dentro del MongoDB de Mecanet; proceso interno de provisión/mantenimiento separado de la API pública. Sin servidores independientes por cliente; alojamiento DEC-021 intacto.
- Alternativa/motivo: B de CP-005 elegida expresamente; A tenantId queda como comparación histórica, no elección pendiente. Conserva invariantes locales del POS y asume operación de varias bases lógicas.
- Alcance/documentos: MT-A…F y contrato de recursos en ARCHITECTURE_OPTIONS; datos/seguridad/entorno/pruebas futuros. Configuración del worker, custodia, pools/colas, revocación, índices, admisión y recuperación todavía requieren diseño/gates.
- Validación/fuente: HUMAN-ASSISTED, §2 del texto principal de CP-006; evidencia LOCAL de código/versiones CP-005 reutilizada, snapshot CP-002 REPORTED. Es aprobación de arquitectura, no capacidad medida.
- Límites/revalidación: no ratifica parámetros de ensayo, volumen de secretos, origen API, soporte, demo/copias, RPO/RTO, coste ni cambios de infraestructura. Aislamiento/recuperación MT-V* siguen NOT VERIFIED; cualquier separación adicional de procesos/recursos que cambie garantía exige decisión propia.
- Historia: candidata CP-001…004, recomendación concreta PROPOSED en CP-005, APPROVED ahora dentro de este alcance. Nueva aprobación de una propuesta; no error retrospectivo ni reapertura de comparación.

## DEC-013 — Medición de uso

- Fecha/estado/tipo: aprobación CP-006, 2026-10-07 / APPROVED / alcance de observabilidad y administración.
- Problema: distinguir uso atribuible al tenant de CPU/RAM del proceso compartido y del ingreso comercial.
- Decisión exacta: gestión administrativa de tenants, información administrativa y suscripciones/pagos; visualizar impacto global del VPS y gráficas de uso/impacto por tenant en distintos recursos. No se reduce a solicitudes HTTP. Asignación base y administración de límites se registran separadamente en DEC-028.
- Alternativas/motivo: dividir métricas globales entre número de clientes sería una cifra falsa; instrumentación actual no mide queries efectivamente.
- Alcance/documentos: ARCHITECTURE, ENGINEERING, UI_SPEC y TESTING futuros; panel administrativo.
- Validación/fuente: HUMAN-ASSISTED, §3 CP-006; fuentes/contrato propuestos y evidencia previa no certifican atribución física. SC-002 registra la ampliación del alcance administrativo antes acreditado.
- Límites/revalidación: catálogo/unidades/calidad/coste/retención, permisos de acciones sensibles e integración pendientes DG-OBS/ADMIN. Información administrativa no incluye ventas/clientes POS, secretos, copias, SSH/Coolify ni soporte excepcional. No inventar CPU/RAM exacta por tenant; registrar la brecha de garantía y sus opciones sin eliminar el requisito.

## DEC-014 — Sentry: región, categorías y límite de producto

- Fecha/estado/tipo: propuesta inicial 2026-10-07; aprobación humana 2026-10-08, CP-009 §7 / APPROVED / observabilidad-privacidad.
- Problema: rastrear errores sin transmitir contenido de los negocios.
- Decisión exacta: región DE/UE; errores técnicos depurados, versión e identificadores opacos; sin contenido del negocio, cuerpos, URL completa o grabación de sesiones; hasta **1,000 eventos mensuales como límite de producto**. Retención30d aprobada por separado en DEC-049.
- Alternativa/motivo: acepta condiciones propuestas del servicio alojado; no obliga a autohospedar ni acredita una cuenta/plan. Históricamente PROPOSED hasta CP-008.
- Alcance/documentos: G-05/MT en ARCHITECTURE_OPTIONS, SAAS/UI, ENG, candidato de especificación y negativos de redacción/cuota.
- Validación/fuente: HUMAN-ASSISTED CP-009 §7. Fuentes oficiales de CP-009 comprueban solo la oferta pública indicada en G-05/SOURCES; región, retención efectiva y límite implementado requieren evidencia de cuenta/configuración.
- Límites/revalidación: autorización de datos/destino no autoriza alta, gasto, envío actual ni SDK. Mecanismo de límite duro, filtros y pruebas siguen SUGGESTED; aceptar plan compatible y contrato antes de egreso real. DG-OBS P0-C; negativos sintéticos P1/P4; cuenta/retención/acceso antes de transmisión.

## DEC-015 — Foco exclusivo en SaaS

- Fecha/estado/tipo: 2026-10-07 / APPROVED / alcance.
- Problema: decidir si la evolución debe mantener una edición local independiente.
- Decisión: concentrarse solo en SaaS, según respuesta expresa del usuario.
- Alternativas/motivo: mantener ambas ediciones no elegido para el MVP.
- Alcance/documentos: PRODUCT, ROADMAP, ENGINEERING, migración; PLANNING_STATE Q-09 resuelta.
- Validación/fuente: HUMAN-ASSISTED, respuesta «Concentrarnos solo en la versión SaaS».
- Límites/revalidación: no autoriza borrar código, datos ni instalaciones; revisar cada retirada/migración concreta y dependencias. Reabrir solo si cambia la estrategia.

## DEC-016 — Free Tier inicial y crecimiento financiado por suscripciones

- Fecha/estado/tipo: 2026-10-07 / APPROVED / restricción de planificación.
- Problema: no hay techo mensual acordado para servicios adicionales.
- Decisión: aprovechar Free Tier disponible y cubrir costes de crecimiento con ingresos de suscripciones; no imponer gratuidad permanente. Prioridad inicial gratuita preservada, presupuesto/contrataciones todavía sin autorizar. SC-003 amplía explícitamente el objetivo de financiación.
- Alternativas/motivo: no asumir presupuesto pagado ni que todos los servicios sean gratuitos.
- Alcance/documentos: ENVIRONMENT, arquitectura, propuesta comercial y TD-14.
- Validación/fuente: HUMAN-ASSISTED, preferencia previa y §7 CP-006. Free Tier reportado por usuario; modalidad real Free/PAYG, factura y suficiencia económica pendientes. Documentación oficial actual no verifica su cuenta.
- Límites/revalidación: no autoriza gasto, cambio de plan ni recursos adicionales; verificar cuotas/plan/costes y obtener un techo antes de compromisos comerciales.
- **Vigencia CP-009, 2026-10-08:** CP-009 §8 exige conocer primero costes comprobados y después aprobar presupuesto. No techo permanente USD0 ni gasto/reserva financiera aprobados. Plataformas proporcionales al crecimiento pueden proponerse; elegir/contratar y acreditar costes son actos separados.

## DEC-017 — Preparar propuesta de planes

- Fecha/estado/tipo: 2026-10-07 / APPROVED / investigación comercial.
- Problema: catálogo, precios y prestaciones no definidos.
- Decisión: preparar propuesta concreta para que el usuario la revise.
- Alternativas/motivo: usuario eligió recibir propuesta frente a aportar un catálogo existente.
- Alcance/documentos: SUBSCRIPTION_PROPOSAL; Q-01 y futuras BUSINESS_RULES/UI_SPEC.
- Validación/fuente: HUMAN-ASSISTED, respuesta «Preparar una propuesta para revisarla».
- Límites/revalidación: no aprueba precios, límites, publicación ni código. Registrar aprobación o revisión de cada decisión antes de Specification Gate.

## DEC-018 — Tres planes y cantidades comerciales

- Fecha/estado/tipo: aprobación CP-006, 2026-10-07 / APPROVED / producto.
- Problema: diferenciar suscripciones sin inventar módulos nuevos antes de validar demanda.
- Decisión exacta: Esencial 4 usuarios/300 productos; Negocio 10 usuarios/4,000 productos; Máxima 25 usuarios/10,000 productos. Sin funciones exclusivas inventadas. Una empresa por suscripción sigue DEC-002.
- Alternativas/motivo: reemplaza tamaños y catálogo propuestos en CP-001…005, nunca aprobados; elección humana directa §5 CP-006. Tres planes, no dos.
- Alcance/documentos: SUBSCRIPTION_PROPOSAL, PRODUCT, DATA_MODEL/entitlements, UI_SPEC y TESTING futuros.
- Validación/fuente: HUMAN-ASSISTED; cantidades aprobadas, capacidad/rentabilidad no verificadas. Definición de conteo no estaba aprobada: titular, invitados, activos/archivados y concurrencia se proponen explícitamente.
- Límites/revalidación: no confundir usuarios con sesiones ni productos con carga; cuotas operativas DEC-028 separadas. Conteo/excedentes/downgrade antes de DG-PAY/TENANT. No borrar históricos ni aumentar precios automáticamente.
- **Vigencia CP-009, 2026-10-08:** CP-009 §2 resuelve Q-01: cuentan usuarios habilitados incluido titular; invitación consume plaza al aceptarse; productos activos/vendibles. Desactivar conserva históricos. Las cantidades4/10/25 y300/4000/10000 se conservan; concurrencia/entitlements técnicos siguen diseño, no capacidadevidenciada.

## DEC-019 — Catálogo DOP y USD independiente

- Fecha/estado/tipo: DOP aprobado CP-006 el2026-10-07; USD confirmado CP-009 el2026-10-08 / APPROVED / precios.
- Problema: ofrecer el catálogo en dos monedas sin conversión diaria ni precios inferidos.
- Decisión exacta, por orden Esencial/Negocio/Máxima: mensual DOP **799 / 1,490 / 2,490**; anual DOP **8,149.80 / 15,198.00 / 25,398.00**. Mensual USD **15 / 29 / 49**; anual USD **153.00 / 295.80 / 499.80**.
- Condición: tarifas independientes DOP/USD; anual15% sobre doce mensualidades y pago completo adelantado DEC-026. No nuevas funciones exclusivas por plan. El tratamiento fiscal sigue pendiente: no añadir, incluir ni fijar impuesto cero por inferencia.
- Alternativa/motivo: aceptación directa CP-009 §2; sustituye la propuesta USD pendiente de CP-008 sin cambiar los importes DOP previamente aprobados.
- Alcance/documentos: SUB/COM, catálogo versionado, landing/checkout futuros, economía y candidato. Conteo/límites DEC-018; calendario DEC-042.
- Validación/fuente: HUMAN-ASSISTED CP-006 y CP-009 §2; aritmética revisable, no prueba de rentabilidad ni contrato de adquirencia.
- Límites/revalidación: reglas fiscales concretas Q-18 y proveedor Q-03 antes de DG-PAY; total a presentar y consentimiento antes de uso real. Si costes exceden ingresos, presentar evidencia sin modificar unilateralmente el catálogo.

## DEC-020 — Pagos mensuales y anuales desde el MVP

- Fecha/estado/tipo: aclaración y aprobación registrada 2026-10-07 en CP-004 / APPROVED / regla comercial.
- Problema: representar la periodicidad elegida sin convertir una simplificación del agente en requisito.
- Decisión exacta: CONFIRMED, Mecanet ofrecerá pagos mensuales y anuales en el MVP. La anualidad no se difiere a otra versión.
- Alternativas/motivo: solo mensual y anualidad posterior quedan DISCARDED como propuesta vigente; el usuario confirma expresamente ambas opciones.
- Alcance/documentos: propuesta comercial, reglas/flujos en SAAS_DISCOVERY, DG-PAY, planificación, roadmap y mapa; descuento separado en DEC-024.
- Validación/fuente: HUMAN-ASSISTED, mensaje directo de esta ejecución: «La respuesta que le di fue que implemente pagos mensuales y anuales, los anuales tendrán un descuento, una demo gratuita pero bastante limitada y controlada.» Fecha de registro actual; no se inventa la fecha de una aprobación anterior ni se busca acreditarla en otros mensajes.
- Límites/revalidación: aprobación original CP-004 solo de periodicidad. CP-006 añade DOP/15%/base/prepago y activación por decisiones separadas; renovación automática/prorrateo y demás condiciones aún pendientes. DG-PAY verifica ambos períodos y DOP/USD, sin factibilidad ni código autorizados por esta decisión.
- Historia conservada: CP-001/002 propusieron solo mensual (nunca APPROVED). CP-003 mantuvo PROPOSED por contradicción de instrucciones y pidió aclaración. CP-004 resuelve la periodicidad con fuente humana directa; no reescribe esas evidencias históricas. SE-001 corrige la representación vigente.

## DEC-021 — Frontend y backend en VPS con operación independiente de Coolify

- Fecha/estado/tipo: 2026-10-12, CP-012 / APPROVED / infraestructura; SPEC CHANGE SC-005.
- Decisión exacta: Mecanet SaaS se instala directamente en el VPS existente, convive con Coolify y tiene despliegue/operación propios. Coolify no registra, compila, despliega, actualiza, revierte, reinicia ni administra la base de Mecanet. Portabilidad a otro VPS sin depender de Coolify.
- Motivo/fuente: corrección humana explícita §1 del mensaje actual. Sustituye solo el gestor de DEC-021; se conserva el VPS objetivo y Vercel fuera del objetivo.
- Alcance: conservar todos los recursos actuales, producción, Nexora y Mecanet-EAK. La aplicación/DB heredada de Mecanet que ya administra Coolify se preserva; no se la desregistra ni migra por extensión.
- Propuesta técnica: Compose propio (DEC-022 PROPOSED), entrada HTTPS (DEC-023 y DEP-IND) separada del ciclo de vida. Cualquier integración con el proxy compartido requiere autorización específica previa sobre su diff.
- Revalidación: Environment/Design Gates antes del corte; capacidad, aislamiento real, recuperación, baseline A y autorización condicional DEC-057. Sin lanzamiento público, cambio DNS, migración o infraestructura compartida autorizados.

### SC-005 — Sustitución del gestor de despliegues

**SPEC CHANGE APPROVED**, fuente humana directa 2026-10-12 §1, no SPEC ERRATA. DEC-021 deja Coolify como vecino, no gestor de Mecanet; SC-001 se conserva como antecedente. La aprobación ya está dada y no se vuelve a solicitar.

Reverse-impact: F3 arquitectura, F4 fronteras/redes/secretos, F5 tooling ARM64, F7 composición/build, F11 despliegue/HTTPS/rollback, F12 recuperación y autoridad operativa; P0 corrige contratos, P1 prueba empaquetado propio, P6 requiere capacidad y corte explícito. Frontend/API/DB/volúmenes/redes y runbooks futuros deben ser portables; no añadir microservicios por este cambio. Código afectado futuro: Dockerfile/contexto web, config/http.js y ciclo, rutas/health, configuración QA nueva, scripts de operación. Ninguno modificado ahora. Documentos afectados: AGENTS, DECISIONS, estado, roadmap, pendientes, candidato/arquitectura/plan, deudas, README/DEPLOYMENT, evidencia/checkpoint/mapa. Regresiones futuras: 80/443 intactos; redes/no puertos DB; arranque/actualización/rollback propio sin API Coolify; portabilidad; recuperación; otros proyectos sin efecto. Implementación y pruebas siguen NOT VERIFIED.

### Antecedente DEC-021 hasta CP-011 — conservado

- Fecha/estado/tipo: 2026-10-07 / APPROVED / infraestructura; SPEC CHANGE SC-001.
- Problema: el destino aprobado en DEC-009 dependía de Vercel para frontend, con coste comercial pendiente.
- Decisión exacta: el frontend y el backend de Mecanet se alojarán en el VPS existente, gestionados mediante Coolify. Vercel deja de formar parte del despliegue objetivo de Mecanet.
- Motivo: priorizar infraestructura disponible y evitar depender de un plan adicional de Vercel para alojar Mecanet.
- Alternativas: mantener la distribución DEC-009 deja de ser el objetivo; la elección Vercel/Coolify no se vuelve a preguntar. La composición concreta de servicios y el origen de API siguen propuestos.
- Alcance: exclusivamente Mecanet; conservar funciones de mecanet.site y app.mecanet.site. Nexora y otras aplicaciones/configuraciones quedan fuera de cambios.
- Documentos afectados: AGENTS; DECISIONS, PROJECT_STATE, CHECKPOINTS, ROADMAP, TECH_DEBT, INVENTORY e índice; DEPLOYMENT/README existentes; ARCHITECTURE_OPTIONS, PLANNING_STATE, SAAS_DISCOVERY, SUBSCRIPTION_PROPOSAL; tareas y mapa derivado.
- Código/configuración afectados en una fase futura: traducción de client/vercel.json y web/vercel.json al servidor estático/proxy; configuración de build/rutas/headers/caché. CP-002 no modificó ninguno. Precisión técnica CP-003: la imagen API actual puede conservarse con frontend separado; el nuevo empaquetado web necesita su propio contexto/exclusiones explícitos, pues .dockerignore actual excluye frontend. Servir SPA desde Express sí requiere adaptar su imagen. Es detalle de impacto, no nueva aprobación de hosting o código.
- Validación/fuente: HUMAN-ASSISTED, solicitud adjunta «Continúa el proyecto Mecanet…», apartado 1 CONFIRMED / APPROVED, recibida en esta ejecución. Git/código/infraestructura inspeccionados, pero esto no verifica el despliegue objetivo.
- Límites: no implementación funcional ni despliegue; no eliminar proyectos/dominios/variables/despliegues Vercel; no cambiar DNS/TLS/proxy/firewall/DB/secretos ni otros recursos; no contratar/ampliar/gastar; no garantiza coste cero. No aprueba multiempresa, precios, límites, periodicidad ni reglas comerciales. Autoservicio con pago desde lanzamiento permanece aprobado.
- Revalidación: destino humano resuelto; detalles de empaquetado/origen/configuración/capacidad se cierran por los criterios DEP-D1…DEP-V4 de ARCHITECTURE_OPTIONS, sin reabrir proveedor por defecto.

### SC-001 — Cambio de la decisión aprobada de alojamiento

Tipo **SPEC CHANGE**, no errata: DEC-009 estaba APPROVED y cambia arquitectura/destino. Aprobación explícita: DEC-021, mensaje humano actual; no se solicita de nuevo. No existe todavía baseline SaaS definitiva y no se materializa una ahora.

Estado de ejecución del cambio: **incorporado documentalmente; implementación y despliegue NOT VERIFIED / no autorizados**. Reverse-impact review en ARCHITECTURE_OPTIONS cruza F3/F4/F5/F7/F11/F12 con P0/P1/P5/P6. Validaciones/regresiones futuras: builds Linux arm64, rutas SPA/API, CORS/autenticación/proxy, cabeceras/caché, aislamiento de red, salud, recursos durante build/reemplazo y rollback. Se conservan snapshots CP-001 como historia, sin reescribir su evidencia.

## DEC-022 — Docker Compose independiente y composición mínima propuesta

- Fecha/estado/tipo: 2026-10-12, CP-012 / PROPOSED / arquitectura de despliegue.
- Recomendación SUGGESTED: Docker Compose será el mecanismo canónico propio de Mecanet, con web React compilado/Nginx, Express y PostgreSQL exclusivo; un segundo proceso API solo donde lo requiere el ensayo de admisión. Procesos privados puntuales de provisión/copia, sin microservicios, Redis, colas o panel adicional por defecto.
- Motivo: aprovechar Docker ya presente sin acoplar releases, recuperación o traslado a la API/control plane de Coolify. Compose no aporta por sí solo cero interrupción, HA ni aislamiento frente al administrador del host.
- Configuración/secretos/redes/volúmenes por entorno, imágenes por digest, manifiesto de release, health/readiness/drenaje/rollback y recuperación en DEP-IND y S-18. Sin socket Docker en contenedores de aplicación.
- Fuente: §2 de la solicitud humana rotulada SUGGESTED, inspección REMOTE CP-012 y fuentes Docker/Traefik registradas. La frase futura sobre mecanismo canónico no se convierte en una aprobación de baseline.
- Cierre: aceptación dentro de A del alcance limitado, tooling/imágenes y Environment Gate antes de usar; integración compartida separada. No recursos creados.

### Antecedente DEC-022 hasta CP-011 — conservado

- Fecha/estado/tipo: 2026-10-07 / PROPOSED / arquitectura de despliegue.
- Problema: trasladar el frontend a Coolify sin reescribir el producto ni acoplar sus assets al proceso de API.
- Propuesta concretada en CP-003: conservar Express/Mongo y un único recurso web administrado por Coolify, con web/ y client/dist en raíces distintas según hostname. Imagen web por etapas (build Vite + Nginx estático) candidata; mismo repositorio/proyecto, sin dos servicios frontend obligatorios. Nixpacks queda alternativa si admite ambas políticas con menor complejidad. Static directo no compila Vite.
- Alternativas/motivo: Express ya sabe servir client/dist, pero su imagen actual no lo contiene y el rate limit/logging global alcanza assets; combinarlo requiere revisar esos riesgos. Dos recursos web permitirían releases independientes, hoy sin necesidad demostrada. CP-003 concreta la agrupación de hosts sin darla por aprobada. No se fija un número obligatorio de contenedores ni se añade SSR, framework o servidor de build externo obligatorio.
- Alcance/documentos: ARCHITECTURE_OPTIONS, G-01/G-02 y contrato de artefacto/configuración/health/rollback; propuesta dentro de DEC-021, sin recursos creados. CP-003 concreta una propuesta abierta, no modifica una decisión de empaquetado aprobada ni requiere un SPEC CHANGE de producto nuevo.
- Validación/fuente: LOCAL CP-002 reutilizado; lectura focalizada de rutas/configuración en CP-003; SRC-11…16 y SRC-21…24 VENDOR-DOCUMENTATION. Build/frontend Linux arm64 y controles exactos de Coolify 4.3.23 NOT VERIFIED.
- Límites/revalidación: cerrar DEP-D1/DEP-D2 y entorno antes de implementación; medir build/reemplazo además de reposo. La aprobación de hosting no aprueba esta mecánica.

## DEC-023 — Mismo origen mediante web propio; entrada HTTPS separada del despliegue

- Fecha/estado/tipo: 2026-10-12, CP-012 / PROPOSED / rutas y autenticación.
- Recomendación vigente: web propio sirve React y reenvía /api a Express conservando prefijo; cookie de sesión host-only, control Origin/CSRF. QA privada con TLS propio y túnel SSH hacia loopback, sin dominios públicos ni Traefik compartido. Detalle de host/origen en S-18.
- Entrada futura de dominio: Traefik existente mantiene 80/443 y TLS; red de entrada exclusiva proxy↔web más archivo dinámico con routers Host exactos y servicio web:8080. Ningún contenedor Mecanet entra a la red coolify ni publica PostgreSQL. DEP-IND concreta autorización/configuración/persistencia/rollback de esa integración.
- Alternativa histórica api.mecanet.site separada se conserva abajo, no se cambia el host legado. Elegir mismo origen reduce configuración CORS pero no resuelve XSS/CSRF/tenancy ni aprueba cutover.
- Límites: propuesta no ejecutada. Toda edición/conexión/reinicio de proxy compartido exige aprobación específica sobre recursos/diff; A del lote privado no la concede.

### Antecedente DEC-023 hasta CP-011 — conservado

- Fecha/estado/tipo: 2026-10-07 / PROPOSED / rutas y autenticación.
- Problema: decidir cómo app.mecanet.site llega a API después del cambio de hosting.
- Propuesta: para el traslado inicial, conservar API en api.mecanet.site y CORS exacto al origen app, minimizando cambios de contrato. Estar en el mismo VPS no hace que esos hosts sean el mismo origen.
- Alternativa concretada CP-003: app.mecanet.site/api mediante ruta del proxy integrado hacia Express, con precedencia sobre raíz/SPA y prefijo conservado, sin requerir un segundo proxy. VITE_API_URL=/api elimina CORS para ese recorrido; validar forwarding/trust proxy, API no disponible y compatibilidad del host API. Coolify documenta retirada de prefijo por defecto: el backend actual espera /api. La recomendación sigue siendo separación inicial, pendiente de aprobación.
- Alcance/documentos: ARCHITECTURE_OPTIONS, DG-TENANT/DG-ADMIN y DEP-D1/DEP-V2; cliente Axios y servidor existentes solo inspeccionados.
- Validación/fuente: LOCAL api.js, config/http.js y authMiddleware.js; JWT bearer/localStorage y issuer/audience lógicos actuales. Sin prueba de routing nuevo.
- Límites/revalidación: mismo origen no resuelve XSS/tenancy ni decide cookies/CSRF/MFA. Conservar o cambiar sesiones exige diseño propio. No retirar api.mecanet.site ni cambiar DNS en CP-002.

## DEC-024 — Descuento de la opción anual

- Fecha/estado/tipo: 2026-10-07, CP-004 / APPROVED / regla comercial.
- Problema: distinguir la existencia del beneficio anual de su importe y condiciones.
- Decisión exacta: CONFIRMED, la opción anual tendrá un descuento desde el MVP.
- Alternativas/motivo: anual sin descuento o posponerlo contradice la dirección humana; no son la recomendación vigente.
- Alcance/documentos: SUBSCRIPTION_PROPOSAL, reglas/flujos de SAAS_DISCOVERY, planificación, DG-PAY y UI comercial.
- Validación/fuente: HUMAN-ASSISTED, mismo mensaje directo citado en DEC-020; aprobación registrada hoy, sin atribución retroactiva.
- Límites/revalidación: CP-004 aprobó solo existencia; CP-006 aprueba 15%/base doce mensualidades/prepago en DEC-026. Redondeo general/promociones/impuestos siguen pendientes; costes/margen NOT VERIFIED. No autoriza publicar ni cobrar.

## DEC-025 — Demo gratuita limitada y controlada desde el MVP

- Fecha/estado/tipo: 2026-10-07, CP-004 / APPROVED / producto.
- Problema: permitir evaluar Mecanet conservando límites frente al uso operativo gratuito.
- Decisión exacta: CONFIRMED, existirá una demo gratuita bastante limitada y controlada, incluida en el MVP. No puede eliminarse ni diferirse sin nueva autorización.
- Alternativas/motivo: «sin demo» queda DISCARDED; CP-006 concreta registro, duración y parte de cuotas en DEC-027, sin diferirla del MVP.
- Alcance/documentos: SUBSCRIPTION_PROPOSAL, actores/reglas/flujos/datos en SAAS_DISCOVERY, seguridad/aislamiento, planificación y roadmap. La propuesta la hace accesible desde la web; no se crea una ruta ahora.
- Validación/fuente: HUMAN-ASSISTED, aclaración directa actual citada en DEC-020; no acredita mecanismos técnicos ni una aprobación histórica fechada.
- Límites/revalidación: aprobación de existencia en CP-004; condiciones exactas posteriores en DEC-027. Verificación de correo, cuotas adicionales, retención/copias y mecanismos siguen SUGGESTED. No autoriza cuentas externas, infraestructura, código o acceso del operador.

## DEC-026 — Descuento 15%, base anual y prepago

- Fecha/estado/tipo: aprobación CP-006, 2026-10-07 / APPROVED / comercial-dominio.
- Problema: hacer revisable el descuento sin inventar precios finales ni rentabilidad.
- Decisión exacta: 15% de descuento sobre doce mensualidades y cobro anual completo por adelantado; importes DOP indicados en DEC-019. Regla general de redondeo y presentación siguen propuestas, no extensión de esta aprobación.
- Alternativas/motivo: aceptación explícita §5 CP-006; 10%/20% dejan de ser alternativas vigentes. No acredita rentabilidad.
- Alcance/documentos: fórmula/ejemplos y campos de catálogo en SUBSCRIPTION_PROPOSAL; reglas de pago/UX y matriz de negativos en SAAS_DISCOVERY.
- Validación/fuente: HUMAN-ASSISTED, mensaje CP-006; aritmética en unidades menores. CP-004 proponía estos componentes; la aprobación se registra ahora, no se retrodata.
- Límites/revalidación: impuestos, USD, fechas/prorrateo/consentimiento de renovación y vigencia de cotización siguen TO DEFINE/SUGGESTED. Política sin reembolsos en DEC-032 es independiente. No nuevas preguntas sobre 15%, base o prepago.
- **Vigencia CP-009, 2026-10-08:** CP-009 §2 confirma también importes anuales USD explícitos en DEC-019. Frecuencias, descuento y prepago no se vuelven a consultar; fiscalidad permanece sin fijar. Recurrencia y calendario se aprueban por DEC-041/042 sin autorizar cobros.

## DEC-027 — Demo registrada, temporal y ficticia

- Fecha/estado/tipo: aprobación CP-006, 2026-10-07 / APPROVED / condiciones expresas de demo.
- Problema: evaluación útil con exposición y consumo acotados, sin cuenta operativa gratuita permanente.
- Decisión exacta: registro previo; gratuita limitada/controlada durante 30 minutos; solo datos ficticios precargados; hasta 10 ventas simuladas, 5 cotizaciones y 10 ajustes de existencias; explorar sistema y gráficas; límites de entrada y solicitudes. Sin convertir demo en negocio real ni trasladar datos ficticios al contratar.
- Alternativas/motivo: reemplaza acceso anónimo propuesto en CP-004/005, que nunca fue aprobado. Registro no equivale a correo verificado. Identidad real, estado ficticio y metadatos de seguridad requieren políticas distintas; vencimiento no borra automáticamente la identidad.
- Alcance/documentos: propuesta comercial, flujo y negativos en SAAS_DISCOVERY; fronteras/presupuesto en ARCHITECTURE_OPTIONS; fases P1/P2/P3/P5/P6 del roadmap.
- Validación/fuente: HUMAN-ASSISTED, §6 CP-006. SRC-29…31 orientan mecanismos, no fuente de aprobación ni prueba de controles. Cuotas de sesiones/entradas/requests, tamaño de plantilla, verificación email, retención/purga/copias aún SUGGESTED.
- Límites/revalidación: no autoriza proveedor de correo, CAPTCHA, datos reales en demo, permisos del operador ni infraestructura. Revisar propuesta DEM-01…08, separación de clases/destinos y negativos antes de DG-TENANT/OBS/MIGRATION/DEP-D2; integración por fases. Cantidades aprobadas no son capacidad probada.
- **Vigencia CP-009, 2026-10-08:** CP-009 §5 resuelve Q-13/25: registro **y correo verificado antes de comenzar**; una demo activa por cuenta; hasta **tres inicios por cuenta en24h**, nunca vitalicio. IP solo control adicional, no equivalente a persona ni límite rígido3porIP aprobado. Se conservan30min/ficticios/gráficas/10ventas/5cotizaciones/10ajustes nuevos y no migrar ficticios al negocio. Retenciones DEC-049; proveedor de correo/detalles técnicos pendientes, sin envío actual.

### SE-001 — Corrección de representación tras aclaración humana

Tipo **SPEC ERRATA** para reconciliar el estado documental vigente con las decisiones directas DEC-020/024/025. No es un SPEC CHANGE de una decisión aprobada: «solo mensual», «anual después» y «sin demo» eran propuestas, no restricciones aceptadas ni baseline SaaS. La fuente actual resuelve la contradicción de CP-003 sobre periodicidad/descuento/demo; el resto de G-06 (momento de activación y operador) continúa pendiente según su alcance.

Se registra la aprobación el **2026-10-07 en CP-004**, sin inventar una fecha anterior. La errata corrige únicamente representación/dependencias: no afirma que CP-003 tenía aprobación inequívoca, ni convierte sus NOT VERIFIED históricos en PASS. Si se pretendiese retirar anualidad/demo, cambiar una garantía aprobada o incorporar condiciones adicionales, haría falta decisión propia y SPEC CHANGE cuando corresponda; no se hace ahora.

Impacto documental: catálogo con dos períodos y descuento separado del precio; demo incluida en alcance/actores/flujos/datos; riesgos de abuso, cuotas y segregación; P3 debe probar ambos períodos, P5 incluye la demo y P6 su capacidad/aislamiento. Los detalles siguen en borradores. No cambia alojamiento, decisiones multiempresa, permisos ni baseline. P0-B/C/D y autorización de implementación permanecen abiertos.

## DEC-028 — Cuota base y control operativo por empresa

- Fecha/estado/tipo: 2026-10-07, CP-006; concreción humana 2026-10-08, CP-007 / APPROVED / alcance de recursos.
- Problema: un tenant puede concentrar carga y degradar Mecanet y el VPS compartido.
- Decisión exacta CP-006 conservada: asignación o cuota base por tenant, administración de sus límites desde el panel y protección frente a sobrecarga. Gráficas de impacto complementan DEC-013; no limitar el requisito a un contador HTTP.
- Concreción CONFIRMED CP-007: cuotas operativas administrables por tenant, límites globales para Mecanet y host compartido, **sin reservas físicas individuales garantizadas de CPU/RAM**. Gráficas que distingan medición directa, estimación y consumo compartido/no atribuible; ajuste desde el panel dentro del alcance del operador ya aprobado. La elección cuotas frente a reservas físicas queda resuelta.
- Perfiles aceptados **exclusivamente para ensayo y ajuste**, en orden solicitudes/minuto, operaciones simultáneas, datos lógicos: Esencial **120 / 2 / 512 MiB**; Negocio **240 / 3 / 2 GiB**; Máxima **360 / 4 / 5 GiB**. No son oferta definitiva, recursos dedicados ni configuración productiva validada. Semántica de ventana, ráfagas y otros parámetros: propuesta MC para revisar, sin aumentar implícitamente estos números.
- Alternativa/motivo: el humano elige el modelo operativo propuesto; una reserva física requeriría una decisión nueva que cambiase esta garantía. No disponer de controles contradice el alcance. Mecanismos y cifras distintas de los tres campos de ensayo siguen SUGGESTED.
- Alcance/documentos: ARCHITECTURE_OPTIONS MC, panel/permisos, admisión, límites agregados, tareas, recuperación y modelo económico; SC-002.
- Validación/fuente: HUMAN-ASSISTED, CP-006 y texto directo CP-007 §2A del 2026-10-08. Modelo APPROVED y perfiles de ensayo aceptados; **configuración productiva pendiente, capacidad y eficacia NOT VERIFIED**. Documentación/ensayos CP-006 no son pruebas del control real.
- Límites/revalidación: sin procesos nuevos, gasto, cambio de precios o límites comerciales usuarios/productos, cobro por exceso, upgrade automático o ampliación de infraestructura. No borrar datos al reducir; respetar operaciones confirmadas. Contrato técnico antes de DG-OBS/ADMIN/DEP-D2; controles P1/P2, panel P4, capacidad/coexistencia y valores productivos P6 antes de ofrecerlos.

## DEC-029 — Cajas individuales y cierres exclusivos inmutables

- Fecha/estado/tipo: 2026-10-07, CP-006 / APPROVED / dominio POS.
- Problema: el cierre heredado no define asignación exclusiva y confunde usuario actual con titular de caja.
- Decisión exacta: cajas y cierres individuales; encargado del turno autorizado a cerrar las cajas correspondientes; titular de caja distinto del ejecutor. Cada movimiento pertenece como máximo a un cierre, con conjunto definido/exclusivo. Cierre e histórico cerrado inmutables.
- Alternativa/motivo: no cierre global, permiso automático al cajero, reapertura, edición ni borrado del cierre. Nueva definición humana; el comportamiento heredado nunca se aprobó como regla SaaS.
- Alcance/documentos: SAAS_DISCOVERY diseño de caja, identidad/roles, movimientos/turnos/snapshots, transacciones, reportes/exports, UI y pruebas P2.
- Validación/fuente: HUMAN-ASSISTED, §4 CP-006; lectura y caracterización local se clasifican separadamente de implementación.
- Límites/revalidación: delimitación concreta de turnos, asignación de encargado y correcciones enlazadas se proponen antes de DG-TENANT/ADMIN. No cambiar cierres reales, atribuir a código existente exclusividad ni asumir una caja por día.
- **Vigencia CP-009, 2026-10-08:** CP-009 §5 resuelve Q-15: titular y encargado asignados por turno; suplencias registradas; titular declara apertura/fondo inicial y encargado confirma cierre/diferencias. Individualidad/exclusividad/inmutabilidad conservadas. Matriz/controles CC candidatos no demuestran funcionamiento; pruebas P2.

## DEC-030 — Devolución de productos mediante crédito del negocio

- Fecha/estado/tipo: aprobada 2026-10-07, CP-006; sustituida parcialmente 2026-10-08, CP-008 / SUPERSEDED / dominio POS, solo alcance incompatible con DEC-038.
- Vigencia CP-008: SC-004 retira el saldo para consumo futuro y su administración. Se conservan bajo DEC-038 no devolver dinero, ámbito de empresa y trazabilidad. El texto siguiente describe la decisión histórica, no exige implementar billetera/ledger de saldo. No se borra historia ni código/datos heredados.
- Problema: devolución monetaria/stock y medio de pago no constituyen un saldo de crédito trazable.
- Decisión exacta: devoluciones de productos no devuelven dinero en el POS; generan crédito para consumir dentro de la misma empresa. Dominio distinto de venta a crédito/deuda del cliente y de suscripción o billetera entre tenants.
- Alternativa/motivo: devolución de efectivo y crédito global no corresponden al requisito; nueva definición humana, no ratificación del enum legado.
- Alcance/documentos: ledger emisión/consumo, crédito como medio parcial/total, stock, cancelaciones/devoluciones parciales, caja inmutable y reportes as-of en SAAS_DISCOVERY.
- Validación/fuente: HUMAN-ASSISTED, §4 CP-006. Emisión no es salida de efectivo ni consumo un ingreso de efectivo. Ejemplos/ensayos locales no prueban integración POS.
- Límites/revalidación: CP-007 resuelve titular del crédito incluso en venta anónima mediante DEC-035. Devoluciones sobre deuda, cancelaciones, datos mínimos/prueba de derecho y condiciones adicionales siguen por definir/proponer. No inventar vencimiento, transferencia, conversión a efectivo ni cumplimiento fiscal DGII. Resolver reglas necesarias antes de P0-C; integración y carreras P2.

## DEC-031 — Activación operativa tras primer pago verificado

- Fecha/estado/tipo: 2026-10-07, CP-006 / APPROVED / alta comercial.
- Problema: separar registro/demo del uso real pagado.
- Decisión exacta: negocio operativo solo después del primer pago verificado. Q-14 resuelta en ese alcance; la creación técnica debe terminar de forma segura antes de habilitarlo.
- Alternativa/motivo: no trial operativo ni activación por redirección del navegador o solo por registro. Aceptación humana §5 CP-006.
- Alcance/documentos: flujo de alta, verificación de proveedor, provisión recuperable, demo→contrato y pruebas P3.
- Validación/fuente: HUMAN-ASSISTED; contrato real AZUL y ejecución NOT VERIFIED.
- Límites/revalidación: no fija instante de inicio del período si el alta falla, plazo de reparación ni excepción comercial; propuestas en lifecycle. Un reintento no cobra ni crea empresa dos veces.

## DEC-032 — Política comercial de suscripciones sin reembolsos

- Fecha/estado/tipo: 2026-10-07, CP-006 / APPROVED / política comercial.
- Problema: separar cancelación voluntaria, cobros erróneos y eventos reales del proveedor.
- Decisión exacta: política comercial de suscripciones sin reembolsos ordinarios. Es independiente del crédito por devolución POS de DEC-030.
- Alternativa/motivo: no añadir reembolso ordinario o permiso del operador por iniciativa del diseño. §5 CP-006 exige revisar compatibilidad legal/proveedor antes de publicarla.
- Alcance/documentos: SUBSCRIPTION_PROPOSAL, cancelación/paid-through, reconciliación/ledger, términos y evidencia de consentimiento.
- Validación/fuente: HUMAN-ASSISTED para política, no certificación jurídica. Investigación pública primaria de CP-006 es contextual; contrato y revisión profesional pendientes.
- Límites/revalidación: registrar cobro duplicado/incorrecto, disputa, reverso y prestación fallida sin fingir que no suceden; resolución legal/proveedor/específica no aprobada por extensión. Legal Gate y DG-PAY antes de publicación/cobro real.
- **Vigencia CP-009, 2026-10-08:** CP-009 §§3/5 conserva no reembolsos ordinarios del SaaS y separa cambios voluntarios de productos de obligaciones de garantía. La referencia histórica DEC-030 se entiende sustituida por DEC-038. Reversos/disputas/errores del proveedor no se eliminan por esta política; revisión externa Q-18.

## DEC-033 — Lifecycle de suscripciones dentro del alcance

- Fecha/estado/tipo: 2026-10-07, CP-006 / APPROVED / alcance comercial.
- Problema: una suscripción necesita transiciones más allá del primer cobro.
- Decisión exacta: renovación, cancelación, gestión de impagos, período de gracia y cambios de plan deben existir; conservar períodos pagados, catálogo/históricos y datos ante downgrade o impago.
- Alternativa/motivo: omitir estos flujos no satisface §5 CP-006. Su existencia no aprueba un débito automático sin consentimiento.
- Alcance/documentos: estados/transiciones y escenarios de calendario/eventos/reconciliación en SUBSCRIPTION_PROPOSAL; API/UI/negativos P3/P5.
- Validación/fuente: HUMAN-ASSISTED, CP-006; condiciones/plazos propuestos por el agente SUGGESTED.
- Límites/revalidación: DEC-034 CP-007 concreta gracia; CP-008 DEC-036 añade no extensión recurrente y DEC-037 aprueba acceso posgracia; notificaciones, cancelación efectiva, anclas/calendario, prorrateo, cambios de plan y autorización de renovación siguen antes de DG-PAY/P0-B-C. No borrar datos ni modificar cuotas/precio automáticamente por una métrica.
- **Vigencia CP-009, 2026-10-08:** CP-009 concreta lifecycle requerido mediante DEC-041/042/043/044: recurrencia automática, calendario, cancelación y cambios; ya no condiciones pendientes de elegir manual/automática. Son respuestas nuevas dentro de ámbitos abiertos, sin aprobación implícita de detalles comerciales adicionales.

### CP-006 — Clasificación de decisiones y cambios

Fuente humana suficiente: texto principal adjunto de esta ejecución (§2…7) y ampliación autónoma (§B/C/E/G/H). Registro actual **2026-10-07**, sin retrofecha. La ampliación autoriza procedimiento, experimentos locales y delegación, no producto ni aprobaciones reservadas. Las respuestas expresas sustituyen los pendientes de CP-005 dentro de su alcance; no se vuelven a preguntar.

| Grupo | Clasificación | Qué cambia / qué conserva |
|---|---|---|
| DEC-012 | Nueva aprobación de propuesta | B y proceso interno elegidos; parámetros/gates no aprobados, historia CP-005 correcta |
| DEC-013/028 | Nueva aprobación concreta + SC-002 de ampliación de alcance | Administración, gráficas de recursos y control de cuotas requeridos; no acceso a negocio ni garantía física ficticia |
| DEC-018/019/026/027 | Aprobación de componentes y sustitución de propuestas | Tres planes DOP/15%/prepago y demo registrada concretados; el acceso anónimo y viejos tamaños/precios nunca fueron decisiones aprobadas |
| DEC-029/030/031/032/033 | Nuevas decisiones de dominio independientes | Caja, crédito, activación, no reembolso y lifecycle tienen fuentes/pendientes propios, no aprobación indivisible |
| DEC-016 | SC-003, ampliación del objetivo económico | Prioridad Free Tier permanece; crecimiento financiado por ingresos añadido, sin autorizar gasto |
| SE-001 / corrección de representación | Historia conservada; no nueva errata retrospectiva | Las propuestas/preguntas antiguas eran correctas en sus checkpoints. Actualizar estado vigente tras respuestas nuevas no falsifica sus evidencias |

### SC-002 — Alcance administrativo, recursos y protección por empresa

**APPROVED como ampliación de alcance**, fuente directa §3 CP-006: el objetivo previo de gestionar suscripciones/uso ahora exige gráficas de distintos recursos, cuota base y administración/protección de límites. No sustituye DEC-012 ni decide procesos independientes por tenant. Autoriza diseño P0, no código. El contrato MC identifica medición directa, estimación y no disponible, consumo compartido, cuota/prioridad/reserva y garantías que podrían necesitar aprobación adicional; no rebaja el objetivo para ajustarlo al legado.

### SC-003 — Financiación del crecimiento

**APPROVED como ampliación de objetivo**, fuente §7 CP-006: aprovechar Free Tier disponible y financiar crecimiento con suscripciones, sin obligación de gratuidad permanente. Conserva DEC-016 sobre presupuesto pendiente y ausencia de permiso de gasto. Free Tier es REPORTED por usuario; modalidad real/facturación y margen requieren evidencia. Ingresos adelantados anuales se distribuyen sobre servicio, no se ofrecen como excedente libre.

### Reverse-impact review CP-006

| Área / fases afectadas | Efecto y dependencias | Documento / código futuro afectado | Gate / verificación |
|---|---|---|---|
| F0/F1 producto/roles | Catálogo y registro demo concretos; encargado distinto de titular; operador administra cuotas con límites | SUBSCRIPTION_PROPOSAL, SAAS_DISCOVERY; User/RoleSectionAccess, auth/sectionAccess y pantallas | Specification Gate para condiciones restantes; identidad P1, POS P2, panel P4 |
| F2 datos/temporalidad | Movimiento exclusivo e inmutable, crédito propio, identidad real separada de demo; historial y snapshots/versiones | Modelos CashierSession/Sale/Return/Customer, servicios de retorno, futuros movimientos/ledger; exports/reportes | DG-TENANT/MIGRATION en P0-C; concurrencia y as-of P2 |
| F3/F4 arquitectura/seguridad | B aprobada; cuotas agregadas, autoridad del panel, collector mínimo y límites de atribución | ARCHITECTURE_OPTIONS MC/MT; contexto, admisión, métricas, roles y jobs | DG-OBS/ADMIN/DEP-D2; negativos P1/P2/P4, capacidad P6 |
| F1/F2/F3 pagos | DOP/prepago/descuento y no reembolso; lifecycle requerido, reglas/cuenta AZUL pendientes | Catálogo versionado, ledger de pago/alta, UI checkout y reconciliación futuros | DG-PAY, proveedor/legal antes de publicación; sandbox P3 y real P6 |
| F2/F4/F12 demo/copias | Registro real no desaparece a los 30 min; separar retención de ficción/identidad/abuso y revisar exclusión de backups explícitamente | DEM-01…08/flujo, fixture determinista, G-04 y políticas candidatas | DG-TENANT/OBS/MIGRATION/DEP-D2; fundación P1, cuotas P2, conversión P3, UX P5 y restore P6 |
| F5/F7 runtime/pruebas | Experimentos locales autorizados solo fuera de artefactos; no demuestran Mongo/VPS ni producto completo | .agentic/experiments/cp006; TESTING futuro, negativos MC/CJ/CR/DEM/COM | Plan de ensayo antes de ejecución local; Environment Gate por destino posterior |
| F6 UI | Tres planes y total anual; registro/demo/gráficas, permisos y estados de cuota/caja/crédito sin falsas garantías | Landing, Dashboard, caja/return, onboarding y panel futuros | Design UI antes del módulo; accesibilidad/navegador en su fase, sin preview falso |
| F9/F12 economía/operación | Ingreso por servicio, imputación compartida, coste de observabilidad/copias/reserva y tenant pesado | SUBSCRIPTION_PROPOSAL/modelo; presupuestos, logs/backups y recursos | DEP-D2 en P0; capacidad/coste real antes de compromisos y P6/P7 |
| F14 cierre | Más requisitos confirmados, mecanismos/costes/legal aún pendientes | PROJECT_STATE/ROADMAP/PLANNING_STATE, primer lote condicionado, mapa | Revisión adelantada no es segunda auditoría final ni baseline aprobada; P0-D abierto |

No se implementa ningún cambio de esta tabla. Autorización de implementación, pruebas de integración y despliegue siguen sus gates; SC-002/003 no los saltan.

## DEC-034 — Siete días de gracia operativa en renovaciones

- Fecha/estado/tipo: 2026-10-08, CP-007 / APPROVED / dominio de suscripción.
- Problema: precisar la continuidad de una empresa pagada cuando vence una renovación, sin confundirla con un alta gratuita.
- Decisión exacta: **CONFIRMED**, una empresa que ya pagó podrá continuar operando durante siete días de gracia por impago de renovación. No aplica al alta inicial, que mantiene el primer pago verificado de DEC-031. Nuevos intentos de pago no reinician artificialmente la ventana.
- Alternativas/motivo: la duración propuesta de siete días queda aceptada por el humano; no se mantiene como consulta ni se amplía a empresas nunca pagadas. La gracia no concede roles, elimina cuotas ni revoca una suspensión por otra causa.
- Alcance/documentos: SUBSCRIPTION_PROPOSAL, flujos SAAS_DISCOVERY, planificación, roadmap, pruebas previstas y mapa. Anclas, intervalos y eventos concretos propuestos en el contrato de calendario, separados de esta aprobación.
- Validación/fuente: HUMAN-ASSISTED, texto directo CP-007 §2B, recibido 2026-10-08. No se inventa una aprobación anterior ni se repite el modelo CP-006.
- Límites/revalidación: estado histórico CP-007 dejaba esas condiciones pendientes. CP-008 resuelve garantía anti-extensión DEC-036 y acceso/reactivación DEC-037. Renovación manual/automática, ancla exacta, retención, cancelación y cambio siguen propuestas. Decisiones P0-B / DG-PAY; verificación de integración/calendario/proveedor P3 y real P6. No cobro ni operación real en esta ejecución.
- **Vigencia CP-009, 2026-10-08:** CP-009 §3 conserva siete días y calendario original dentro de gracia; después aplica DEC-042. Deducción una vez por episodio, no en alta inicial ni de nuevo ante reintento. No cargos de meses suspendidos.

## DEC-035 — Beneficiario individual del crédito POS

- Fecha/estado/tipo: aprobada 2026-10-08, CP-007; sustituida en su ámbito de saldo futuro por CP-008 del mismo día / SUPERSEDED / datos y dominio POS.
- Vigencia CP-008: DEC-038/SC-004 elimina el saldo futuro al que se asignaba beneficiario; ficha, credencial y recuperación exclusivas de ese saldo dejan de ser requisitos. Se preservan identificación con otra finalidad acreditada, ámbito de empresa e historia inmutable. El texto siguiente conserva la decisión histórica, sin aprobación vigente de capturar datos para un saldo inexistente.
- Problema: un saldo de crédito necesita un beneficiario individual sin trasladarse entre negocios o reescribir ventas anónimas históricas.
- Decisión exacta: **CONFIRMED**, el crédito por devolución pertenece a una ficha individual de cliente dentro de la empresa; nunca a una ficha compartida de “cliente general”, ni a saldo entre tenants. Si la compra fue anónima, se vincula al beneficiario al tramitar la devolución, conservando intactos venta original y cierre histórico.
- Alternativas/motivo: se acepta la ficha individual propuesta. Un comprobante puede ayudar a verificar un derecho según diseño pendiente, pero no sustituye al beneficiario por un saldo anónimo compartido. No exige cuenta de acceso a Mecanet, cédula u otro documento oficial.
- Alcance/documentos: SAAS_DISCOVERY CC; emisión/saldo/consumo, auditoría y referencias históricas, regresiones previstas; DEC-030, roadmap, planificación y mapa. Suscripciones/pagos Mecanet son un dominio separado.
- Validación/fuente: HUMAN-ASSISTED, texto directo CP-007 §2C, recibido 2026-10-08. CP-006 aporta hallazgos del legado, no un ledger o autorización funcionales.
- Límites/revalidación: datos personales adicionales, prueba del derecho a consumir, caducidad, transferibilidad y condiciones comerciales accesorias siguen propuestas/pendientes. customerId no basta para autorizar consumo. No conversión a dinero por extensión; DEC-030 conserva crédito dentro del negocio sin devolución de efectivo. Reglas/datos/permisos P0-B/C; carreras, idempotencia, historia y regresiones CC en P2.

### CP-007 — Clasificación y reverse-impact focalizado

Fuente humana suficiente: texto adjunto `f1572ad2-2eb0-4110-afea-4cf9c750b7bf/Texto pegado.txt`, §2A/B/C. Registro de la recepción y aprobación **2026-10-08**. No nuevas búsquedas de aprobación histórica. DEC-028 concreta una elección antes abierta y acepta perfiles solo de ensayo; DEC-034/035 aprueban propuestas independientes dentro del alcance existente. **No modifican una decisión aprobada previa ni corrigen una representación factual falsa:** no requieren SPEC CHANGE ni SPEC ERRATA nuevos. SC-001/002/003 y SE-001 se conservan. Si después cambian estas garantías, se aplicará §5.1.

| Aprobación / área | Contrato afectado y límites todavía propuestos | Impacto futuro / gate |
|---|---|---|
| DEC-028 · F3/F4/F9/F12 | MC: ventana y ráfaga sin inflar N, tickets/cupos agregados, datos lógicos, cambios y reducción, presupuestos de excepciones y calidad de gráficas. Modelo y tres campos de ensayo aceptados; demás cifras no | Middleware/admisión/políticas/worker/panel futuros; diseño MC/MT/DEP en P0-C; controles P1/P2, panel P4, capacidad/config productiva P6 |
| DEC-034 · F1/F2/F3/F6 | SUB: gracia 7 días sin reset; calendario/eventos, acceso tras gracia y anclas como propuestas identificadas. No acceso por sesión sola ni override de seguridad | Suscripción/entitlements/reconciliación y UI futuros; reglas P0-B y DG-PAY, pruebas P3/P5 y proveedor real P6 |
| DEC-035 · F1/F2/F4/F6 | CC: ficha individual, comprobación de derecho, ledger/snapshots/referencias; venta anónima intacta. Reserva668→667 y líneas de diferente precio conservadas como defectos detectados | Customer/Return/Sale, servicios/ledger y caja futuros; datos/permisos P0-B/C, regresiones P2, UI P5 |
| F5/F7/F14 · expediente común | Lista canónica única de pendientes, revisión preparatoria y cortes internos P1-L1. Ningún resultado histórico reclasificado como actual | F14 final y baseline todavía pendientes, P0 única activa y P1 NO INICIADA; sin código/configuración/infra/ensayos repetidos |

La aprobación de estos contratos de producto no aprueba sus diseños técnicos ni autoriza implementación. Pendientes únicos y evidencia necesaria en [PLANNING_STATE](../.agentic/PLANNING_STATE.md); no duplicar su lista en cada borrador.

## DEC-036 — Pagar tarde no extiende recurrentemente la suscripción

- Fecha/estado/tipo: 2026-10-08, CP-008 / APPROVED / garantía de calendario.
- Problema: desplazar automáticamente el vencimiento después de cada impago permitiría acumular tiempo adicional con pagos tardíos.
- Decisión exacta CONFIRMED: pagar después de la gracia no permite acumular esos días ni alargar recurrentemente la suscripción. Los siete días aprobados en DEC-034 permanecen y no se agregan a cada renovación.
- Fuente: HUMAN-ASSISTED, texto directo CP-008 §1A recibido hoy; no se busca una aprobación anterior. Nov10→graciaNov17→pagoNov18→venceDic10 es **interpretación propuesta**, no fórmula completa aprobada.
- Recomendación SUGGESTED Q-19: ancla de calendario original; para suspensión larga comprar solo el intervalo anclado que contiene el pago y tiene fin futuro, omitiendo meses/años íntegros suspendidos sin deuda/cargo/recargo. No ofrecer una renovación completamente vencida. Primera activación, fronteras, cotización/confirmación tardía y excepciones documentadas en SUB.
- Clasificación/límites: nueva aprobación de garantía; sustituir la propuesta CP-007 de nueva ancla fuera de gracia no requiere SPEC CHANGE porque nunca fue aprobada. No aprueba prorrateos, débito automático, coste de reparación ni una obligación jurídica. Diseño P0-B/DG-PAY; pruebas reales P3.
- **Vigencia CP-009, 2026-10-08:** CP-009 §3 aprueba la concreción DEC-042: tras agotar gracia, nuevo período desde reactivación menos los siete días ya concedidos; ejemplo18nov→11dic. La recomendación de ancla rígida18nov→10dic de CP-008 queda **DISCARDED como propuesta**. No estaba aprobada; la garantía antiacumulación de gracia se conserva con la fórmula humana actual, sin exigir oldplan o deuda.

## DEC-037 — Acceso después de la gracia y reactivación

- Fecha/estado/tipo: 2026-10-08, CP-008 / APPROVED / permisos y lifecycle; Q-20 resuelta.
- Decisión exacta: acceso autorizado a cuenta, estado, facturas de suscripción, pago y soporte; exportación acotada conforme a permisos y límites; sin operación ordinaria del POS. Reactivación tras pago verificado y estado técnico utilizable; sin borrar datos por la transición ni levantar suspensiones independientes de seguridad.
- Fuente: HUMAN-ASSISTED, texto directo CP-008 §1B. Se acepta la propuesta dentro del alcance existente, sin nueva SPEC ERRATA o cambio ficticios.
- Alcance: SUB/SAAS flujos/UI, MT/MC permisos, lectura/exportación y admisión esencial. No habilita a cualquier empleado para pagar, exportar o acceder a información empresarial; Q-30/06 separan autoridades.
- Límites/revalidación: calendario Q-19, retención Q-24 y detalles técnicos Q-02/Q-31 siguen SUGGESTED. Pruebas de API/DB/UX y eventos tardíos P1/P3/P5, no verificadas en CP-008. No volver a preguntar Q-20.
- **Vigencia CP-009, 2026-10-08:** CP-009 conserva acceso posgracia. Período, reactivación y retención se rigen por DEC-042/049; autoridad empresarial delegable DEC-046. No se vuelve a consultar Q-20 ni se elimina seguridad por pago.

## DEC-038 — Cambio inmediato de productos sin saldo futuro

- Fecha/estado/tipo: 2026-10-08, CP-008 / APPROVED / dominio POS; SC-004.
- Decisión exacta: el valor reconocido de la devolución se aplica en el mismo cambio; no crédito acumulable, billetera ni saldo para otra visita. Conservar referencia a venta original, devolución, productos de reemplazo y diferencia cobrada. Cierres históricos inmutables. **Sin saldo futuro no significa sin persistencia:** el cambio debe reconciliarse después de un fallo.
- Fuente: HUMAN-ASSISTED, texto directo CP-008 §1C. Sustituye DEC-030/035 únicamente en alcance incompatible. No exige nueva ficha, PIN, credencial o cuenta exclusivos de administrar saldo; identificación con otra finalidad acreditada e historia existente se preservan.
- Diseño candidato: intento durable de cambio ligado a saleLineId/cantidades/importes pagados, selección de reemplazo, reserva/stock/autorización, confirmación transaccional e idempotencia; cancelación/resultado incierto sin doble devolución ni pérdida de valor; movimiento posterior enlazado si venta cerrada. Contrato CC en SAAS_DISCOVERY.
- Condición comercial separada **SUGGESTED Q-37**: reemplazos por valor igual o superior al reconocido y pago de diferencia. No dar por aprobado perder sobrante, entregar dinero o guardar saldo. Elegibilidad y correcciones Q-16/28; pruebas CC P2, UI por fase.
- Límites: no cambia política de cobros/reembolsos SaaS DEC-032, no borra registros históricos, no autoriza reparar código ni migrar saldos existentes. Importes y stock reales, autoridad y concurrencia todavía NOT VERIFIED.
- **Vigencia CP-009, 2026-10-08:** CP-009 §5 resuelve Q-16/28/37: cambios voluntarios hasta30d; comprobar venta/línea/cantidad/importe pagado y artículo **SIN USAR Y EN BUEN ESTADO**. Cajero prepara, administrador autorizado confirma. Reemplazo igual/superior y cobro de diferencia; si menor ajustar/cancelar, sin pérdida de sobrante/efectivo/saldo futuro. Correcciones posteriores enlazadas con autorización/motivo/evidencia, sin editar cierres. **Cuarentena de artículos usados/no revendibles no es vía ordinaria de elegibilidad**; obligaciones de garantía requieren revisión externa separada. CC durable/regresiones se conservan; ninguna reparación/migración funcional autorizada.

### SC-004 — Sustitución del crédito persistente por cambio inmediato

**SPEC CHANGE APPROVED**, fuente CP-008 §1C, 2026-10-08. Es cambio real del alcance previamente registrado, no una corrección retrospectiva de representación. DEC-030/035 pasan a SUPERSEDED en su ámbito incompatible, conservando textos/fuentes/historia. No hay baseline SaaS aprobada que pueda modificarse silenciosamente; se actualizan borradores/registro e impacto para la futura baseline.

| Área afectada | Cambio vigente / garantías conservadas | Gate / evidencia |
|---|---|---|
| F1/F2 · valor y entidades | Retirar ledger de saldo disponible futuro, vencimiento/transferibilidad y beneficiario/credencial exclusivos del saldo. Conservar Exchange/Return/Sale, líneas, importes, evento durable, stock y auditoría. No eliminar Customer para fines acreditados ni datos heredados | Q-16/28/37 en P0-B; diseño CC P0-C; integración P2 |
| F3/F4 · consistencia y permiso | Una operación de cambio con transacción por tenant, clave de idempotencia y reconciliación. No crear flujo PIN/recuperación de crédito; sí comprobar permiso actual, venta/cantidad/importe y estado de cobro | DG-TENANT/ADMIN; carreras/ACK perdido/rollback/restauración en P2 |
| F6 · interfaz | Un recorrido elegir venta/líneas→reemplazos→diferencia→confirmar→comprobante/estado. Eliminar pantallas de billetera y transferencias; conservar movimientos posteriores enlazados y cierre inmutable | Q-31 candidato; UI/API y accesibilidad P2/P5 |
| F7/F9 · prueba y alcance | Mantener668→667 centavos y mismo SKU/precios distintos. Q-26/27/29 DISCARDED como requisitos vigentes exclusivamente de saldo, sin PASS funcional. Q-20 cerrada por DEC-037 es aprobación separada | Criterios CC futuros, evidencias CP-006 intactas; roadmap P2 actualizado |
| F14 · coherencia | Actualizar DEC/reglas/flujos/pendientes/plan/mapa en sitio, sin dossier paralelo ni baseline anticipada | F14 preparatorio revisado; Q-33/36 y P0-B/C/D abiertos |

CP-008 completa también los candidatos técnicos Q-02, ingeniería Q-11 y pantallas Q-31 para revisión conjunta. Esos diseños permanecen SUGGESTED; DEC-014/022/023 siguen PROPOSED. Ningún recurso, dato real, código/configuración, gasto o despliegue cambia como efecto de este SPEC CHANGE.

## DEC-039 — Mercado inicial

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / producto.
- Problema: Evitar que el diseño asuma mercados no elegidos.
- Decisión exacta: Talleres y negocios de autopartes de República Dominicana.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: SAAS/visión/producto, SUB, candidato y términos.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §2, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Mercado confirmado; no acredita demanda, proyección de ingresos ni suficiencia jurídica. Q-18 antes de reglas fiscales/Legal Gate.

## DEC-040 — Edgar como responsable comercial

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / comercial-legal.
- Problema: No inferir una sociedad para contratar o facturar.
- Decisión exacta: Edgar como persona, sin empresa constituida por inferencia.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: Q-03/18, candidato, documentación comercial futura.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §2, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: No acredita RNC/alta fiscal, nombre legal documental, afiliación, cuenta bancaria o admisión comercial; obtener evidencia por canal adecuado sin publicarla. No volver a preguntar persona/empresa.

## DEC-041 — Renovación automática mensual y anual

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / comercial-pagos.
- Problema: Precisar el funcionamiento ordinario de renovación.
- Decisión exacta: Renovación AUTOMÁTICA mensual y anual en el MVP. Sustituye la propuesta manual. Activación inicial solo tras primer pago verificado; no redirección del navegador como evidencia.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: SUB consentimiento/revocación/notificaciones/reintentos/conciliación, permisos, UI y ENG.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §3, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Consentimiento sobre medio de pago separado del permiso empresarial; detalles nuevos con efecto comercial SUGGESTED. Q-03 debe acreditar recurrente real/capacidad contractual antes de DG-PAY; no autorización de cobrar, contratar o programar cobros reales.

## DEC-042 — Calendario de gracia y reactivación sin deuda

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / dominio-pagos.
- Problema: Evitar sumar gracia en cada impago sin cobrar períodos suspendidos.
- Decisión exacta: Durante siete días de gracia se conserva calendario original. Después: nuevo período desde reactivación, descontando una sola vez siete días ya concedidos por episodio. Alta inicial sin deducción; duplicados/reintentos no cambian de nuevo el período. Mensual aprobado: vence10/11/2026, graciahasta17/11, reactiva18/11, vence11/12, no18/12.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: SUB contrato calendario mensual/anual/finmes/frecuencia, UI previa al pago, ledger/eventos y pruebas.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §3, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: No deuda, recargos, prorrateos monetarios o cargos extra. Mostrar período/próximafecha antes de confirmar. Anclas/tardíos/provisión fallida deben concretarse técnicamente; consecuencias comerciales adicionales no se aprueban por extensión. Q-03/18 y DG-PAY; integración P3.

## DEC-043 — Cancelación al final del tiempo pagado

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / comercial-pagos.
- Problema: Coordinar cese de recurrencia y acceso ya adquirido.
- Decisión exacta: Cancelación efectiva al terminar tiempo pagado, coordinada con programación de futuros cobros para conservar ese acceso.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: SUB cancelación/consentimiento/ledger, permiso delegado y UI.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §3, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Revocación cancela futuros intentos autorizables, cobro en vuelo se reconcilia sin fingir reverso. Instantes/procedimiento de reactivación de mandato y fallos siguen candidato; no reembolso ordinario añadido. Q-03/18, pruebas P3.

## DEC-044 — Cambio de plan y frecuencia sin obligación del plan anterior

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / comercial-pagos.
- Problema: Evitar imponer una anualidad antigua al volver de suspensión.
- Decisión exacta: Con período pagado, cambio de plan/frecuencia al siguiente ciclo. Suspendido puede contratar directamente nuevo plan/frecuencia. Descensos sujetos a límites sin borrar datos o históricos; no cobrar meses suspendidos ni obligar al plan anterior.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: SUB quote/entitlements/consentimiento/UI y pruebas.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §3, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: No prorrateos monetarios, cargos extra o borrado automático. No equiparar cuota técnica a precio/plan. Cambios de moneda y detalles con efecto financiero no expresamente aprobados siguen SUGGESTED identificados; DG-PAY.

## DEC-045 — Controles del operador Mecanet

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / seguridad-permisos.
- Problema: Limitar acciones privilegiadas sin facultades implícitas sobre negocios.
- Decisión exacta: Un operador principal sin delegación inicial, MFA, reautenticación sensible válida5min, sesión15mininactividad/8hmáximo; motivo/auditoría de acciones sensibles. Sin acceso ordinario al POS, impersonación, secretos o infraestructura por ser operador.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: MT/MC, SAAS/permisos/UI, ENG y tests negativos.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §6, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Alcance administrativo DEC-013/028 conservado. MFA/bibliotecas/mecanismos aún candidatos, no controles instalados. Soporte excepcional fuera del acceso ordinario. DG-ADMIN/OBS; P1/P4.

## DEC-046 — Delegación empresarial por acción

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / seguridad-producto.
- Problema: Permitir administración autorizada sin convertir administradorPOS en dueño.
- Decisión exacta: Titular puede otorgar expresamente permisos por acción a miembros para contratar, cancelar, cambiar e invitar. Ámbito tenant; concesión/revocación/ejercicio auditables; autorización real API. AdminPOS no hereda. No propiedad ni redelegación implícita, ni consentimiento de medio de pago por ser delegado.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: Matriz SAAS/MT, SUB autoridad/mandato, UI, P1-L1 e integración.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §6, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Granularidad técnica y fronteras concurrentes se revisan como candidato. Titular conserva concesión/revocación/transferencia. No soporte global ni nuevos cargos. DG-TENANT/ADMIN/PAY; P1/P3/P4.

## DEC-047 — Sesiones empresariales acotadas

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / seguridad-UX.
- Problema: Fijar duración y fricción de reautenticación.
- Decisión exacta: Conservar sesiones empresariales de30min de inactividad y8h máximas.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: MT sesiones, SAAS/UI, ENG/testseguridad.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §6, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Mecanismo de cookies/CSRF/revocación y recuperación de intención aún SUGGESTED. Renovar autenticación no repite un cobro/intento. No rememberme indefinido. DG-TENANT/ADMIN; P1.

## DEC-048 — Transferencia voluntaria de titularidad

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / producto-permisos.
- Problema: Separar delegación de cambio de propietario empresarial.
- Decisión exacta: Conservar recorrido propuesto de transferencia voluntaria entre titulares con aceptación y reautenticación; no concederlo a cualquier delegado.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: SAAS matriz/flujo, MT, SUB separación propiedad/medio de pago.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §6, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Candidato concreta receptor miembro verificado y aceptación de ambos; no toma de control del operador. Incidente sin prueba de identidad no reasigna. No transferir mandato de pago por inferencia. DG-ADMIN/TENANT, pruebas P1/P4.

## DEC-049 — Retenciones por clase de datos

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / privacidad-lifecycle.
- Problema: Evitar mezclar suspensión, baja, identidad y expiración de copias.
- Decisión exacta: Demo ficticia: purga≤1h después de vencer. Identidad sin vínculos ni obligaciones:30d inactividad. Abuso24h. Métricas24hdetalle/30dagregado. Errores30d. Copias7d. POS30d tras baja efectiva para exportar, después purga. Suspensión por impago no inicia borrado.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: DEM/MT/G/SUB, modelo de datos/candidato, jobs/copias/restore y pruebas.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §7, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: Cada clase tiene aprobación explícita actual. No borrar identidad ligada a suscripción activa por inactividad. Separar eliminación activa/expiración en copias; restore respeta eliminaciones/revocaciones posteriores. Conservación obligatoria de documentos Q-18 externa, no plazo inventado. DG-MIGRATION/OBS; P1/P2/P3/P6 según garantía.

## DEC-050 — Objetivos y frecuencia de recuperación

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / operación.
- Problema: Definir objetivos medibles sin declarar SLA probado.
- Decisión exacta: RPO1h; RTO4h con host utilizable y24h por pérdida de host; copias cada30min.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: G-04/MT-E, costes/retención/candidato, TESTING/DEP.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §7, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: APPROVED como objetivos pendientes de ensayo. No capacidad, consistencia o recuperación demostradas; la selección de destino/entorno permanece separada. Diseño P0-C; sintético P1, POS P2, pagos P3, desastre/capacidad P6.

## DEC-051 — Custodia de copias por Edgar

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / seguridad-operación.
- Problema: Separar recuperación y panel de suscripciones.
- Decisión exacta: Edgar custodia recuperación, separado de permisos del panel.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: G-04 acceso independiente, permisos/secretos/restore y candidato.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §7, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: No concede copias/infra a operador o delegado empresarial por extensión. Recuperación de cuenta externa/MFA/credenciales por acreditar fuera de host y Oracle antes de egreso; sin leer o transmitir secretos ahora. DG-MIGRATION, Environment/Production Gates.

## DEC-052 — Destino de copias externo a Oracle

- Fecha/estado/tipo: 2026-10-08, CP-009 / APPROVED / arquitectura-operación.
- Problema: Poder recuperar ante pérdida del VPS o acceso a Oracle.
- Decisión exacta: Buscar plataforma externa a Oracle, gratuita al principio y de coste proporcional al crecimiento. Comparar primero B2 y R2 Standard sin reducir30min/7d para ajustar gratuidad.
- Alternativas/motivo: respuesta humana actual; sustituye únicamente propuestas incompatibles, no vuelve a preguntar condiciones confirmadas.
- Alcance/documentos: G-04 comparativa/modelo completo, SUB economía, Q-08/23 y candidato.
- Validación/fuente: HUMAN-ASSISTED, adjunto CP-009 §§7/8, recibido2026-10-08; aprobación de intención, no factibilidad o implementación.
- Límites/revalidación: OCI no estaba aprobado, se descarta su recomendación. Plataforma concreta sigue SUGGESTED; no cuenta, gasto o copia autorizados. No confundir tamaño activo con336puntos/versiones/temporales; tarifas públicas no acreditan cuenta o volumen real. Diseño/coste antes de elección; ensayos en su gate.

### CP-009 — Una revisión de impacto y clasificación

Fuente directa indicada al inicio; recepción2026-10-08, sin retrofechas. **No nueva SPEC CHANGE ni SPEC ERRATA:** manual, ancla rígida después de gracia, obligación de renovar plan anterior, solo titular y OCI eran propuestas no aprobadas. Lifecycle y permisos por definir ya estaban dentro del MVP (DEC-033/013). Las respuestas concretan esos huecos; DEC-036 conserva no acumular gracia mediante fórmula aprobada DEC-042. SC-001…004 y SE-001/historia no se borran ni reinterpretan. Ninguna aprobación de producto ratifica baseline o autoriza implementación.

| Ámbito / autoridad nueva | Contratos afectados y propuesta retirada | Fase/gate y evidencia necesaria |
|---|---|---|
| Mercado/catalogo DEC-039/040/018/019/026 | Conteo e importesUSD confirmados; EdgarpersonaRD, sin sociedad fiscal inferida ni módulos exclusivos | Specification P0-B; regla fiscalQ-18/contratoQ-03 DG-PAY; facturacióncomercio P6 |
| Recurrencia/calendario/cambios DEC-041…044 | SUB/COM/MT/UI/ENG: mandato, intentos acotados, ledger/quote/período, baja/carreras y plan nuevo suspendido. Retira manual ordinario, oldplan obligatorio y Dic10propuesto | DG-PAY P0-C antes integración; negativosP3, experienciaP5 y proveedorrealP6; codefuturoauth/payment/provisioning noeditado |
| Demo/caja/cambio DEC-027/029/038 | DEM/CC/UI: correo+3porcuenta24h, IPadicional; turnos; elegibilidadSINUSAR/BUENESTADO, diferencia y corrección. No cuarentenaordinaria ni saldo futuro | P0-B/C conreglasahorarespondidas; identidadP1, cuotas/caja/668→667/preciosporlíneaP2, conversiónP3/UIporcorte |
| Permisos DEC-045…048 | SAASmatriz/MT/SUB/UI: operadorseparado, concesión/revocaciónporacción, sesiones y transferencia distinta de mandato | DG-TENANT/ADMIN/PAY; negativosAPI P1/P3/P4. No autorización solo porUI ni delegación global |
| Datos/operación DEC-014/049…052 | G/MT/DEM/SUB/ENG: región/allowlist/límite1000, retenciones, jobs30min7d, recuperaciónexterna/custodia. Presupuesto tras coste, noUSD0/reservaaprobados | DG-OBS/MIGRATION/DEP-D2; destino/contratos antesegreso; restore sintéticoP1/P2/P3, capacidad/desastreP6 |
| F14/expediente | Candidato consolidado versionado, listaúnica depurada, revisión de coherencia real y gates diferenciados | Q-33 revisión ejecutada con residual identificado; Q-36baseline/autorizaciónpendientes; P0únicaactiva, P1noiniciada |

No registro de cuenta, tarifa privada, impuesto, método de autenticación del proveedor, región real de una cuenta o capacidad como CONFIRMED por inferencia. Verificación pública es VENDOR-DOCUMENTATION; pruebas funcionales e infraestructura siguen NOT VERIFIED.

## DEC-053 — Orden acotado RG-001 para el primer lote privado

- Fecha/estado/tipo: 2026-10-08, CP-011 / APPROVED / roadmap-gates.
- Fuente humana directa: adjunto `51b8e835-d246-41a7-8f4c-f54901984f96/Texto pegado.txt`, §§1…6. Aprueba expresamente RG-001 presentado en CP-010 y el riesgo de retrabajo por condiciones comerciales posteriores; no se atribuye aprobación a una fecha anterior.
- Decisión: preparar y revisar una baseline limitada a los ocho cortes privados P1-L1, manteniendo diseño previo, entorno por garantía, revisión F14 del lote y decisiones diferenciadas de aprobación de especificación y autorización de implementación. Q-40 queda resuelta; no nueva DEC equivalente.
- Aplicación: Q-03/Q-38 antes del primer código dependiente de pagos, normalmente P3/DG-PAY; Q-18 antes de impuestos/comprobantes/garantías/conservación obligatoria dependientes, incluso P2. Q-08 destino/protección/credenciales antes de uso externo; recuperación sintética y sus mecanismos siguen dentro de L1.8. Q-23 presupuesto antes de adquisición/gasto, recursos locales en Q-32. Servicios/datos antes de egreso; capacidad y lanzamiento antes de sus usos/gates.
- Alcance técnico de la futura aprobación: únicamente S-18 P1-L1 v0.1-CP011 del candidato general v0.11-CP011 y su manifiesto selectivo de contratos, no los paquetes completos Q-02/11/31 ni quince pantallas. Fixtures privados no crean bypass de pago/autorización ni pueden activar empresas reales.
- Límites explícitos: baseline, implementación, proveedores/CardNET/B2, condiciones Q-38, presupuesto, instalaciones, contratos, gastos y despliegues **NO APROBADOS** por esta decisión. P0 sigue EN CURSO; P1 NO INICIADA; F14 del SaaS completo permanece parcial.
- Clasificación: aprobación y aplicación de una propuesta de orden antes PROPOSED, no SPEC ERRATA ni nueva garantía comercial. RG-001 es el registro único del cambio de planificación autorizado; no se crea una decisión equivalente ni se reescribe el Prompt. SC-001…004/SE-001 conservados; cualquier futura alteración de garantías aprobadas requiere §5.1.
- Reverse-impact: P0 distingue coherencia del lote/entorno/aprobación/autorización; P1 conserva ocho cortes y restore; P2/P3 reciben dependencias antes del código afectado; P4/P5 conservan diseño de sus pantallas/servicios; P6 conserva producción/capacidad/recuperación externa. No hay código ni infraestructura que revertir en esta ejecución.

### Antecedente de DEC-053 en CP-010 — propuesta conservada

El texto siguiente documenta la propuesta al commit `4b2f272b197619c87e2dff0cd8578da6b9037041`. Sus expresiones de pendiente/no aplicada describen CP-010; el estado vigente es APPROVED con los límites anteriores.

- Fecha/estado/tipo: 2026-10-08, CP-010 / PROPOSED / roadmap-gates.
- Fuente: instrucción humana CP-010 §§2/7 autoriza analizar y presentar la corrección, **no aprobarla**. Evidencia LOCAL: contratos MT/MC/G, ENG/UI/SUB completos y ocho cortes vigentes; QA-EXP-02 con alcance limitado.
- Problema: entrada global P0-B/C/D de CP-009 hace depender el arnés sintético de lectura P1-L1 de documentación fiscal/pasarela y destino/presupuesto operativo completos, aunque esos ocho cortes no generan pagos, facturas, correo externo o copias B2.
- Recomendación SUGGESTED: permitir preparar una baseline identificable **acotada a los ocho cortes existentes** con contratos de autoridad/aislamiento/admisión/rutas/observación/recuperación aprobados, revisión F14 de ese alcance, runtime/tooling fijado y entorno suficiente. Mantener explícitos el candidato SaaS conjunto y las dependencias futuras; no aprobar todo el SaaS mediante una baseline parcial.
- Corrección propuesta, no aplicada: Q-03 factibilidad/diseño DG-PAY y Q-38 condiciones antes del primer corte que los implemente, normalmente P3; Q-18 antes de cualquier impuesto/comprobante/garantía/purga dependiente, incluso P2. Sandbox antes de integrar; comercio/términos/cobro antes de uso real. No esperar P6 para diseñar o verificar esas garantías.
- Recuperación/costes: contrato de copia/journal/restore sintéticos antes de L1.8; plataforma B2 y configuración/credenciales antes de su uso externo. Recursos/presupuesto necesario para cada lote antes de adquirirlos; presupuesto operativo antes de comprometer servicios. RPO/RTO/frecuencia/7d y destino fuera de Oracle siguen APPROVED e intactos.
- Controles que permanecen obligatorios: Q-02/11/31 pertinentes al lote, F14, baseline y autorización expresa Q-36; Environment Gate antes del corte; ocho salidas conjuntas antes de exponer siquiera el recorrido QA. P1 sigue NO INICIADA y P0 EN CURSO en esta ejecución.
- Riesgo/coste de adelantar: puede existir retrabajo o inviabilidad comercial si el proveedor/fiscalidad obligan a revisar el dominio; no se elimina USD, AUTO o gracia para acomodarlos. Edgar debe aceptar ese riesgo limitado y las exclusiones antes de cambiar el orden. No usar estados sintéticos como prueba de pago o política final.
- Alternativa válida: mantener ruta CP-009 y resolver todas sus entradas P0 antes de iniciar. Q-40 es decisión opcional de orden; no un nuevo requisito de producto ni bloqueo adicional de esa ruta.
- Trazabilidad/impacto: ROADMAP «RG-001», plan matriz A/B/C/D, candidato v0.10-CP010 y PLANNING_STATE/Q-40. No SPEC CHANGE ejecutado, ninguna garantía humana revocada. Cualquier cambio efectivo de gate/alcance requiere decisión explícita, actualización trazable y revisión; Prompt intacto.

## DEC-054 — PostgreSQL como motor objetivo del SaaS

- Fecha/estado/tipo: 2026-10-12, CP-012 / APPROVED / tecnología-datos; SPEC CHANGE SC-006.
- Decisión/fuente: el usuario reafirma directamente PostgreSQL, React y Express en §4. Se registra la confirmación actual; Git CP-011 aún documentaba MongoDB y no acredita una fecha anterior.
- Alcance: motor objetivo PostgreSQL de Mecanet, independiente del PostgreSQL de Coolify. DEC-012 conserva separación y mínimo privilegio; mecanismo relacional concreto pendiente de A. No reabrir motor ni sustituir todo por un esquema compartido por comodidad.
- Motivo: atender la dirección humana preservando seguridad multiempresa; alternativa Mongo queda como producto/evidencia heredados, no target SaaS.
- Revalidación: versión/driver y SQL real en Development/Environment Gate; permisos, concurrencia, recuperación y cambios de dominio por fase. Sin migrar/borrar Mongo actual.

### SC-006 — Sustitución del motor aprobado y revisión relacional

**SPEC CHANGE APPROVED** con fuente humana actual, separado de SC-005: cambia el componente Mongo de DEC-012/stack heredado por PostgreSQL. No es errata ni se inventa una aprobación pasada. Revisión inversa F2/F3/F4/F5/F7/F10/F11/F12: Mongoose/modelos/globales, ObjectId, índices/TTL, transacciones, sesiones, majority/linearizable, dbStats y oplog/dump no son contratos SQL. S-18 sustituye solo lo requerido por P1-L1; resto POS/fiscal/pagos se adapta antes del primer módulo dependiente. PostgreSQL no ofrece transacción normal entre bases: preservar autoridad central y fronteras con protocolos explícitos; evitar prometer snapshot común con dumps independientes. Restore físico de cluster propio y journal externo propuestos; ninguna copia de coolify-db. El costo y perfil de conexiones no se heredan de Mongo. Regresiones nuevas: CONNECT/esquema/roles cruzados, sesión revocada, admisión entre dos API, pérdida de confirmación, restauración coherente sin resurrección. CP-0108PASS y F14-CP011 conservados, no PASS del motor objetivo. Código futuro afectado: composición/config/db, repositorios/modelos, sesión, permisos, admisión, métricas, fixtures/migraciones QA y backup/restore. Código actual intacto.

## DEC-055 — Interfaz totalmente cuadrada

- Fecha/estado/tipo: 2026-10-12, CP-012 / APPROVED / UX.
- Decisión/fuente: §4 actual confirma diseño visual totalmente cuadrado, sin bordes redondeados. No atribuir aprobación histórica no acreditada.
- Alcance: superficies, controles y estados de Mecanet SaaS; los estilos heredados no prevalecen. S-18 aplica la regla al recorrido mínimo; resto Q-31 antes de cada pantalla. Semántica, foco, responsive y accesibilidad permanecen.
- Motivo: dirección visual humana; no requiere cambiar el mapa documental o interfaces ajenas. Ningún componente modificado por esta confirmación.
- Verificación posterior: geometría/estilos computados y revisión visual en navegador, estados responsive y accesibles; no PASS por token escrito.

## DEC-056 — NCF y e-CF incluidos en el alcance

- Fecha/estado/tipo: 2026-10-12, CP-012 / APPROVED / producto-fiscalidad.
- Decisión/fuente: §4 actual confirma comprobantes fiscales NCF y facturación electrónica e-CF en el SaaS. No reabrir inclusión ni declarar el alcance cumplido por recibos heredados.
- Límites: no aprueba tipos/tasas/calendarios legales, emisor, certificado, proveedor, requisitos DGII ni suficiencia jurídica. Q-18 resuelve esas entradas antes de primer código fiscal dependiente (P2 y/o P3); emisión real/certificación y Legal Gate antes del uso/lanzamiento.
- Alcance P1-L1: lectura ficticia sin importes/impuestos/emisión; la exclusión del lote no elimina NCF/e-CF del producto. Flujos de numeración/anulación/inmutabilidad se diseñan con contrato acreditado cuando corresponda.
- Motivo: preservar alcance confirmado sin implementar fiscalidad por inferencia. No consulta de cuentas ni envío fiscal, no conclusión legal nueva.

## DEC-057 — Implementación y QA autorizadas bajo condiciones de entrada

- Fecha/estado/tipo: 2026-10-12, CP-012 / APPROVED / ejecución condicionada.
- Fuente/decisión exacta: §5 actual autoriza implementar y verificar el lote cuando estén satisfechos gates, baseline aprobada y entorno correspondiente. Permite avanzar a QA aislada cuando seguridad, recursos y autorización estén acreditados. B queda recibida condicionalmente; no se vuelve a pedir una B genérica.
- Alcance: P1-L1 adaptado; inspección remota en lectura autorizada ahora. A del candidato PostgreSQL/operación independiente sigue pendiente: no fue presentada/aprobada por extensión y la versión Mongo de CP-011 tampoco estaba aprobada.
- Límites: sin lanzamiento público, datos reales, migraciones, cambios de infraestructura compartida, producción/Nexora/Mecanet-EAK por extensión. No gasto, push/merge o instalaciones globales implícitos. Una edición compartida de proxy necesita autorización específica sobre propuesta concreta.
- Gate: ejecutar solo después de A identificable y Development/Environment por corte; registrar transición P0→P1 cuando efectiva, sin declarar P0 global completo. Una prueba de la función aún no construida es salida, no precondición circular.

## DEC-058 — Aprobación limitada e implementación autónoma P1-L1

- Fecha/estado/tipo: 2026-10-12 / APPROVED / baseline y ejecución.
- Fuente: adjunto humano 5419b9ad-8a81-4c90-b114-d6c23b370d44, §§1/3/4/5. A exacta P1-L1 v0.2-CP012, S-18/L-01/ocho cortes, commit3b387b38784907b67e2209a35c3d5f400d70742e. [Baseline protegida](specs/P1-L1.md).
- Aprueba los mecanismos SQL/Compose/QA privada de ese alcance y hace efectiva B al acreditar entradas; no otra autorización por corte. Permite crear recursos exclusivos temporales QA con preflight, límites y reversión. DEC-022/023 quedan aprobadas únicamente en su parte incorporada al lote; diseño público restante continúa propuesto.
- No aprueba SaaS general, DNS/proxy compartido, publicación, datos reales, pagos/fiscalidad funcional, proveedores/gastos, push/merge. RG-001 mantiene dependencias antes de su uso. No transfiere PASS históricos.

### SE-002 — Baseline portable y autorización de integración CP-015

**SPEC ERRATA de representación / 2026-10-13 / LOCAL + HUMAN-ASSISTED.** La rama limpia excluye los commits antiguos del PR #1; el Git aprobado3b387b3 queda fuera de su ascendencia. Se conservan snapshots byte exactos de S-18/L-01, DEP-IND y los ocho cortes, con manifiesto fuente/blob/SHA256 en docs/specs/p1-l1-approved. No cambia la aprobación DEC-058, ninguna regla o garantía, ni se aprueba el SaaS general o entrada compartida de DEP-IND-04. La rama fuente se preserva. No nueva decisión de producto ni SC por este traslado.

Fuente humana directa actual: adjunto CP-0151c09dd03-5335-4dee-abad-844c36aebdcc, recibido2026-10-13. Autoriza integración Git condicionada y preparación del siguiente lote; sustituye únicamente la prohibición Git de CP-014. No A/B de P1-L2, despliegue, cambios de Vercel/Coolify, contratación, DNS, producción ni migración. Safety Gate remoto no acreditado conserva la operación detenida; sus otras tareas locales continúan.

## DEC-059 — Dominio oficial futuro mecanet.app

- Fecha/estado/tipo: 2026-10-12 / APPROVED / destino público; SPEC CHANGE SC-007.
- Fuente: mismo adjunto §2. Compra de mecanet.app CONFIRMED por el usuario; DNS/TLS/propiedad técnica NOT VERIFIED. Sustituye mecanet.site solo como destino público futuro, conservando recursos/rutas existentes.
- SUGGESTED: landing https://mecanet.app, aplicación https://app.mecanet.app y /api del mismo origen. Sin cambio de QA privada app.mecanet.test:18443 ni permiso de infraestructura compartida.
- Impacto SC-007: documentación de destino, futura configuración Host/Origin/cookies/certificados/links comerciales. Ningún comportamiento QA cambia; futuras rutas/DNS/TLS se verifican en su gate. Nexora y dominios anteriores se preservan.

## DEC-060 — Cadena de compilación y verificación SaaS propia

- Fecha/estado/tipo: 2026-10-13, CP-016 / APPROVED / SPEC CHANGE SC-008, alcance L-06 y gate de dependencias de P1-L1.
- Fuente humana directa: respuesta actual «Aprobar SC-008 e implementarlo (recomendado)» a la propuesta concreta de manifiesto/lock SaaS, materialización temporal de allowlist y auditoría completa estricta. A y B de este cambio quedan expresas; no autoriza P1-L2.
- Problema/evidencia: audit completo del cliente heredado FAIL, siete paquetes de tooling afectados por dos GHSA; no corrección compatible acreditada. Caracterización previa aislada: 20 archivos copiados byte exactos, diez dependencias directas fijadas, auditorías completa/runtime sin hallazgos, 29 pruebas SaaS + 3 sanitización, cuatro negativas y tres assets iguales a F. Es caracterización local, no un PASS anticipado de implementación/CI.
- Decisión exacta: incorporar manifiesto y lock exclusivos para construir/probar SaaS; staging temporal con lista cerrada de fuentes/config, sin .env/public/paquetes heredados. Conservar React18.3.1/Vite6.4.3/Vitest4.1.11 y el cliente heredado/Tailwind3.4.18 sin cambios. Auditar estrictamente todas las dependencias del backend y de la nueva cadena SaaS; no filtrar advisories, rebajar umbral, ignorar exit ni aceptar riesgo por extensión.
- Límites: la auditoría legacy permanece FAIL visible y su tooling no se usa en esta lane. Remediarla antes de volver a depender de ella. Vite contiene código bundled que npm audit y los hooks de paquetes no inventarían como limpio; evaluar rutas reales/entradas versionadas, no usar servidor de desarrollo público ni contenido tenant como configuración/CSS/patrón. Los hooks fail closed y las negativas limitan cargas externas/fallback, sin prometer inspección de llamadas internas.
- Impacto/reverse-impact: actualización aditiva de docs/specs/P1-L1.md, scripts/ci/manifiesto/lock/runner/barrera y callers de verificación/build propios; CI conserva tests y audit completo de su alcance real. No bytes funcionales, permisos SQL, sesiones, cuotas, recovery, Compose/QA ni cliente legacy alterados. CP-013/014 conserva provenance; regresión de assets no sustituye DB/browser/restore. L2 y lotes futuros deben acreditar su cadena cuando cambien entradas/dependencias.
- Alternativa descartada para esta ejecución: major Tailwind4 afectaría el cliente heredado y no elimina automáticamente código bundled de Vite. No se aplica excepción humana indefinida ni se presenta audit0 del fixture como solución ya integrada.
- Rollback: revertir commit del runner/manifiesto/gate devuelve Q-43 BLOCKING; no ejecutar tooling afectado ni alegar reversión de datos. Gate: instalar lock sin lifecycle, negativas de allowlist/symlink/fallback, hashes de copia, tests reales y build/F, auditorías nativas, revisión independiente y CI del SHA exacto antes de merge. No QA ni recursos compartidos nuevos.
