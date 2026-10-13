# CP-006 · contrato previo de ensayo de caja y crédito

Registrado antes de ejecutar, 2026-10-07. Fase P0. Experimento local autorizado por la ampliación humana; no implementación del POS.

## CASH-X1 · Caracterización del cálculo existente

- Pregunta: ¿se conservan los centavos al partir una devolución y al rechazar una reserva pendiente anterior? ¿Qué ocurre si el mismo producto aparece en líneas con precios diferentes?
- Resultado que cambia el diseño: una reserva que cambia al rechazar otra obliga a conservar su asignación monetaria; la agrupación por producto obliga a decidir si se devuelve una línea concreta. No se corrige `returnPolicy.js` aquí.
- Código inspeccionado: `services/returnPolicy.js` es puro, sin imports, I/O, entorno o conexiones. SHA-256 previo `0ace4186888395af3abadad7270e41a4f143e81eec479bc4db7a4d0bf8b7676a`, idéntico en HEAD `fcd93a809d907e06e2ce514f71437827c993c74a`.
- Entorno/destinos: Windows, PowerShell, Node 24.14.0; proceso local sin servicios. Solo importa `node:assert/strict` y esa función pura. Datos ficticios embebidos; sin .env, Mongo, Docker, red, correo, pagos ni telemetría. `NODE_OPTIONS` se vacía solo en el proceso de ensayo.
- Recursos/límites: una ejecución con heap máximo 64 MiB; 0…1.001 centavos y 1…6 unidades, todas las particiones ordenadas; límite de tiempo interno 5 s, diagnóstico máximo tres intentos con hipótesis distinta. Salida esperada pequeña por stdout.
- Éxito: conservación secuencial dentro del dominio enumerado y resultados concretos de reservas/líneas observados. Fallo: conservación rota o resultado distinto de la hipótesis; se registra, no se cambia producto ni se debilita la prueba. Aborto: exceder 5 s, imports inesperados o destino externo.

## CASH-X2 · Contraejemplo de cierre y frontera propuesta

- Pregunta: ¿basta comprobar OPEN al iniciar una operación que terminará después del cierre? ¿Qué propiedad adicional elimina esa carrera en un modelo mínimo?
- Resultado que cambia el diseño: si existe intercalado con movimiento posterior al conjunto congelado, todos los escritores deben validar el estado al confirmar y participar en la misma frontera. Una consulta por fecha o un bloqueo exclusivo del cierre no basta.
- Entorno/límites: mismo proceso anterior. Modelo en memoria de una escritura (`read`, `commit`) y un cierre (`freeze`, `snapshot`), seis órdenes válidos. La variante con frontera considera `commit` y `freeze` indivisibles; esa premisa es precisamente lo que deberá demostrar Mongo/QA. No es un controlador alternativo.
- Éxito: enumerar todos los órdenes, conservar el contraejemplo sin frontera y no encontrar miembros omitidos con ella. Fallo: un intercalado válido viola la invariante aun con frontera; revisar propuesta. Aborto: mismos límites de CASH-X1.
- No demuestra: permisos, idempotencia durable, dos procesos reales, Mongo, fallos de red, reinicio, integridad del POS o rendimiento/capacidad del VPS.

## Ejecución, artefactos y conservación

Comando reproducible desde la raíz (no inicia scripts npm):

```powershell
$env:NODE_OPTIONS = ''
node --max-old-space-size=64 .agentic/experiments/cp006/cash-characterization.mjs
```

- KEEP: este contrato, `cash-characterization.mjs` y `cash-result.json`; fixture incluido en el script. El archivo de resultado se conserva tras capturar stdout sanitizado y revisar su contenido.
- DELETE: ninguno. No recursos temporales externos, puertos, procesos persistentes, credenciales ni servicios. El único proceso termina al salir.
- Alcance de publicación: `.agentic/` está excluido por la lista permitida de `.dockerignore`; no es entrada de Vite ni asset del empaquetado existente. No se ejecuta build/publicación ni se modifica configuración. Ningún módulo del producto importará este ensayo.
- El coordinador registrará el hash del script y del resultado junto a la evidencia documental; no se crea un SHA de producto probado nuevo ni se reasignan las 90 pruebas históricas.

Conservación 2026-10-08: cash-result.json se normalizó de CRLF a LF según .gitattributes ya existente, con igualdad de contenido JSON comprobada. Captura original SHA-256 37f6bf21e0d0d9677649adc768ded79773607aa292190c1b3e6721af09f3c734; archivo LF/Git conservado 197d3ac72bd34682d2eced4719595a63e13a49e49385d40ccc67a2cff0a35ec5. No se reejecutó el ensayo ni cambió fecha/resultado/script.
