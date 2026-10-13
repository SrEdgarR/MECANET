# Feedback de la metodología

Prompt aplicado: v2.0, hash registrado en `docs/README.md`. El original y su copia se conservan sin cambios. Estos hallazgos no modifican la metodología ni son decisiones aprobadas.

## AUD-001 — Alcance del readiness al adoptar producción existente

- Fecha/estado: 2026-10-07 / PROPOSED, pendiente de revisión por usuario/auditor.
- Contexto: Mecanet ya tiene una versión de un negocio publicada y un objetivo SaaS nuevo sin aislamiento ni pagos.
- Problema de proceso: los nombres de readiness globales pueden interpretarse como referidos al producto desplegado o a la futura versión; la metodología no exige un campo formal `scope` en cada gate.
- Riesgo: que el login legado validado se lea como READY FOR PRODUCTION del SaaS, o que la falta de SaaS invalide retroactivamente evidencia válida del despliegue anterior.
- Regla propuesta: cada matriz de readiness identifica capacidad/release, entorno y baseline; no hereda PASS de otro alcance.
- Ejemplo aplicado sin cambiar el Prompt: el mapa distingue «producto actual» de «SaaS objetivo» y su readiness es exclusivamente SaaS.
- Límite: es una aclaración propuesta; §2.5 y §9 ya exigen distinguir evidencia. No se presenta como contradicción resuelta ni como cambio adoptado.

## AUD-002 — Mapa durante planificación sin baseline aprobada

- Fecha/estado: 2026-10-07 / PROPOSED, pendiente de revisión por usuario/auditor.
- Contexto: §6 exige el mapa tras inventario, mientras F14 reserva la baseline definitiva para el cierre de planificación.
- Problema de proceso: el mapa necesita ROADMAP/DECISIONS antes de que exista una especificación final; falta una convención explícita para el estado provisional de esos documentos protegidos.
- Riesgo: confundir publicar un roadmap preliminar en el expediente con aprobar su alcance o habilitar código.
- Regla propuesta: permitir registro de decisiones aprobadas y roadmap PROPOSED durante levantamiento, con autoridad explícita y gates no aprobados; materializar el resto de specs al cierre.
- Ejemplo aplicado: ROADMAP marca P0 como único trabajo autorizado y P1–P7 como propuesta; la vista no presenta porcentaje global.
- Límite: se sigue v2.0 usando SUGGESTED/TO DEFINE y el estado de planificación; no se ha editado ni reinterpretado silenciosamente la baseline.

## Separación de hallazgos

`docs/` ignorado por Git, modelos globales, métricas incompletas y documentación antigua son hallazgos del proyecto/deuda. Las páginas Sentry inaccesibles al lector web son una limitación de herramienta. No se registran como defectos del Prompt.

## AUD-003 — Alcance del control plane en un host compartido

- Fecha/estado: 2026-10-12 / PROPOSED, revisión posterior de usuario/auditor.
- Contexto: §15.3 exige «Si el entorno usa Coolify/Kubernetes/Terraform/etc. como control plane, úsalo como vía canónica». El usuario aprueba ahora Mecanet independiente junto a recursos de Coolify.
- Problema: entorno puede significar host físico o aplicación; imponer un único gestor por host contradice la posibilidad de ámbitos de propiedad independientes. §29 también menciona Coolify/control plane como vía canónica sin delimitar ámbito.
- Riesgo: bloquear una decisión humana válida o registrar/alterar recursos ajenos para satisfacer una regla genérica.
- Regla propuesta: declarar control plane por recurso/aplicación y propietario, con integración compartida separada y autorización específica; nunca permitir dos gestores sobre el mismo recurso sin contrato explícito.
- Aplicación actual: prevalece SC-005 humano; Mecanet propio, Coolify administra exclusivamente sus recursos. El proxy puede integrarse solo con permiso específico; no se modifica el Prompt.
- Límite: feedback no consolidado como versión nueva, sin excepción de seguridad ni permiso de alterar kernel/redes/proxy compartidos.
