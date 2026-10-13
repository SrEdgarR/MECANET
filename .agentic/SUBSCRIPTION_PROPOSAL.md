# Catálogo, lifecycle y economía — Mecanet SaaS

**Vigencia CP-012:** SC-005/006: objetivo PostgreSQL y operación independiente de Coolify. S-18 P1-L1 v0.2-CP012 es el candidato limitado actual; contratos Mongo/Coolify anteriores son antecedentes no incorporados como mecanismos vigentes. DEC-055 exige UI totalmente cuadrada y DEC-056 mantiene NCF/e-CF en el alcance global (Q18 antes del trabajo fiscal). Planes y condiciones aprobados conservados. A pendiente; B condicional DEC-057 recibida. No baseline ni pruebas SQL por extensión.

Actualización documental: **2026-10-08**, versión de trabajo 0.7, CP-010; **P0 EN CURSO**. Base comprobada: f72bd2393e26eeaf97f6962baf520a71e50e356b, checkpoint CP-009. Fuente HUMAN-ASSISTED CP-010: adjunto 65a09515-e7d6-477b-b4bf-79cba4986b17/Texto pegado.txt. Esta revisión extrae las condiciones vigentes de Q-38, prepara dos solicitudes externas **no enviadas** y analiza sus dependencias reales para P1-L1. No aprueba políticas, proveedor, gastos, baseline o implementación; no cambia gates. Se preservan decisiones, fuentes consultadas/cálculos CP-009 y ensayo CP-006; sin nueva comparación, consultas externas, pruebas o código probado. Producto, checkout y suscripciones siguen sin implementar.

Navegación: [catálogo](#catálogo-aprobado) · [anualidad](#anualidad-y-catálogo-versionado) · [lifecycle](#ciclo-de-suscripción-propuesto) · [Q-38](#q-38--condiciones-separadas-para-decisión) · [mensajes preparados](#solicitudes-externas-preparadas--no-enviadas) · [dependencias](#dependencias-de-suscripciones-para-p1-l1--propuesta-sin-aplicar) · [proveedor/legal](#proveedor-y-política-sin-reembolsos) · [demo](#demo-confirmada--dec-027) · [economía](#modelo-económico-recalculable) · [evidencia](#evidencia-y-trazabilidad).

## Catálogo aprobado

**CONFIRMED / APPROVED — DEC-018/019/039/040.** Mercado inicial: talleres y negocios de autopartes de República Dominicana. Responsable comercial: Edgar como persona; no acredita alta fiscal, empresa constituida o afiliación del proveedor. Una empresa por suscripción, sin sucursales en el MVP. DOP/USD son tarifas independientes, no conversión diaria. Cantidades/precios aprobados; rentabilidad y total fiscal **NOT VERIFIED**.

| Plan | Mensual DOP | Anual DOP | Mensual USD | Anual USD | Usuarios | Productos |
|---|---|---|---|---|---|---|
| Esencial | 799.00 | 8,149.80 | 15.00 | 153.00 | 4 | 300 |
| Negocio | 1,490.00 | 15,198.00 | 29.00 | 295.80 | 10 | 4,000 |
| Máxima | 2,490.00 | 25,398.00 | 49.00 | 499.80 | 25 | 10,000 |

Máxima no añade funciones exclusivas inventadas. No vender seguridad o protección de datos como extras; no anunciar certificación e-CF/DGII, recursos dedicados, disponibilidad o soporte 24/7 sin decisión/evidencia propias. El POS heredado no demuestra aislamiento SaaS. Hipótesis USD 25/39 y precios anteriores no son oferta vigente. Elegir moneda no convierte períodos ya pagados.

Fiscalidad, impuestos incluidos/adicionales, comprobante y total de checkout: **TO DEFINE / Q-18**. Impuesto desconocido es dato pendiente, no cero, 18% o exención; no heredar el impuesto POS. Catálogo aprobado no habilita publicación/cobro con un total fiscal inventado.

### Conteo y excedentes

| Concepto | Alcance aprobado | Concreción técnica SUGGESTED |
|---|---|---|
| Usuario — DEC-018 | Habilitados, incluido titular; invitaciones al aceptarse | Una membresía ocupa una plaza por empresa; sesiones/dispositivos no agregan plazas. Aceptar/reactivar requiere reserva atómica de cupo. Deshabilitar conserva historia; nunca perder al titular para encajar |
| Producto — DEC-018 | Activos/vendibles; desactivación conserva históricos | Cuenta aunque tenga stock cero. Referencia vendible independiente cuenta por separado; sin módulo de variantes inventado. Reactivar exige cupo; desactivar impide nuevas ventas, sin borrar referencias anteriores |
| Excedente / descenso — DEC-044 | Descenso sujeto a límites, sin borrar | Denegar altas/reactivaciones sin cupo; validar cambio antes de cobrar/aplicar. Conservar acceso esencial y operaciones confirmadas; sin eliminación ni selección aleatoria de usuarios |
| Recursos — DEC-028 | Cuotas tenant/globales administrables; perfiles solo de ensayo | Capacidad, valores productivos y eficacia NOT VERIFIED. Cuota no modifica precio ni autoriza cargos. Usuarios/productos no acotan CPU, memoria, consultas o tráfico. Contrato MC en [ARCHITECTURE_OPTIONS](ARCHITECTURE_OPTIONS.md) |

## Anualidad y catálogo versionado

**CONFIRMED — DEC-019/020/024/026:** mensual/anual, 15% sobre doce mensualidades, cobro anual completo anticipado. **SUGGESTED:** redondear a dos decimales, mitad hacia arriba, una vez al final; aritmética entera en unidades menores. Los seis anuales aprobados son exactos en centavos.

Fórmula: total anual = 12 × mensual de misma versión/moneda × 85/100. Equivalente mensual anual es comparativo, no doce cobros ni devengo fiscal aprobado.

| Plan | Doce mensualidades DOP | Ahorro DOP | Total anual DOP aprobado | Equivalente DOP por mes de servicio |
|---|---|---|---|---|
| Esencial | 9,588.00 | 1,438.20 | 8,149.80 | 679.15 |
| Negocio | 17,880.00 | 2,682.00 | 15,198.00 | 1,266.50 |
| Máxima | 29,880.00 | 4,482.00 | 25,398.00 | 2,116.50 |

**CONFIRMED:** conservar períodos pagados, versiones e históricos. **Diseño SUGGESTED:** cotización inmutable de servidor con versión, plan, frecuencia, moneda, cantidades, importes, tratamiento fiscal resuelto, consentimiento y vigencia. El navegador selecciona opciones, no decide tenant/importe/impuesto/fecha. Distinguir orden, pago, mandato, episodio de gracia y período.

Candidato técnico Q-02/Q-31: vigencia de 30 minutos para iniciar alta/reactivación/cambio explícitos; orden ya enviada se consulta aunque caduque la cotización. Renovación automática usa una orden durable para el ciclo que empieza en el vencimiento, con precio/mandato vigentes; no depende de checkout abierto ni confirmación humana mensual/anual. Catálogo aprobado se versiona; modificar precios requiere decisión futura. El esquema de aviso/subida de CP-008 queda histórico, fuera del candidato MVP. No incorporar cupones, prorrateos monetarios, recargos o deuda de meses suspendidos.

**Presentación SUGGESTED — Q-31/Q-02:** antes de autorizar primer cobro mostrar plan/divisa, mensual o total anual completo, desglose fiscal resuelto, recurrencia automática y condiciones. En período normal las fechas siguientes ya se conocen. Reactivación posgracia: mostrar regla/fechas propuestas antes del pago; después de verificarlo y tener estado utilizable, presentar fechas contractuales locales definitivas y descuento de siete días antes de confirmar reactivación, **sin segundo cobro**. UI ofrece fechas con zona; el instante técnico R conserva su hora al confirmar durablemente. Si cambia fecha local, plan, frecuencia o importe aceptados, actualizar/reaceptar antes de activar; no fingir timestamp anterior al commit. Preparación demorada muestra dinero recibido, no fallo de pago. Pago no aplicable permanece en revisión, sin recobro, traslado silencioso o descarte. Recorrido en [SAAS_DISCOVERY](SAAS_DISCOVERY.md).

## Ciclo de suscripción propuesto

**CONFIRMED / APPROVED:** DEC-031 primer pago verificado antes de operación; DEC-032 sin reembolsos ordinarios; DEC-033 lifecycle requerido; DEC-034 siete días operativos de gracia solo a renovación previamente pagada, sin reinicio por intentos. DEC-037 acceso posgracia/reactivación tras pago verificado y estado utilizable. CP-009 concreta DEC-041 renovación **AUTOMÁTICA** mensual/anual; DEC-042 calendario; DEC-043 cancelación; DEC-044 cambios. DEC-036 conserva la garantía contra acumulación de gracia, interpretada por DEC-042.

Propuestas manual/ancla rígida posgracia CP-008 y renovación obligatoria del plan anterior quedan **DISCARDED como candidatos vigentes**; no eran requisitos aprobados. CP-009 responde condiciones abiertas: no registrar errata ni cambio de alcance ficticio.

### Regla única de calendario

**APPROVED DEC-042:** dentro de gracia conservar calendario original; agotada gracia, período desde reactivación descontando los siete días ya concedidos **una sola vez por episodio**. No cobrar meses suspendidos; alta inicial sin deducción. Período/próxima fecha visibles antes de confirmar reactivación. Reintentos/duplicados no extienden ni vuelven a descontar.

**Concreción técnica SUGGESTED — Q-02:** zona America/Santo_Domingo, instantes UTC, períodos [inicio inclusivo, fin exclusivo). E = fin del último período pagado; G = E + siete días; gracia [E,G). R = activación durable tras pago verificado/readiness, más confirmación de fechas en reactivación explícita. Sumar mes/año conservando día/hora; si falta el día, usar último del mes y conservar el día nominal para siguientes ciclos. No sustituir mes/año por 30/365 días.

- Alta inicial: fin = R + un mes/año, sin deducción.
- Renovación aplicable durante gracia: período desde E hasta E + frecuencia vigente; no sumar siete días al final.
- Posgracia: fin F = sumar calendario(R, frecuencia elegida) − siete días concedidos. Cobro del precio aprobado del plan/frecuencia elegidos, sin prorrateo monetario ni precio del plan antiguo. Episodio vinculado a esa única aplicación.
- Período siguiente: **recomendación técnica**, F es nueva ancla y períodos posteriores duran un mes/año completo; no repetir deducción cada renovación. Solo impago posterior de otro período realmente pagado/aplicado abre nuevo episodio, no cada mes suspendido.
- Recontratación después de baja — **SUGGESTED Q-38**, no condición comercial aprobada: proponer conservar la deducción pendiente solo del mismo episodio de esa empresa, sin crear gracia retrospectiva ni restar si no se concedió. No extenderla a otra empresa/identidad ni convertirla en deuda. La regla aplicable tras una baja efectiva requiere aceptación específica; no se infiere de la reactivación posgracia aprobada. Conservar historia y resolver antes de ofrecer este recorrido.

Guardar episodio, E/G, frecuencia/anclas anteriores/nuevas, política, R/F y marca de deducción en el mismo efecto durable que crea período. Evento, restore, login o reprogramación no alteran F ni crean episodio. Autoridad ausente no habilita acceso; diseño no prueba exactitud distribuida.

### Estados y transiciones

Nombres/mecanismos **SUGGESTED**; distinguir dinero, provisión, mandato y derecho de uso. Cambio POS no modifica suscripción.

| Estado | Entrada | Operación y salida |
|---|---|---|
| PENDIENTE_PAGO | Identidad/cotización sin pago verificado | Sin operación/gracia. Rechazo inequívoco permite intento admitido; incertidumbre exige consulta sin duplicar cargo |
| PAGADO_PENDIENTE_ALTA/REACTIVACIÓN | Pago exacto verificado asociado una vez a orden | Preparar estado utilizable. Reloj inicial/posgracia no empieza antes de R; renovación dentro gracia conserva calendario, sin mover fin por demora técnica |
| ALTA_EN_REPARACIÓN | Preparación fallida tras pago | Dinero recibido visible. Reintento idempotente propuesto 1/5/15 min, luego revisión/alerta. Atención antes 24 h como objetivo propuesto, no SLA |
| ACTIVA | Pago verificado, readiness y período vigente durable | Plan/versiones/permisos/cuotas. Registrar pago, verificación, preparación, R y cobertura por separado |
| ACTIVA_CON_BAJA_PROGRAMADA | Actor autorizado cancela | Uso hasta fin de todo tiempo pagado; bloquear futuras órdenes/reintentos, confirmar fecha. Orden ya enviada se reconcilia |
| GRACIA — DEC-034/042 | Renovación impaga de empresa antes pagada | Siete días de operación autorizada; única ventana estable por episodio; nunca primer pago |
| SUSPENDIDA_POR_IMPAGO — DEC-037 | G sin renovación aplicada | Cuenta/estado/facturas SaaS/pago/soporte/exportación limitada; sin POS ni borrado. Puede contratar directamente nuevo plan/frecuencia con límites/pago/readiness |
| FINALIZADA — DEC-043/049 | Fin pagado tras baja | Sin POS; acceso esencial/exportación durante retención. Purga POS30 d tras baja; obligaciones específicas aparte. Recontratar no borra historia ni revive datos purgados |
| REVISIÓN_FINANCIERA | Cargo duplicado/incorrecto, disputa, reverso, servicio fallido o pago no aplicable | Marca transversal, no reemplazo ciego del servicio. Dinero visible y orden conflictiva sin nuevos cargos. No período, deuda, gracia o reembolso ordinario inferidos |

Gracia/reactivación no conceden membresías/roles ni eliminan cuotas. Revocación, seguridad, ámbito tenant y MC siguen vigentes. Pagar resuelve solo impago. Operador no adquiere permiso POS ni consentimiento del medio de pago por conciliar.

**Acceso posgracia APPROVED DEC-037:** cuenta, estado, facturas de suscripción, pago, soporte y exportación limitada conforme permisos; sin POS ordinario. **Concreción SUGGESTED:** cuenta propia/recuperación bajo controles; administración empresarial por titular o delegado por acción DEC-046; exportación con permiso específico. Paginación/presupuestos MC/autorización por solicitud, sin excepción ilimitada. Exportar no exige reactivar POS.

**Retención APPROVED DEC-049:** POS30 d desde baja efectiva para exportar, luego purga; gracia/suspensión no inicia plazo. Copias 7 d distinguiendo eliminación activa y desaparición física. Solo obligaciones acreditadas Q-18 justifican conservación adicional. Restore respeta baja/eliminaciones/revocaciones posteriores, sin reabrir servicio. No cambiar datos existentes en P0.

### Casos de calendario y confirmaciones tardías

Ejemplos documentales CP-009, **no ejecución ni nuevas aserciones**. Horas 12:00 -04:00 salvo indicación. Premisa mensual: último pago cubre 10-10-2026 → E=10-11-2026; G=17-11-2026, ventana [E,G). Fórmula/ejemplo 10→17→18→11 aprobados; zona, extremos exactos y nueva ancla técnica son concreciones propuestas.

| Caso | Hecho | Resultado contractual / concreción propuesta |
|---|---|---|
| GRA-01 Vencimiento | Impago 10-11-2026 12:00 | GRACIA hasta 17-11 12:00; permisos/cuotas vigentes, reintentos no reinician E/G |
| GRA-02 Alta inicial | Pago 10-11 a 10:00; utilizable/activa a 12:00 | 10-11 12:00 →10-12 12:00; ninguna deducción ni operación antes de activar |
| GRA-03 Dentro gracia | Pago y aplicación 13-11 | Renovación 10-11 →10-12, siguiente 10-12 →10-01; no sumar gracia |
| GRA-04 Frontera | Impaga 17-11 12:00 | Suspender POS ordinario, mantener DEC-037. No nueva gracia por intento/otro mes |
| GRA-05 Posgracia aprobado | R=18-11-2026 | 18-11 + mes −7 d = **11-12-2026**. Ancla siguiente propuesta 11: 11-12 →11-01 completo, sin otra deducción |
| GRA-06 Duplicados | Pago/evento GRA-05 repetido 18/19-11; reinicio 20-11 | Una aplicación, F=11-12; nunca 4-12,18-12 ni nueva empresa |
| GRA-07 Confirmación tardía | Pago proveedor 16-11 18:00; verificación 17-11 12:05; efecto durable 12:07 | Con hora/estado autoritativos y orden aplicable: ciclo 10-11 →10-12. Acceso tras efecto conocido; asOf 12:06 no muestra activación aún inexistente. Sin recobro ni−7 |
| GRA-08 Pago posgracia tardíamente observado | Orden enviada, pago acreditado 18-11 y mensaje 19-11 | Conciliar. Presentar reactivación con R real tras readiness/confirmación; si R=19-11, F=12-12. No fingir R=18 ni segundo cobro. Si cambió plan/importe, revisión/aceptación de aplicación, sin traslado de oficio |
| GRA-09 Suspensión larga | R=18-02-2027, último E=10-11-2026 | Nuevo mensual 18-02 →11-03; deducción única de aquel episodio. Meses suspendidos no son deuda; no renovar plan antiguo |
| GRA-10 Preparación fallida | Pago posgracia 18-11; reparación/confirmación/activación 20-11 | R=20-11 →F=13-12. No deducir al pagar ni por cada reparación; conservar dinero/tiempo sin servicio/causa, sin recobro. No atribuir demora técnica al cliente |
| GRA-11 Ciclo caducado | Pago acreditado 16-11 dentro gracia; primer resultado verificable 12-12, ciclo 10-11→10-12 terminado | Registrar pago/servicio no habilitado; revisión financiera. No recobrar, desechar dinero, activar pasado ni moverlo automáticamente a otro ciclo. Remedio Q-03/18 |
| GRA-12 Anual posgracia | Último anual vence 10-11-2026, G=17-11; R=18-11 | F=11-11-2027; siguiente completo 11-11-2027→11-11-2028. Siete días, no siete meses ni deducción mensual |
| GRA-13 Nueva frecuencia/plan suspendido | R=18-11-2026 cambia Esencial mensual a Negocio anual; límites válidos | Anual Negocio aprobado, F=11-11-2027. Inverso anual→mensual: F=11-12-2026. Sin pagar primero plan anterior ni meses suspendidos |
| GRA-14 Fin de mes normal | Alta 31-01-2027 (2028) | Fin 28-02-2027 (29-02-2028), siguiente 31-03. Día nominal 31, no deriva 28 |
| GRA-15 Fin de mes posgracia | R=31-01-2027 mensual | +mes→28-02, −7d→21-02. Nueva ancla propuesta 21, siguiente 21-03. Repetición conserva 21-02 |
| GRA-16 Bisiesto anual | Inicial 29-02-2028; alternativamente posgracia ese día | Inicial→28-02-2029, ancla 29 con retorno 29-02-2032. Posgracia→21-02-2029 y nueva ancla 21. Escenarios distintos, sin deducción inicial |
| GRA-17 Cambio con tiempo pagado | Mensual hasta 31-01-2027; solicita anual 15-01 | Anual 31-01-2027→31-01-2028 tras pago verificado, sin deducción si no hubo posgracia. Mensual pagado intacto |
| GRA-18 Hora incierta/repetida | Notificación sin hora/moneda auténtica o duplicado GRA-07 a 12:10 | Consultar autoridad, sin elegir fórmula con hora del navegador. Duplicado no cambia asOf 12:06, ventana/deducción/F |
| GRA-19 Nuevo cambio en gracia — SUGGESTED | El 13-11 pide anual mientras una renovación mensual iniciada en E está en conciliación | Primero consultar orden mensual. Si pagada válidamente: conservar 10-11→10-12, anual desde 10-12 tras su cobro futuro, sin segundo cargo ahora. Si definitivamente no cobrada/cancelada: candidato anual desde E=10-11-2026→10-11-2027 con importe/mandato aceptados; sin deducción posgracia. Nunca enviar ambas órdenes concurrentemente |

Hora del proveedor autoritativa solo si lo acredita su contrato. Distinguir pago, observación, verificación, efecto durable y cobertura. Un asOf anterior no incorpora hechos desconocidos; restricción observada/cobertura reconciliada se conservan sin falsificar historia. Ventana/cobro vinculados al estado durable, no al éxito del aviso.

Frontera de operación **SUGGESTED técnica**, coordinada con MC: desde G no admitir POS ordinario nuevo. Operaciones confirmadas conservan resultado/historial; respuesta perdida se recupera con permiso actual sin otro efecto. WAITING/PREPARADO sin cobro revalida y no empieza efectos. Ejecución ACTIVE autorizada antes del corte puede finalizar dentro del plazo ya admitido MC, sin reiniciarlo/renovarlo; no prometer corte atómico entre reloj/control central y commit de otra base. Dinero/resultado incierto conserva reserva/guardia y únicamente consulta/reconciliación de esa intención, no otra venta/cambio. Seguridad/revocación mantienen frontera MT-B. Registrar admisión/comprobación/efecto durable y verificar ambos lados en P1/P3 y CC en P2; no ampliar DEC-037.

Verificación futura P3: GRA-01…19, dos procesos, fronteras E/G, anclas nominales, evento tardío/fecha presentada/deducción por episodio, cambio frecuencia/plan, pago/cotización caducados, reparación/restore; una orden/pago/período aplicado. Negativos de permiso, tenant, cuota, seguridad y autoridad ausente. **NOT VERIFIED funcional**. CP-006 compara ciclos completos; no aprueba contabilidad del período acortado por gracia. Pago/cobertura/tiempo observado siguen separados.

### Consentimiento, delegación, cancelación y cambios

**APPROVED DEC-046:** titular puede autorizar miembros por acción dentro de su empresa; administrador POS no hereda facultades de suscripción. Concesión/revocación/ejercicio auditados y autorizados en API. Delegar no transfiere propiedad ni permite redelegar. **Paquete técnico SUGGESTED:** permisos separados de contratar, cancelar, cambiar plan/frecuencia e invitar; matriz y transferencia voluntaria DEC-048 en [SAAS_DISCOVERY](SAAS_DISCOVERY.md). Revocar facultad empresarial impide acciones futuras del delegado, pero no demuestra por sí solo revocación del mandato del tarjetahabiente.

**Candidato SUGGESTED — Q-38, sujeto Q-03/18:** consentimiento afirmativo separado para conservar token y cargos recurrentes, con responsable/empresa, importe/divisa, mensual/anual, próximas fechas, gracia/baja y medio autorizado; texto/versiones/actor/instante y referencia de mandato, sin PAN/CVV. No casilla preseleccionada ni aceptación inferida de ser titular/delegado. Debe acreditarse autorización válida sobre el medio; permiso empresarial no la sustituye. Importe/moneda/frecuencia fuera del mandato exige consentimiento actualizado antes del cargo. Medio nuevo solo mediante flujo alojado. Revocación efectiva bloquea nuevos cobros y programa fin pagado; no descuenta servicio ya pagado ni prueba cancelación de orden ya enviada.

**APPROVED DEC-043:** baja efectiva al terminar tiempo pagado. **Concreción SUGGESTED:** registrar solicitud autorizada y detener generación/reintentos futuros; confirmar fecha/alcance. Ya en gracia/suspensión sin tiempo pagado: baja al confirmar, sin deuda. Retirar baja antes del fin exige acción/mandato válidos, sin ampliar fechas. Orden enviada se reconcilia: no afirmar cancelación bancaria por estado local. Si el proveedor confirma cobro válidamente enviado antes de la revocación, aplicar una vez el ciclo cotizado todavía aplicable y fijar baja al fin de ese tiempo pagado; informar la fecha reconciliada. Si el cargo no era válido, la orden no tenía autoridad o el ciclo ya no es aplicable, conservar dinero en revisión sin activar. Un evento repetido no renueva ni mueve esa fecha. Cargo contrario a revocación efectiva es excepción financiera/legal, no derecho automático a otro período. Disputa abierta no interrumpe por sí sola acceso pagado sin política independiente.

**APPROVED DEC-044:** durante tiempo pagado, nuevo plan/frecuencia al ciclo siguiente; suspendida, contratación directa del nuevo plan/frecuencia. Descensos sujetos a límites y sin borrar. **Concreción SUGGESTED:** una programación futura vigente, versionada; cotización/mandato actualizados antes de cobrar. No cobrar antiguo y nuevo por el mismo ciclo. Validar cupos al programar y otra vez antes de cobrar/aplicar. Si no cumple, notificar y pausar cambio/cobro, sin renovar antiguo por sorpresa; resolver explícitamente, con gracia solo si elegible. Carrera tras cobrar exige revisión, sin eliminación/cargo alternativo. Cambio de moneda recomendado en misma frontera o reactivación explícita suspendida, sin convertir históricos; condición comercial SUGGESTED Q-38. No recortar antes el período ya pagado para forzar descenso.

**Borde de cambio durante gracia — SUGGESTED Q-38:** si ya estaba programado para E, renovar ese plan/frecuencia aceptados. Para solicitud nueva durante gracia, recomendar nuevo plan/frecuencia desde E con calendario original, límites/mandato/importe reaceptados y orden antigua reconciliada o cancelada antes de enviar otra. Si la orden anterior resultó pagada válidamente, conservar ese período y aplicar DEC-044 al ciclo siguiente: no cambio retroactivo ni segundo cobro. Sin deducción posgracia, prorrateo ni permisos del nuevo plan antes de aplicar pago. El derecho operativo durante gracia sigue sus cuotas/permisos vigentes.

**Avisos/reintentos SUGGESTED — Q-38:** mensual 7/1 días antes; anual 30/7/1; entrada en gracia/días 3/6; pago/baja/cambio y suspensión. Portal/correo con identidad única; falta de entrega no implica aceptación/extensión. Un intento al vencimiento; máximo tres adicionales a +1/+3/+6 días, solo rechazo inequívoco recuperable, mandato vigente y dentro de gracia. Rechazo permanente/revocación/baja/suspensión detienen cargos; no reintentos retrospectivos al recuperar job. Medio nuevo/recuperación explícita cancela intentos programados de esa orden y revalida para evitar competencia. Coste por declinados/reglas de red pendientes; no todo rechazo permite reintentar. Timeout/resultado ambiguo solo consulta, nunca otro cargo automático. Tras suspensión requiere reactivación autorizada; no cobrar meses omitidos.

### Q-38 — condiciones separadas para decisión

**Todas las filas son SUGGESTED, pendientes de aceptación por separado.** Extracción CP-010 del contrato CP-009 vigente, no nuevo registro de preguntas ni aprobación conjunta por silencio. [PLANNING_STATE](PLANNING_STATE.md) conserva Q-38 como único pendiente. AUTO mensual/anual, siete días, fórmula posgracia, baja al fin pagado, catálogo y cambios DEC-044 ya aprobados no se vuelven a decidir.

| Condición adicional | Propuesta exacta para aceptar o corregir | Alcance y control que se conserva |
|---|---|---|
| Q38-A · Avisos | Mensual: 7 y 1 días antes del vencimiento. Anual: 30, 7 y 1 días antes. Al entrar en gracia y en sus días 3 y 6. Confirmaciones de pago, baja y cambio; aviso de suspensión. Portal y correo, con una identidad por aviso | La falta de entrega no es consentimiento ni prolonga período/gracia. El proveedor de correo y su egreso siguen Q-39; no se aprueba envío ahora |
| Q38-B · Reintentos de cobro | Un intento ordinario al vencimiento E y como máximo tres adicionales en E+1, E+3 y E+6 días, no desde el último rechazo. Solo ante rechazo inequívoco recuperable, mandato vigente y dentro de gracia | Rechazo permanente, revocación, baja o suspensión detienen nuevos cargos; no ponerse al día con intentos omitidos. Medio nuevo/recuperación explícita sustituye los programados tras revalidar orden. Resultado incierto exige consulta, nunca otro cobro automático. Tarifas y reglas de red requieren Q-03 |
| Q38-C · Solicitud nueva de plan/frecuencia durante gracia | Admitirla desde E conservando calendario original, con límites, importe y mandato aceptados y orden anterior resuelta antes de enviar otra. Cambio ya programado para E conserva su versión aceptada | Si la orden anterior ya fue pagada válidamente, conservar ese período y aplicar el cambio al ciclo siguiente por DEC-044; no doble cargo o cambio retroactivo. Sin deducción posgracia/prorrateo ni permisos del nuevo plan antes de aplicar pago. Caso GRA-19 |
| Q38-D · Cambio de moneda | Con tiempo pagado, cambio explícito al ciclo siguiente; suspendida, al reactivar explícitamente. Usar el tarifario independiente de la moneda elegida, nueva cotización y consentimiento compatible | No conversión automática ni modificación de importes históricos; una moneda/importe por orden. No aprobar nuevas tarifas o convertir la elección del catálogo en disponibilidad bancaria acreditada |
| Q38-E · Recontratación después de baja efectiva | Conservar una deducción pendiente únicamente del mismo episodio de gracia de esa empresa. No deducir si no se concedió gracia o si ya fue compensada; aplicar una sola vez cuando se acepte la nueva contratación | No crear gracia retrospectiva, deuda ni traslado de deducción a otra empresa/identidad. No revive datos purgados o permisos anteriores. Es condición comercial todavía propuesta, distinta de reactivar tras mera suspensión, cuya fórmula ya está aprobada |
| Q38-F · Consentimiento y revocación del medio | Consentimiento afirmativo separado para token y recurrencia, con empresa, importe/divisa, frecuencia, próximas fechas, gracia/baja y medio autorizado; versión, actor, instante y referencia. Renovarlo si importe/divisa/frecuencia sale del mandato. Revocación efectiva bloquea nuevos cargos y conserva tiempo pagado | Sin casilla preseleccionada ni autorización del medio inferida de titular/delegado. Medio nuevo mediante captura alojada. Orden ya enviada se reconcilia: cargo válido anterior/ciclo aplicable conserva tiempo pagado y baja al final; cargo sin autoridad o ciclo caducado queda en revisión, sin período por evento repetido. Q-03/18 fijan condiciones externas exigibles |

La ventana de cotización de 30 minutos, consultas de incertidumbre a 1/5/15 minutos, cola/reconciliación, nombre de permisos y confirmación de fechas son mecanismos candidatos Q-02/Q-31; no se añaden como preguntas comerciales. Aceptar avisos no acepta tarifas del proveedor ni autoriza gasto/cobro. No se reincorporan aumentos de precio, recargos, prorrateos o reembolso ordinario.
### Eventos, idempotencia y reconciliación

**Paquete técnico SUGGESTED — Q-02/DG-PAY:** único responsable de programar cargos, recomendado trabajador Mecanet con token alojado y recurrencia/MIT expresamente habilitada por proveedor; sin programadores simultáneos proveedor+Mecanet. Si combinación no acreditada, Q-03 bloquea esa integración, sin reducir MVP a manual.

1. Orden inmutable por tenant/catálogo/moneda/ciclo o episodio de reactivación; clave de idempotencia estable. Mismo identificador con contenido distinto se rechaza/audita. Unicidad local no sustituye garantía/ventana del proveedor.
2. Resultado por canal auténtico/consulta autoritativa, con coincidencia comercio/orden/importe/moneda/estado. Distinguir autorización/captura/liquidación según contrato. Retorno del navegador no basta; callback sin autenticidad solo sugiere consultar.
3. Persistir pago y aplicación/intención centralmente; trabajador con progreso durable. Sin transacción Mongo abierta durante llamada externa ni transacción distribuida inventada. Preparación fallida no permite reemitir una orden con cargo desconocido.
4. Alta/reactivación: identidad empresarial y período únicos tras readiness; deducción/activación en mismo efecto durable. Dentro gracia conserva ciclo/ancla; período íntegramente caducado pasa a revisión. Reinicio no cobra, duplica empresa ni mueve fechas.
5. Duplicado devuelve resultado; otro cargo a misma orden es hecho financiero distinto, no extensión. Fallo anterior no anula pago posterior válido; reverso es nuevo evento. Serializar cancelación/cambio con reserva de orden para no emitir desde autoridad anterior.
6. Incertidumbre: consultas a 1/5/15 minutos del intento original, luego cola acotada/revisión, sin recobro. Reconciliación diaria con superposición 48 h más todas las órdenes abiertas/conflictivas y liquidaciones. Límites/ventanas por contrato; checkpoint durable, sin búsqueda ilimitada o caducidad que descarte dinero.
7. Restore bloquea egreso de pagos/avisos hasta reconciliar proveedor/autoridad; detectar cargos posteriores a copia, mandatos revocados, bajas y períodos aplicados. Reanudar solo trabajo aún autorizado, sin cobros acumulados o reactivación de sesiones.

No inventar webhook firmado, cancelación API, credenciales, orden de eventos, timestamps, cuotas de consulta o reintentos gratis. Contrato/aceptación deben cubrir respuesta perdida, doble cargo, cambio/baja concurrentes, captura/reverso, cruce de gracia y restore.

## Proveedor y política sin reembolsos

**VENDOR-DOCUMENTATION, consulta 2026-10-08; sin cuenta, sandbox, contacto ni integración.** AZUL fue sugerencia, no obligación. Recomendación principal **SUGGESTED: CardNET condicionada a expediente habilitante** para Edgar, DOP/USD, token recurrente y calendario DEC-042. Documentación separa captura alojada, consultas e idempotencia; no acredita contratación conjunta para este responsable. AZUL queda alternativa comparada, sin elección automática por tarifa pública. Ninguno está verificado de extremo a extremo; no se investigó tercero sin evidencia adicional de adecuación/necesidad.

CUMPLE = función/ruta documentada, no cuenta/integración aprobada; NO CUMPLE = ruta identificada incompatible; NO VERIFICADO = falta evidencia aplicable. Equivalentes: PASS/FAIL/NOT VERIFIED. Resultado contractual completo de ambos: **NOT VERIFIED**.

| Requisito CP-009 §4 | CardNET | AZUL | Evidencia/límite |
|---|---|---|---|
| Admisión persona en RD | CUMPLE ruta personal publicada | CUMPLE ruta con cédula publicada | [CardNET personas](https://www.cardnet.com.do/afiliate/personal), [AZUL requisitos actuales](https://www.azul.com.do/Pages/es/hazte-cliente.aspx). Edgar/SaaS recurrente admitido: NO VERIFICADO ambos |
| Cargo DOP/USD independientes | DOP documentado; USD recurrente NO VERIFICADO | DOP documentado; USD recurrente NO VERIFICADO | [CardNET REST](https://developers.cardnet.com.do/guias/boton-de-pago/web-sin-pantalla-rest.html); [AZUL Página de Pago](https://dev.azul.com.do/Pages/developer/documentos/plugins/Documento-E-Commerce-AZUL-Pagina-Pagos-(Espanol)-2023-08.pdf): MID de una moneda. Campo Currency no acredita ambas monedas |
| Liquidación/bancos DOP/USD | NO VERIFICADO; requiere cuenta receptora | NO VERIFICADO USD; requisitos contemplan cuenta RD$ | Afiliación genérica no define conversiones/plazos/reservas de comercio online. Cargo y abono bancario separados |
| Recurrencia automática real | CUMPLE función publicada | CUMPLE función publicada | [CardNET automáticos](https://www.cardnet.com.do/soluciones/online/pagos-automaticos), [AZUL recurrentes](https://www.azul.com.do/Pages/es/Pagos-Recurrentes.aspx). Mensual/anual exactos habilitados para merchant: NO VERIFICADO |
| Calendario DEC-042 / cambio suspendido | NO VERIFICADO | NO VERIFICADO | Programación genérica no acredita reanclar R+frecuencia−7, cese suspendido ni API de cambio/baja. Requiere contrato de único programador |
| Captura alojada/token sin PAN/CVV Mecanet | CUMPLE checkout alojado/perfil token | CUMPLE Página de Pago/DataVault | [CardNET tokenización](https://developers.cardnet.com.do/guias/tokenizacion-autenticacion/), manual AZUL citado. Token persistente apto para MIT/mandato: NO VERIFICADO; token efímero no basta |
| Consentimiento/revocación/cancelación/cambios | NO VERIFICADO contrato integrado | NO VERIFICADO contrato integrado | [Manual recurrentes CardNET](https://www.cardnet.com.do/static/tutoriales/pagos-recurrentes/manual-pagos-recurrentes-20231221.pdf) muestra gestión de acuerdos; interfaz del proveedor no demuestra API/plazo/mandato |
| Confirmación auténtica/consulta | CUMPLE autenticación/API y consultas documentadas; notificación firmada NO VERIFICADO | CUMPLE AuthHash y consulta documentada; notificación recurrente NO VERIFICADO | CardNET tokenización; manual AZUL/[índice](https://dev.azul.com.do/Pages/developer/pages/lib/index.aspx)/[WebServices SRC-55](https://www.azul.com.do/Pages/developer/documentos/plugins/Documento%20E-commerce%20WebServices%20-%20%28Espa%C3%B1ol%29%202023%20v3.2.pdf). No confiar en campos fuera de autenticación o retorno navegador |
| Duplicados/resultado perdido/reconciliación | Idempotencia/consultas documentadas; garantía de ruta token/MIT NO VERIFICADO | Consulta documentada; idempotencia/unicidad completa NO VERIFICADO | CardNET REST expone clave; tokenización consulta. TTL de claves, consulta tardía y estados exigen contrato en ambos |
| Sandbox/documentación | CUMPLE documentación/QA publicados; acceso y certificación NO VERIFICADO | CUMPLE documentación/pruebas publicadas; acceso y certificación NO VERIFICADO | CardNET REST y manual AZUL. Ejemplos históricos no acreditan versión/credenciales Mecanet |
| Tarifas/mínimos/restricciones | CUMPLE tarifario; paquete/MDR/impuestos/periodicidad final NO VERIFICADO | CUMPLE tarifario; paquete/MDR final/impuestos NO VERIFICADO | [CardNET tarifas](https://www.cardnet.com.do/tarifario), [AZUL tarifas](https://www.azul.com.do/Pages/es/tarifarioAzul.aspx); valores en modelo económico |
| Reversos/disputas vs reembolso comercial | Anulación/devolución documentadas; disputa/plazos/autoridad NO VERIFICADO | Anulación/devolución documentadas; disputa/plazos/autoridad NO VERIFICADO | APIs citadas describen operaciones técnicas, no permiso comercial ni suficiencia legal |
| Rutas incompatibles descartadas | NO CUMPLE captura directa PAN/CVV Mecanet; enlaces/cuotas no sustituyen recurrencia | NO CUMPLE captura directa PAN/CVV Mecanet; DCC/enlaces no sustituyen catálogo USD recurrente | CardNET REST incluye PAN/CVV en ruta directa, se recomienda otra alojada. [DCC AZUL](https://www.azul.com.do/Pages/es/paginaPago/pagina-pagos.aspx) es conversión, no acreditación de tarifa USD independiente |

CardNET pide cédula, estado de cuenta receptora y documento del local; el [PDF de requisitos AZUL2024](https://www.azul.com.do/Pages/es/Content%20section/nuevo-unete/documentos/Requisitos-de-afiliacion-AZUL-31-ENE2024.pdf) contempla cédula/cuenta del titular RD$. No son aprobación de Edgar ni obligación inventada de constituir empresa. Falta contrato combinado suficiente de moneda/recurrencia/calendario: **NOT VERIFIED**, no incapacidad global demostrada. CardNET REST describe recurrencia con credencial archivada; no presumir interoperabilidad entre sus tokens/rutas. Se exige acreditar la combinación alojada que mantiene PAN/CVV fuera de Mecanet. Los documentos AZUL2023/2024 y manual CardNET2023 siguen publicados; consulta actual no actualiza automáticamente sus condiciones privadas.

### Expediente externo mínimo — Q-03

Evidencias localizadas, no otra lista de decisiones. Recomendación condicional no autoriza contacto, claves, afiliación o contrato. Si falla CardNET, AZUL debe satisfacer los mismos requisitos.

| Documento faltante | Contenido exacto | Gate |
|---|---|---|
| Oferta/admisión dirigida a Edgar persona para SaaS RD | Identidad/actividad admitidas, documentos; MID/terminal o equivalente DOP/USD, cargo/liquidación separados, cuentas/bancos/titularidad, conversiones/plazos/reservas/restricciones | Factibilidad Q-03/DG-PAY antes de cerrar diseño; afiliación efectiva antes de operar P6, no ejecución productiva exigida a P0 |
| Oferta económica de paquete completo | Renta y frecuencia, mínimo facturación, MDR por tipo/divisa, token/3DS/cargos aprobados y declinados, recurrencia/consulta/certificación, impuestos/excepciones/cargos no recuperables | Completar G real, Q-23 presupuesto y selección; tarifa pública no es cotización personalizada |
| Contrato técnico captura alojada + token persistente + MIT/recurrencia | Compatibilidad exacta de productos/monedas/frecuencias, consentimiento/revocación/token/mandato, programar/cambiar fechas DEC-042, cancelación, límites/idempotencia, sin PAN/CVV en Mecanet | DG-PAY: requisito no soportado implica proveedor/ruta incompatible; no pasar a manual, quitar USD o cambiar gracia |
| Protocolo confirmación/consulta/reconciliación | Autenticidad/campos cubiertos, identificadores, autorización/captura/liquidación/reverso, timestamps autoritativos/zona, resultado perdido, claves/ventanas/duplicados, consultas/notificaciones/límites reales | Contrato adaptador P0-C; simulación/integración P3. Documento no equivale a prueba |
| Anexo sandbox/certificación y procedimiento financiero | Escenarios/datos autorizados/resultados esperados; baja concurrente, rechazo/timeout/reverso/disputa/cargo duplicado o incorrecto, plazos/evidencia/actor/canal de resolución | Environment Gate antes P3; Q-18/Legal Gate antes publicar/cobrar. No credenciales en planificación |

### Política sin reembolsos y fiscalidad

**CONFIRMED DEC-032:** sin reembolsos comerciales ordinarios. Suficiencia jurídica/compatibilidad contractual **NOT VERIFIED** para ambos. La [Ley 358-05 conservada, SRC-56](https://www.proconsumidor.gob.do/files/Ley_General_de_Proteccin_de_los_Derechos_del_Consumidor_o_Usuario_No__358-05.pdf) orienta protección contractual/información; delimitar aplicación al comprador empresarial exige criterio, no cláusula universal certificada.

**Q-18:** acta/condición RNC y actividad de Edgar, régimen/comprobante y criterio específico Mecanet SaaS+soporte; impuesto desconocido. Resolver catálogo base/total, moneda fiscal, prepago anual/período acortado por gracia y remedios obligatorios. Referencias consolidadas en [PLANNING_STATE](PLANNING_STATE.md); no inferir constitución/exención/tasa o que registro RNC basta. Diseño parametrizado puede avanzar; publicación/cobro de total fiscal/términos definitivos requieren evidencia externa/Legal Gate.

| Hecho | Tratamiento recomendado | Límite |
|---|---|---|
| Baja voluntaria | Conservar tiempo pagado, detener futuros cargos | Sin reembolso ordinario ni precio retroactivo |
| Duplicado/importe incorrecto | Registrar cada cargo, consultar, impedir doble aplicación | No saldo futuro, nueva suscripción o pérdida de exceso inferidos |
| Disputa | Referencia/plazo/evidencia/evolución | No reverso consumado ni suspensión automática |
| Reverso/contracargo confirmado | Evento enlazado, conciliación/revisión derecho/riesgo | No borrar histórico ni permiso ordinario de devolución al operador |
| Prestación fallida / pago ciclo caducado | Reparar o revisión, dinero/tiempo sin servicio visibles | No descarte, servicio pasado ficticio, traslado de oficio o recobro; remedio Q-03/18 |
| Cargo tras baja/revocación | Contrastar orden, mandato/instantes y proveedor | No asumir cancelación bancaria ni período por evento tardío |

Operador DEC-045 ejerce solo facultades aprobadas/auditadas, sin permiso POS ni consentimiento de tarjeta implícitos; remedio monetario necesita procedimiento/autoridad acreditados. Antes de publicar: términos versionados, fiscalidad, mandato y excepciones. **DEC-038/SC-004:** cambio POS inmediato sin saldo futuro, separado de SaaS; no ficha/PIN/cuenta para crédito ni compensación de suscripción. Elegibilidad/recorrido en [SAAS_DISCOVERY](SAAS_DISCOVERY.md).

## Solicitudes externas preparadas — NO ENVIADAS

Borradores CP-010 listos para copiar; sin destinatario inventado, identificaciones, credenciales o anexos privados. Prepararlos no afilia, contrata o autoriza cargos. Se reutiliza el expediente CP-009; no se repite su comparación ni se sustituye la respuesta privada con otra búsqueda pública.

### Mensaje A — CardNET

**Asunto: Factibilidad y documentación para suscripciones Mecanet en DOP/USD**

Hola. Soy Edgar y estoy preparando Mecanet, un SaaS de ventas e inventario para talleres y autopartes de República Dominicana. Actuaría como persona física; aún estamos evaluando la solución de pagos. Necesito respuesta y documentación vigente sobre estos cinco grupos:

1. **Admisión y monedas.** Requisitos para afiliar a una persona en RD en esta actividad; cobro independiente en DOP y USD, distinguiendo monedas de liquidación, cuentas/bancos admitidos, titularidad, conversiones, plazos, reservas y restricciones.
2. **Oferta completa.** Productos necesarios y cargos con su periodicidad: afiliación/renta, mínimos de facturación, comisión por moneda/tarjeta, tokenización, 3DS, recurrencia, transacciones aprobadas/declinadas, certificación, impuestos, reversos y disputas. Indiquen qué conceptos se acumulan o excluyen.
3. **Captura alojada y recurrencia.** Checkout alojado y token reutilizable compatible con cobros automáticos mensuales/anuales iniciados por Mecanet (MIT), sin PAN/CVV en nuestros servidores o registros. Necesitamos consentimiento, revocación y cambios de plan/frecuencia. El calendario debe permitir: vence 10/11/2026, gracia hasta 17/11, reactiva 18/11 y próximo vencimiento 11/12; después ciclos completos desde la nueva fecha. No se cobran meses suspendidos. Confirmen programación de fechas y compatibilidad exacta entre sus productos/APIs.
4. **Confirmación y conciliación.** Autenticación de resultados, consultas autoritativas por referencia, estados de autorización/captura/liquidación/reverso, timestamps, idempotencia/ventanas, duplicados, timeout, confirmaciones tardías, cancelación en vuelo y límites de consulta/notificación.
5. **Sandbox y excepciones.** Documentación/versiones, acceso y criterios de certificación, escenarios de prueba de rechazo/resultado incierto/duplicado/reverso; procedimiento, plazos, pruebas y facultades para disputas o cargos incorrectos. La política comercial sin reembolsos ordinarios debe distinguirse de estas obligaciones.

Agradezco indicar compatibilidad, exclusiones y documentación de respaldo por grupo antes de iniciar una afiliación.

### Mensaje B — Profesional fiscal/contable

**Asunto: Criterio fiscal y documental para Mecanet SaaS en República Dominicana**

Hola. Soy Edgar y estoy preparando Mecanet, un SaaS de ventas, inventario y caja para talleres y autopartes en RD. El responsable comercial sería yo como persona; no damos por acreditada una sociedad ni mi condición fiscal. Necesito un criterio escrito, aplicable y fechado para esta actividad, y saber qué documentación de RNC/actividad/régimen debo aportar.

Estos son los precios comerciales aprobados. DOP y USD son tarifas independientes; el anual equivale a doce mensualidades menos 15% y se cobra completo por adelantado. Aún no se ha determinado si estos importes son base o total con impuestos:

| Plan | DOP mensual | DOP anual | USD mensual | USD anual |
|---|---|---|---|---|
| Esencial | 799.00 | 8,149.80 | 15.00 | 153.00 |
| Negocio | 1,490.00 | 15,198.00 | 29.00 | 295.80 |
| Máxima | 2,490.00 | 25,398.00 | 49.00 | 499.80 |

Solicito precisar impuestos, exenciones o retenciones aplicables; tipo de comprobante/obligaciones electrónicas; presentación legal de precios y total del checkout; moneda y conversión fiscal cuando corresponda. Indique el tratamiento de anticipos anuales, comisiones de pasarela, reversos/cargos incorrectos y períodos de reactivación que descuentan siete días de gracia. Agradeceré distinguir el acceso al software de cualquier soporte que se facture conjuntamente o por separado, sin asumirles el mismo tratamiento.

Necesitamos además categorías concretas de documentos que deban conservarse, su plazo, inicio del cómputo y fundamento; evitar una retención indefinida genérica. La política prevista elimina datos POS 30 días después de la baja efectiva y conserva copias siete días, por lo que debemos identificar las obligaciones documentales específicas que deban exceptuarse.

**Revisión jurídica separada:** alcance de la política sin reembolsos ordinarios, mandato/renovación/cancelación, remedios por servicio no prestado o cobros incorrectos y garantías obligatorias de los negocios usuarios frente a su política de cambios voluntarios. Indique cuáles exceden el criterio fiscal y requieren un profesional jurídico competente; no solicitamos dar por certificada su validez.

## Dependencias de suscripciones para P1-L1 — propuesta sin aplicar

**Análisis CP-010 / SUGGESTED.** Se contrastaron los ocho cortes vigentes de [P1-L1](../tasks/plan.md#primer-lote-de-implementación-preparado--p1-l1-no-iniciado), no se crean otros. Su resultado es identidad→ámbito→catálogo POS ficticio, admisión, observación y restore privado; excluye checkout, cobros y provisión comercial. Los gates publicados en [ROADMAP](../docs/ROADMAP.md) y [PLANNING_STATE](PLANNING_STATE.md) siguen vigentes. Esta tabla no los reubica ni autoriza P1.

| Pendiente | Dependencia real y cortes | Mínimo para el primer lote y trabajo independiente | Hito propuesto donde sí es exigible |
|---|---|---|---|
| Q-03 proveedor/pagos | Ningún corte L1 envía un cobro, guarda un token de tarjeta o interpreta respuesta bancaria. L1.2/4/5 consumen autoridad central y permisos; L1.8 conserva efectos/revocaciones sintéticos, con egreso cerrado | Revisar identidad/empresa/permiso, idempotencia y frontera durable independientes del proveedor. Fixtures expresamente sintéticos; ningún estado inventado se convierte en prueba de un pago real. Permite los ocho cortes privados una vez autorizados sus gates técnicos y entorno | Contrato de captura/token/MIT/monedas/calendario/consulta e idempotencia antes del primer corte que implemente pagos — normalmente DG-PAY previo a P3, antes si se introduce dependencia. Sandbox/condiciones de uso antes de integrar allí. Admisión comercial, liquidación, oferta aceptada y cuenta productiva antes de usar servicio/cobrar, no después del lanzamiento |
| Q-18 fiscalidad/obligaciones | L1.4 lee catálogo ficticio, no calcula una factura SaaS; L1.6 no transmite contenido real y L1.8 restaura solo datos sintéticos. El criterio legal de conservación sigue siendo necesario para datos/documentos reales | Aprobar contrato de tipos monetarios/moneda, separación de campos desconocidos y mecanismos genéricos de retención/revocación sin fijar tasas o excepciones legales. Trabajo independiente: aislamiento, permisos, admisión, redacción y restore sintético | Criterio específico antes de implementar cálculo fiscal, emisión/documento o conservación obligatoria que lo necesite: normalmente P3 SaaS; antes en P2 si una regla POS dependiera de él. Términos y suficiencia jurídica antes de publicarlos/cobrar/operar con datos reales y Legal Gate P6. No diferir toda Q-18 a P6 |
| Q-38 condiciones comerciales | L1.2 comprueba facultad por acción, no consentimiento de una tarjeta; L1.5 admite recursos, no programa avisos/cobros; L1.8 no decide recontratación o calendario de billing | Usar invariantes ya aprobadas: mandato separado de permiso, no acceso nuevo por impago/restore, ningún egreso real. No implantar como definitivas las seis condiciones adicionales de esta sección. Lo demás de L1 es independiente | Aceptar cada condición antes del primer corte que la implemente o publique — normalmente DG-PAY/reglas y UI previos a P3, no esperar al cobro real. Proveedor/reglas de red pueden imponer límites a reintentos/mandatos; resolver el contraste antes de congelar ese diseño |

**Corrección acotada recomendada para aprobación, todavía no aplicada:** acotar la condición de entrada al primer lote mediante una baseline identificable de sus ocho cortes, con dependencias externas residuales y fechas límite explícitas. Mantener el alcance SaaS aprobado y exigir antes de autorizar P1-L1: revisión Q-02/11/31 pertinente al lote, decisiones técnicas necesarias, cierre de su coherencia F14, entorno Q-32 suficiente y autorización Q-36 diferenciada. Las condiciones todavía abiertas no pasan a APPROVED ni quedan implementables por esa aprobación acotada; P3/DG-PAY, reglas fiscales y recorridos comerciales siguen bloqueados hasta sus criterios específicos.

Separación de dependencias: **A, diseño**, permiso/aislamiento/admisión/instantes/rollback del lote antes de implementarlo; **B, entorno**, réplica, dos API, destinos/credenciales sintéticos, recursos y egreso antes de ejecutar/probar; **C, integración externa**, contrato técnico y sandbox antes de cada adaptador dependiente; **D, contratación/cobro/lanzamiento**, cuenta/afiliación/fiscalidad/términos/destino/presupuesto y autorización antes de sus efectos reales. No adelantar uso de proveedor por disponer de un adaptador sintético.

Impacto/riesgo de aceptar esa corrección: se puede invertir en una fundación reutilizable antes de confirmar toda la viabilidad comercial; proveedor incompatible, regla fiscal o condición humana posterior puede exigir retrabajo de pagos/datos. Controles: interfaz sin proveedor supuesto, importes/monedas exactos, mandatos separados, histórico inmutable, egreso denegado y ninguna función comercial expuesta; reabrir diseño afectado si la evidencia cambia una premisa. La ausencia de factibilidad no se oculta como PASS. Sin aprobación expresa de la corrección y de la baseline/autorización, P0 permanece activo y P1 no empieza.

## Demo confirmada — DEC-027

**APPROVED CP-009:** registro/email verificado antes de iniciar; una demo activa por cuenta, máximo tres inicios por cuenta en 24 h; IP como control adicional de abuso, no persona;30 minutos, ficticios precargados/gráficas y hasta 10 ventas/5 cotizaciones/10 ajustes nuevos. Sin traslado de ficticios al negocio real. Tres inicios no es límite vitalicio.

| ID | Regla aprobada | Concreción SUGGESTED |
|---|---|---|
| DEM-01 | Registro y verificación de correo | Identidad reutilizable al contratar; coste/abuso de correo contabilizados |
| DEM-02 | Precarga/gráficas/cuotas 10/5/10 nuevas | Dataset determinista; precarga no consume cuota; sin datos operativos reales |
| DEM-03 | No traslado de ficticios | Matriz negativa denegada también en API |
| DEM-04 | 30 minutos | Inicio tras admisión/preparación, sin expiración deslizante |
| DEM-05 | Una activa y 3 inicios/24 h por cuenta; IP adicional | Ventana/admisión compartida durable; límites globales/productivos todavía por medir |
| DEM-06 | Límites de solicitudes requeridos | Presupuestos por acción/sesión/identidad/IP, perfiles solo de ensayo |
| DEM-07 | Retenciones DEC-049 | Demo≤1 h tras vencer, identidad desvinculada 30 d inactiva, abuso 24 h, copias 7 d. Restore no reactiva ni borra identidad vinculada |
| DEM-08 | Negocio solo tras primer pago, sin ficticios | Reusar identidad/selección revalidada; pago fallido no prorroga demo |

Almacén lógico/credencial separada, dataset, recorridos/copias en [SAAS_DISCOVERY](SAAS_DISCOVERY.md). Retenciones aprobadas; mecanismos técnicos propuestos, objetivos DEC-050 y custodia Edgar DEC-051. No crea servicios ni ejecuta correo/copia.

## Modelo económico recalculable

**CONFIRMED DEC-016 ampliada:** aprovechar Free Tier y financiar operación/crecimiento con suscripciones; no imponer gratuidad perpetua. Free Tier disponible: **REPORTED por usuario**. Modalidad real Oracle/factura, suficiencia de ingresos y capacidad: **NOT VERIFIED**. Contratar, ampliar o gastar: **no autorizado**.

### Condiciones públicas y entradas pendientes

Consulta 2026-10-07: [Oracle Always Free, SRC-50](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) publica A1 1,500 OCPU-h y 9,000 GB-h mensuales; recursos en región principal, compartidos a nivel de cuenta y sujetos a condiciones. Recursos inactivos pueden recuperarse por Oracle. [Free Tier/PAYG, SRC-51](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm) distingue prueba, gratuidad y modalidad pagada. Cambiar modalidad es acción contractual, no consecuencia automática de carga. [Budgets, SRC-52](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm) son límites blandos con avisos evaluados cada 24 h: no impiden cargos. Más carga no aumenta CPU/RAM automáticamente.

Snapshot CP-002 de host compartido 2 CPU/unos 12 GB es histórico, no prueba forma elegible, consumo agregado o factura cero. Sin consulta nueva de cuenta/VPS. Presupuesto real necesita modalidad, región/forma, recursos agregados, consumo facturable, factura y cuotas; oferta pública no acredita disponibilidad para nuevas altas/recuperación.

| Partida | Tipo e imputación propuesta | Entrada y estado |
|---|---|---|
| Web/API/Mongo/trabajador/build | Fijo/escalonado dedicado; incluir reemplazo, QA y herramientas de copia | Coste/demanda, tarifa y límites NOT VERIFIED |
| Host compartido | Coste directo etiquetable + proporción α acordada del coste indivisible; resto compartido/no atribuible | α/coste TO DEFINE. No repartir CPU/RAM para fingir medición tenant; no cargar Nexora por defecto |
| Almacenamiento/índices | GiB-mes atribuible por base; journal/control/espacio libre al pool compartido | Bytes/ventana, índices, crecimiento, precio y saldo gratuito NOT VERIFIED |
| Copias/recuperación | Bytes/tráfico directo cuando atribuible; copia completa, custodia y ensayos al pool Mecanet | Destino B2 recomendado; retención 7 d/frecuencia 30 min/RPO1 h/RTO4 h o 24 h aprobados, consecución NOT VERIFIED; tamaño/compresión/consumo/restore por medir |
| Pasarela | Fijo + comisión sobre cobros + cargo por intento/cobro + excepciones según contrato | Tarifarios públicos abajo; paquete/MDR real, liquidación, conversión y cargos no recuperables pendientes Q-03 |
| Correo | Base + mensajes/entregas facturables; demo/abuso a adquisición | Resend candidato con tarifas públicas; volumen/picos/cuenta/entrega reales NOT VERIFIED |
| Métricas/Sentry | Base + ingestión/retención por ámbito; medir también coste de scraper/logs/cómputo | Sentry Developer DE candidato; región/retención/límite de producto aprobados, cuenta/control efectivo NOT VERIFIED; no ingestión ilimitada |
| Dominio/operación | Renovación prorrateada + horas soporte/administración con valor explícito | Coste y tiempo TO DEFINE; trabajo del titular no desaparece del modelo |
| Demo/picos/recuperación | Coste de adquisición/operación compartido, sin cargar cuotas de pago; reserva de caja aparte | Uso/coste desconocidos y reserva propuesta; no autorización |
| Fiscalidad/excepciones | Importes para terceros fuera de ingreso neto; retenciones/contracargos/prestación fallida ajustan caja | Tratamiento/probabilidad/montos TO DEFINE, sin porcentajes reales inventados |
| Vercel existente | Fuera de hosting objetivo; obligaciones actuales por verificar aparte | No cancelado ni asumido coste cero |

Imputación SUGGESTED: costes directos comprobables primero; pool indivisible de Mecanet repartido por tenant-día de servicio para análisis comercial. Demo/control pertenecen al pool. Reparto contable visible, no medición física. Mostrar contribución directa del tenant y resultado de plataforma con todo el pool; la segunda evita rentabilidad ficticia con pocos clientes. No duplicar backup/byte/factura.

### Entradas públicas y estimación CP-009

Consulta oficial 2026-10-08. Tarifas comprobadas públicamente separadas de **volúmenes hipotéticos** y condiciones de cuenta desconocidas; no cotización aceptada, factura, compra o capacidad verificada. El análisis CP-006 posterior permanece histórico y no usa estas tarifas retroactivamente. Costes DOP/USD separados, sin cambio supuesto; impuestos de proveedores no dados por incluidos.

**Pagos:** [AZUL, actualizado 29-01-2026](https://www.azul.com.do/Pages/es/tarifarioAzul.aspx) publica ecommerce RD$2,500/mes, bóveda RD$1,800/mes; recurrentes plan A RD$5/transacción procesada o B RD$10/declinada, complementaria RD$595 para facturación inferior a RD$300,000; autenticación RD$10/transacción bajo 1,000/mes; MDR hasta 6% según análisis/revisión mensual. Son componentes, no paquete acumulable confirmado. Hipótesis explícita si ecommerce+bóveda fueran ambos necesarios: RD$4,300/mes antes de MDR/otros, sin afirmar que esa combinación sea obligatoria o suficiente.

[CardNET tarifario](https://www.cardnet.com.do/tarifario) publica Pagos Automáticos RD$850, cargo por facturación inferior a RD$350,000 RD$695; tokenización y 3DS RD$7.50 por transacción cada uno; Botón de Pago RD$2,500, activación indicada gratis. No aclara toda periodicidad/acumulación/paquete aplicable/MDR/impuestos; conservar esas incógnitas. Su apartado clientes USD no prueba cobro/liquidación SaaS en USD.

**Copias, candidato B2 EU Amsterdam:** [B2 precios](https://www.backblaze.com/cloud-storage/pricing) USD 6.95/TB/30 d, equivalente 0.00695/GB-mes decimal; primeros 10 GB gratis; [operaciones A/B/C gratuitas](https://www.backblaze.com/cloud-storage/transaction-pricing), clase D especial aparte. Egreso gratis hasta 3×almacenamiento mensual medio, exceso 0.01/GB. [Región](https://www.backblaze.com/docs/cloud-storage-data-regions) y control/custodia propuestos en contrato BK de [ARCHITECTURE_OPTIONS](ARCHITECTURE_OPTIONS.md). No usar tarifa histórica 0.005/GB de tablas auxiliares. Importe mínimo efectivamente cobrado, impuestos y factura de Edgar **NOT VERIFIED**.

Alternativa [R2 Standard](https://developers.cloudflare.com/r2/pricing/): USD 0.015/GB-mes, franquicia 10 GB-mes; A 1 millón/B 10 millones incluidos, exceso A 4.50/millón y B 0.36/millón, redondeo hacia siguiente unidad facturable; egreso/recuperación sin cargo. No contratar dos destinos ni asumir ubicación/jurisdicción por preferencia: comparación/selección sigue Q-08/DEC-052.

Modelo de copias coordinado con BK: S = GB decimales del archivo completo de un punto (datos+oplog+metadatos), sin compresión/deduplicación supuesta. 48 puntos/día; 336 puntos/7 d. Sobre normal conservador V=339×S (336 retenidos + 1 frontera + 1 en curso + 1 huérfano), más journal/temporales externos reales. En 30 d se suben 1440×S; hipótesis de dos restores completos descarga 2×S. Si S cambia, sumar tamaño de cada versión, no multiplicar tamaño final como medida real. Este esquema añade lectura/compresión/cifrado/red/disco al VPS, aún sin medición; crecimiento necesita presupuesto y prueba del RPO/RTO, no rebajar frecuencia/retención para caber gratis.

- B2 almacenamiento =0.00695×max(Vmedio−10,0); egreso =0.01×max(E−3×Vmedio,0). Las dos descargas hipotéticas caben en esa franquicia; no demuestra egreso gratuito del VPS/proveedor origen.
- R2 almacenamiento =0.015×ceil(max(Vpromedio de picos diarios−10,0)); A=4.50×ceil(max(operacionesA−1,000,000,0)/1,000,000); B=0.36×ceil(max(operacionesB−10,000,000,0)/1,000,000). Contar partes multipart/listados/reintentos/deletes según clase; no igualar archivos y llamadas. Egreso R2=0 con condiciones citadas.


Carga/operaciones adicionales **hipotéticas**, según BK: partes multipart de 64 MiB, P=max(1,ceil(S/0.067108864)); aproximadamente A=1440×(P+4) para archivo/manifest/listado y B≈2880 HEAD más GET de restores; deletes de dos objetos por punto≈2880/mes, con reintentos/paginación añadidos. Para S=20 GB, P=299 y A≈436,320 antes de extras, dentro del millón R2; no acredita cuenta real. Journal externo mínimo y sus checkpoints/versiones tienen volumen J y operaciones A_J/B_J/D_J: agregarlos, nunca coste cero supuesto. VPS: 48 lecturas completas/día y 1440×S GB/mes de subidas; espacio temporal candidato 2×S más oplog/índices de restore. Factura de salida Oracle y consumo CPU/RAM/IO sin verificar.

| S hipotético por punto GB | V normal 339S GB | B2 almacenamiento USD/30 d | R2 almacenamiento USD/30 d | B2 con retraso físico+3 d | R2 con retraso físico+1 d |
|---|---|---|---|---|---|
| 0.02 | 6.78 | 0 | 0 | 0 | 0 |
| 0.10 | 33.90 | 0.166105 | 0.360 | 0.266185 | 0.435 |
| 1 | 339 | 2.28655 | 4.935 | 3.28735 | 5.655 |
| 5 | 1,695 | 11.71075 | 25.275 | 16.71475 | 28.875 |
| 20 | 6,780 | 47.0515 | 101.550 | 67.0675 | 115.950 |

Los decimales son estimación analítica, no redondeo de factura. Sensibilidad de retraso físico B2 usa 483S y R2 usa 387S; son escenarios, **no máximos garantizados de eliminación**. La retención de copias de 7 d aprobada no cambia ni se reduce a impedir el acceso; borrado explícito/lifecycle de respaldo debe detectar rezagos. El retraso físico constituye una limitación por resolver, no permiso para ampliar la retención. Tabla excluye journal/temporales reales e impuestos desconocidos, y asume operaciones gratuitas/elegibles; por ello no es coste final ni presupuesto de recuperación. Aun un archivo de 100 MB supera franquicia: comparar solo base activa con 10 GB sería incorrecto.

**Correo recomendado Resend:** [tarifa](https://resend.com/pricing) Free USD 0 hasta 3,000 mensajes/mes y 100/día; 3 dominios y retención 30 d. Pro USD 20/mes hasta 50,000; exceso opcional USD 0.90/1,000, unidad/redondeo final según factura. Cuenta cada destinatario e intentos nuevos facturables, no solo usuarios registrados. Recomendación: sobreuso deshabilitado; si picos/volumen legítimos exceden Free, presupuestar Pro antes de necesitarlo, sin bajar controles ni ascenso automático. [Regiones](https://resend.com/docs/dashboard/domains/regions): candidato envío Virginia para RD; datos/logs/metadatos API en US aun eligiendo otra región de envío, pendiente revisión de privacidad/servicio antes de egreso real. No afirmar residencia UE por escoger Irlanda.

**Sentry recomendado Developer DE:** [precios](https://sentry.io/pricing/) USD 0, un usuario/5,000 errores incluidos; [retención](https://www.sentry.help/en/articles/13964323-how-long-are-errors-events-stored-in-sentry) 30 d; [región UE](https://www.sentry.help/en/articles/13964378-sentry-s-eu-region-faq) Frankfurt para eventos/copias, determinados metadatos de cuenta/organización/integración en US. DEC-014 limita producto a 1,000 eventos/mes depurados; se impone en Mecanet, no equivale a cuota ni corte garantizado del proveedor. Plan público/región no verifica cuenta/configuración; sin replay/cuerpos/contenido de negocio/URL completa. Métricas 24 h detalladas/30 d agregadas DEC-049 siguen coste local medible.

| Escenario de volumen, no demanda prevista | Copia B2 normal / retraso USD | Correo USD/mes | Sentry USD/mes | Subtotal USD conocido bajo hipótesis |
|---|---|---|---|---|
| Inicio: S=0.02 GB; 500 correos/mes y pico≤40/día;≤1,000 errores | 0 /0 | 0 | 0 | 0; resto de partidas sigue desconocido |
| Crecimiento: S=0.1 GB; 2,500 correos y pico≤90/día | 0.166105 /0.266185 | 0 | 0 | 0.166105 /0.266185 |
| Crecimiento: S=1 GB; 5,000 correos o pico legítimo>100/día dentro Pro | 2.28655 /3.28735 | 20 | 0 | 22.28655 /23.28735 |
| Carga alta: S=5 GB; 20,000 correos dentro Pro | 11.71075 /16.71475 | 20 | 0 | 31.71075 /36.71475 |

Un tenant pesado, demos/abuso, reintentos de pago/correo, descargas/exportaciones y ensayos de restore pueden elevar consumo sin más suscripciones. Subtotales no incluyen hosting, operación, dominio, journal, pasarela DOP/USD ni obligaciones: no son margen ni coste total cero. Recomendación B2/Resend/Sentry y presupuesto requieren decisión/evidencia indicadas, sin nueva cuenta o gasto.

### Comparador documental USD del catálogo CP-009

Aplicación aritmética del catálogo aprobado, sin ensayo nuevo, costes o impuestos supuestos. Mezcla 20 = 10 Esencial/8 Negocio/2 Máxima; no previsión de captación. Equivalente anual /12 no es caja mensual disponible ni tratamiento contable aprobado.

| Clientes/modalidad | Cobro inicial USD | Equivalente mensual de servicio USD | Anual pendiente tras primer mes normalizado |
|---|---|---|---|
| 1 Esencial mensual | 15.00 | 15.00 | 0.00 |
| 1 Esencial anual | 153.00 | 12.75 | 140.25 |
| 3:1/1/1 mensuales | 93.00 | 93.00 | 0.00 |
| 3:1/1/1 anuales | 948.60 | 79.05 | 869.55 |
| 20:10/8/2 mensuales | 480.00 | 480.00 | 0.00 |
| 20:10/8/2 anuales | 4,896.00 | 408.00 | 4,488.00 |

Costes denominados en DOP no se restan a USD sin tasa/política acreditadas; precio aprobado no demuestra contribución real. Para período posgracia, registrar cobertura y tiempos efectivos, sin convertir /12 en servicio aún no prestado.
### Fórmulas

Importes por moneda; no sumar DOP+USD sin política/tasa. Modelo de precios aprobado; entradas contractuales desconocidas nulas, no ceros. Tarifas públicas CP-009 no sustituyen oferta real. La sensibilidad CP-006 de abajo sigue histórica.

- R equivalente mensual = Σ clientes mensuales × precio + Σ anuales × total anual / 12. Supone períodos completos, clientes constantes y cobros verificados; no previsión de adquisición.
- Para intervalo real: ingreso analítico = importe de servicio × tiempo servido / duración del período. Precisión exacta y redondeo en presentación/cierre; política contable TO DEFINE. /12 compara, no acredita devengo exacto de un mes calendario.
- F = dedicados + α × host indivisible + pool Mecanet + operación fija. V = Σ consumo atribuible × tarifa + operación variable. Franquicia gratuita se descuenta una vez al agregado elegible, no por tenant.
- G = fijo pasarela + Σ comisión sobre importe procesado + Σ cargos por intento/cobro + excepciones. Comparación anual distribuye comisión del cobro sobre 12 meses; caja paga según contrato.
- Contribución antes de fiscalidad pendiente = R − F − V − G − otros costes/excepciones. Margen porcentual solo con R > 0 y alcance explícito. Saldo después de reserva = contribución − provisión de caja para picos/recuperación; reserva no es automáticamente gasto contable.
- Caja disponible para nuevos compromisos = caja liquidada − obligaciones fiscales/financieras − coste de servir períodos pagados pendientes − reserva aprobada. Anticipo anual no se libera íntegro para ampliar.

### Escenarios con precios aprobados

E/N/M = Esencial/Negocio/Máxima. “Pendiente” representa once meses tras primer mes normalizado; calendario/contabilidad pueden diferir. Sin fiscalidad ni costes.

| Clientes / mezcla | Modalidad | Cobro inicial DOP | Equivalente mensual de servicio DOP | Parte anual pendiente tras primer mes normalizado |
|---|---|---|---|---|
| 1 E | Mensual | 799.00 | 799.00 | 0.00 |
| 1 E | Anual | 8,149.80 | 679.15 | 7,470.65 |
| 3: 1/1/1 | Mensual | 4,779.00 | 4,779.00 | 0.00 |
| 3: 1/1/1 | Anual | 48,745.80 | 4,062.15 | 44,683.65 |
| 20: 10/8/2 | Mensual | 24,890.00 | 24,890.00 | 0.00 |
| 20: 10/8/2 | Anual | 253,878.00 | 21,156.50 | 232,721.50 |
| 20: 5/4/1 mensual + 5/4/1 anual | Combinada | 139,384.00 | 23,023.25 | 116,360.75 |

Ejemplo calendario **experimental**: Esencial 29-02-2028 00:00 -04:00 → 28-02-2029 dura 365 días; al 31-03 han pasado 31. Reparto RD$692.17 servido + RD$7,457.63 restante = RD$8,149.80. /12 sigue siendo RD$679.15 comparativo. Demuestra diferencia de calendario, no aprueba contabilidad/fiscalidad.

### Sensibilidad, no tarifas reales

**HIPÓTESIS exclusivamente experimental:** F RD$3,000/mes: dedicada 1,000; compartido imputado 500; copia/recuperación 400; métricas 100; correo base 0; dominio/operación 1,000. V RD$100/tenant: almacenamiento 20, copias 20, correo 5, métricas 5, operación 50. Pasarela ilustrativa 4% + RD$10/cobro (mensual o anual). Reserva ilustrativa RD$1,000/mes. No son cotizaciones, costes medidos, límites aprobados o tarifas AZUL. Fiscalidad/impagos/excepciones desconocidos quedan fuera de sensibilidad, no valorados como cero real.

| Escenario | R mensual equivalente | G ilustrativo | Contribución antes de fiscalidad pendiente | Saldo después de reserva |
|---|---|---|---|---|
| 1 E mensual | 799.00 | 41.96 | -2,342.96 | -3,342.96 |
| 1 E anual | 679.15 | 28.00 | -2,448.85 | -3,448.85 |
| 3 mixtos mensuales | 4,779.00 | 221.16 | 1,257.84 | 257.84 |
| 3 mixtos anuales | 4,062.15 | 164.99 | 597.16 | -402.84 |
| 20 mixtos mensuales | 24,890.00 | 1,195.60 | 18,694.40 | 17,694.40 |
| 20 mixtos anuales | 21,156.50 | 862.93 | 15,293.57 | 14,293.57 |
| 20 combinados | 23,023.25 | 1,029.26 | 16,993.99 | 15,993.99 |

Redondeo solo de presentación; cargo fijo anual equivale a RD$10/12 por cliente, sin sumar celdas redondeadas. Variando solo comisión: saldo 20 mensuales RD$18,192.20 / 17,694.40 / 17,196.60 con 2% / 4% / 6%; 20 anuales RD$14,716.70 / 14,293.57 / 13,870.44. RD$1,000 adicionales de coste reducen ambos saldos en RD$1,000. Ningún porcentaje representa tarifa consultada.

**Un tenant de carga elevada:** puede ser Esencial aunque tenga pocos productos; reportes, consultas/reintentos/abuso no se deducen de cuatro usuarios. Definir ΔH con incremento medido de almacenamiento/copias/correo/métricas/operación y ampliación necesaria; no atribuir CPU/RAM compartida mediante tiempo HTTP. Con ΔH ilustrativo RD$1,500/mes, saldo 20 mensuales = RD$16,194.40; 20 anuales = RD$12,793.57. Contribución directa Esencial pesado: 799 − 100 − 41.96 − 1,500 = **−RD$842.96 antes del reparto fijo**. Riesgo ilustrativo, no carga observada ni recargo autorizado. Mitigación propuesta: cuotas/admisión/operación MC, sin upgrade/cobro automático.

Los importes y equivalentes están comprobados. Pocos clientes pueden no cubrir estructura y un tenant puede consumir su aportación. **Rentabilidad real NOT VERIFIED:** faltan tarifas, fiscalidad, trabajo, carga/ventanas, demanda, morosidad y excepciones. Un saldo positivo ilustrativo tampoco prueba capacidad de 20 clientes.

### Gasto, reserva y ampliación

**CONFIRMED CP-009:** conocer costes y después aprobar presupuesto; no gasto/reserva autorizados. Se retira el techo propuesto USD 0 del piloto CP-008 como candidato vigente; no era decisión aprobada. Q-23 recibe ahora subtotales/crecimiento por moneda y datos faltantes, sin imponer gratuidad permanente ni omitir protección para conseguirla.

**Recomendación SUGGESTED:** presupuesto mensual B por moneda tras confirmar volumen real, paquete de pagos y restantes costes; avisos al 80% real/proyectado y revisión antes 100%. Gasto adicional solo tras aprobación del presupuesto/cambio y caja disponible; dato desconocido no equivale a cero o ilimitado. Si franquicia no basta, presupuestar el escalón documentado (por ejemplo correo Pro USD 20 y B2 proporcional) manteniendo frecuencia/retención/seguridad. No autorizar compras ni repercutir recargos automáticamente.

Antes de ampliar: cotización total/divisa, cuello medido, efecto en otras apps/recuperación, previsión conservadora de tres meses (anuales distribuidos), reserva y aprobación. Política interna de caja **SUGGESTED**, no aprobada: no gastar como excedente ingreso anual correspondiente a servicio pendiente y reservar además dos meses de costes fijos acreditados, separados de impuestos/obligaciones. Se obtiene de datos reales, no tarifas hipotéticas CP-006; no declara margen disponible ni gasto autorizado. Umbral operativo deriva de MC/capacidad, no de número de empresas.

Si no se acredita capacidad/coste para nuevas altas, frenar admisiones dentro del gate, preservando datos y servicio pagado conforme contrato. No ampliar Oracle/cambiar Free-PAYG/contratar automáticamente. Alerta presupuestaria no es interruptor de facturación. Presupuesto y diseño pueden revisarse con tarifas públicas; cuenta real, factura, entrega de correo, copia/restore y carga se prueban en su fase, no se declaran PASS en P0.

## Evidencia y trazabilidad

### Evidencia conservada de CP-006

Experimento aislado: [prerregistro](experiments/cp006/economy-preregister.md), [script](experiments/cp006/economy-model.cjs) y [resultado](experiments/cp006/economy-results.json), todos **KEEP**. Comando: node --max-old-space-size=64 .agentic/experiments/cp006/economy-model.cjs, con NODE_OPTIONS vacío y límite exterior PowerShell de 10 s. Ejecución 2026-10-07, Node v24.14.0/Windows x64: **23 aserciones PASS**, 2.527 ms de cálculo, 33,308,672 bytes RSS final; no benchmark de producto. Proceso terminado; stderr vacío eliminado por identidad exacta. Sin servicios, DB, dependencias o red durante ensayo.

SHA-256 script: 0fff95183c0f2b418d97a120b741284e2032a62b592fff4a7bc77e101ceba86f. SHA-256 resultado: 4aeac146391b4bad5538ce57fb14ea5c777e15b35652a3625f2ca98fbb2e6969. Tiempos/RSS varían al repetir; comparar valores/invariantes y conservar nueva evidencia por separado. Prueba local monetaria no cambia tested_code_sha del producto.

Lectura focalizada DETECTED 2026-10-07: búsqueda subscription/suscrip/planId/plan_id/AZUL/azul en server.js/config/routes/middleware/models/controllers/services/scripts (sin tests) no encontró implementación del contrato. No equivale a inventario funcional completo. Dockerfile/.dockerignore observados usan rutas permitidas explícitas y excluyen .agentic del artefacto API. Experimento no importado por producto; configuración intacta.

Tabla histórica de CP-006, preservada con sus pendientes de aquel momento; no es la matriz de estado CP-009.

| ID | Criterio | Estado | Evidencia y límite | Gate siguiente |
|---|---|---|---|---|
| SUB-V1 | Catálogo y aprobaciones representados exactamente | PASS | HUMAN-ASSISTED §5/6/7; revisión documental 08, no feature | P0-B: conteo/USD/fiscalidad |
| SUB-V2 | Anuales, mezclas y conservación monetaria | PASS | LOCAL 07, modelo/hashes; 23 aserciones incluyen dinero/calendario | Catálogo/checkout proveedor P3 |
| SUB-V3 | Calendario propuesto sin deriva | PASS | LOCAL 07, ejemplos esperados independientes; política SUGGESTED | Aprobación y pruebas P3 |
| SUB-V4 | Lifecycle/excepciones revisables | PASS | LOCAL documental 08, estados/casos; no prueba de pasarela | Condiciones P0-B / DG-PAY |
| SUB-V5 | Cuenta/contrato AZUL vigente | NOT VERIFIED | SRC-53…55 públicas 07; sin cuenta/contrato | DG-PAY; sandbox antes P3 |
| SUB-V6 | Suficiencia legal/fiscal sin reembolsos | NOT VERIFIED | SRC-56 orienta revisión; no certificación/publicación | Estrategia P0-B; Legal Gate P6 |
| SUB-V7 | Oracle real, coste total, rentabilidad | NOT VERIFIED | SRC-50…52 públicas 07; cuenta/tarifas desconocidas | Presupuesto/DEP-D2 antes de compromisos |
| SUB-V8 | Alta, eventos, restore y downgrade funcionando | NOT VERIFIED | Diseño/casos sin integración ejecutada | COM-01/02 ampliados P3; recuperación P6 |

Entorno experimental LOCAL Windows; fecha de consulta/ensayo 2026-10-07 y revisión documental 08. SHA base fcd93a8 y hashes arriba. VENDOR-DOCUMENTATION no prueba cuenta, contrato, integración o legalidad. CP-001…005 siguen evidencia REPORTED histórica.

### Revisión documental CP-009 y siguiente lote

Fuente HUMAN-ASSISTED 2026-10-08 y VENDOR-DOCUMENTATION de esa fecha; revisión LOCAL documental sobre base 3ec4c1e. CP-009 resuelve conteo/catálogo USD, modo automático, calendario posgracia, baja/cambios/delegación y retenciones, con referencias DEC-018/019/027/041…044/046/049. No mantener Q-01/05/17/19/21/22/24/30 como decisiones humanas abiertas en esos alcances. Proveedor no queda elegido por aprobación del producto; impuestos/cuenta/contrato tampoco quedan acreditados. GRA-01…19 son casos documentales, no aserciones ejecutadas. Las 23 aserciones, resultados/hashes/tablas CP-006 y tested_code_sha histórico permanecen sin reejecutar ni ampliarse.

Registro único en [PLANNING_STATE](PLANNING_STATE.md), sin cuestionario paralelo. Residuales: Q-03 factibilidad/selección condicional y expediente privado; Q-18 fiscalidad/remedios/obligaciones; Q-08 destino B2 candidato; Q-23 presupuesto después de costes. Q-38 concentra avisos/reintentos/consentimiento, cambio de moneda y solicitud nueva de cambio durante gracia propuestos, sin reabrir AUTO/calendario aprobados. Q-02/DG-PAY/DG-TENANT agrupan reloj/anclas técnicas, orden/mandato/deducción durable y reconciliación; Q-31 recorrido de cotización 30 min/fechas/confirmación final sin segundo cobro. Ningún campo o permiso interno origina otra pregunta comercial.

**Revisión propia de coherencia documental:** catálogo humano y anuales contrastados; ejemplos mensual/anual/finmes/bisiesto/frecuencia revisados por lectura; manual/oldplan/ancla rígida retirados como candidatos; deducción inicial inexistente y única por episodio; cancelación/mandato/orden incierta separados; tarifas/volumen/coste real y estado de evidencia distinguidos. Esto no acredita sandbox, legalidad, rentabilidad, corte distribuido, restore o calendario funcionando. Fuentes actuales y casos nuevos se registran como documentación, sin ensayos ni nuevas pruebas de producto. F14 global corresponde al coordinador, no se cierra aquí.

Lote futuro **preparado, no iniciado**: después de gates aplicables P0/P1/P2 y Environment Gate, catálogo/órdenes/mandatos/ledger centrales, adaptador de proveedor, autorización empresarial y trabajador idempotente. Rutas/UI contratar/renovar automáticamente/cancelar/cambiar con incertidumbre/preparación/revisión visibles. Desglose P1-L1 solo en [tasks/plan](../tasks/plan.md). Adaptar conexiones/modelos/auth bajo DEC-012; sin billetera POS/global ni datos demo. Aceptación P3 cubre versión/importe/moneda/tenant/mandato, alta fallida, duplicados/fuera de orden, suspensión larga, GRA-01…19, baja/cambio concurrentes, descenso no destructivo y restore. Reversión conserva dinero/ciclos/episodio/frontera durable, sin relanzar cobros o borrar aplicación. Ni P0/F14, baseline o autorización quedan cerrados por este candidato.

Historia: CP-004/005 contenían dos planes/demo anónima como propuestas. CP-006 incorporó catálogo DOP/anual/demo/activación/no reembolso/lifecycle y economía experimental. CP-007 aprobó siete días DEC-034, dejando calendario/acceso entonces abiertos. CP-008 incorporó DEC-036/037/038/SC-004 y propuso ancla rígida tardía, manual, USD y baja/cambios; su propuesta de calendario no era aprobación. CP-009 concreta lo pendiente mediante nuevas decisiones, sin SPEC CHANGE/ERRATA ficticio: automático, R+frecuencia−7 posgracia y nuevo plan directo sustituyen aquellas propuestas. SC-001…004/SE-001 históricos se conservan.

Impacto inverso vigente: catálogo→cotización/entitlements; mandato/delegación→autorización/avisos/programador; episodio/deducción→calendario/ledger/asOf/restore; baja/cambio→orden concurrente/retención; proveedor→adaptador/monedas/costes; copias/correo/Sentry→presupuesto/operación. P0 EN CURSO; implementación, publicación, cobros, gastos, cuentas, remotos y nuevos servicios no autorizados por este documento.
### Revisión documental CP-010

Sobre base f72bd2393e26eeaf97f6962baf520a71e50e356b, se contrastó el contrato vigente con la petición CP-010: seis condiciones adicionales de Q-38 separadas para decisión, cinco grupos de información CardNET y un mensaje fiscal/contable con el catálogo completo, ambos preparados y no enviados. Recontratación tras baja se conserva expresamente SUGGESTED; no se reabre AUTO/calendario o cancelación aprobados. No se detectó nueva contradicción material entre catálogo, contrato y tarifas reutilizadas: RD$850 CardNET no se transforma en renta mensual/paquete acreditado, RD$4,300 AZUL sigue combinación hipotética y no se suman DOP/USD ni impuestos desconocidos como cero.

El análisis de Q-03/18/38 frente a los ocho cortes L1 diferencia diseño, entorno, integración y operación real; propone una corrección acotada para revisión humana, sin alterar gates canónicos, aprobar baseline o iniciar P1. Fuentes/comparativas/cálculos CP-009 y evidencia CP-006 preservados; no nueva búsqueda, ensayo, QA, servicio, mensaje externo, cuenta, gasto o cambio funcional. Revisión limitada a este documento; Q-02/Q-11/Q-31 completos, entorno, copias y auditoría de ejecución se integran por el coordinador en sus artefactos canónicos.
