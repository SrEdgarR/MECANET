# CP-028 — navegador CI e inventario L2

## Alcance y autoridad

Continuación sintética exclusiva de la recuperación CI existente en Linux ARM64 efímero. No publica POS, no toca el VPS y no consume una ventana r03 ni una autorización SC-019. La ejecución real del navegador y PostgreSQL no se realizó localmente: permanece NOT VERIFIED hasta el job coordinado por el responsable principal.

El formulario «Consultar referencia» llama al lector L2 existente por UUID propio, sin reenvío, nueva escritura, nuevo permiso ni endpoint. Es necesario para comprobar un resultado histórico cuyo UUID se conoce después de una recuperación y una sesión nueva. Acepta una referencia válida, normaliza mayúsculas y espacios, relaciona el error con el campo y evita consultas duplicadas mientras espera respuesta o existe una escritura activa.

## RED → GREEN local

- `ui-red.json` y `ui-red.log`: cuatro pruebas nuevas fallaron antes de incorporar el formulario; 59 anteriores pasaron. No se promovió un build fallido.
- `ui-green.json` y `ui-green.log`: lane aislado SC-008, 63 pruebas Vitest PASS (cuatro nuevas), tres de sanitización y cuatro de aislamiento PASS; auditorías completa y runtime con cero hallazgos; bundle y cleanup PASS. Esto no acredita navegador, SQL ni recuperación física.
- SHA-256 del reporte GREEN: `f7673ccc7ad1c4ecf64d9f1a8c76ea308ba4eb6c220fb41796be370d2e6ac7b9`.
- 28 entradas; fingerprint: `4760b7e77903679c3782daf145adfa7a0f601f8458cdef73d1585e670cec62fb`.
- Guardas puras adicionales: cinco PASS, sin importar Playwright ni lanzar Chromium. Cubren origen/rutas cerradas, pin SPKI, cookie antigua exacta, fallo tardío al cerrar y ELF AArch64. La primera invocación de las dos guardas nuevas fue RED por exportaciones inexistentes; su resultado no es una ejecución real del cierre ni de Chromium.

Activos resultantes del GREEN, únicamente de la UI L3/L2 de este worktree:

| Archivo | SHA-256 | Bytes |
| --- | --- | ---: |
| saas.html | `86b9baec728628e6a4703e1fd7308a05e124fb8b8880a897b4b1f02f4ac68fac` | 525 |
| assets/saas-CspqLlcg.js | `cc5462880d62afbbdb9a32584adf85bd543ea8c72e8a6489ef6015087e0809e4` | 184339 |
| assets/saas-mSB78BVf.css | `ad6fe416fc0d157c3b762c9ff580c962178d3ddeb5cc2e5c3af6d516bbe0ca27` | 7470 |

## Recorrido preparado

`tests/integration/ci-browser.mjs` requiere Linux ARM64 en GitHub Actions, dos API del destino recuperado y el root privado exclusivo existente. Verifica ELF64 little-endian e_machine183 en los primeros 20 bytes del ejecutable real antes de iniciarlo. Chromium conserva sandbox y sólo acepta la clave pública SPKI del certificado propio; el hostname sintético resuelve a loopback y no usa proxy.

Todas las solicitudes del navegador se cargan una vez al contador padre de 80; el máximo local de 44 pertenece a ese mismo presupuesto, no es otro permiso. Intercepta y rechaza orígenes y rutas no previstos. En caso de agotamiento no omite B ni amplía el límite. La prueba tiene un límite local de 120 segundos dentro de los 600 del controlador y no utiliza networkidle, sleeps o TTL como prueba positiva.

Recorrido: sesión antigua rechazada → login A → empresa e inventario → UUID histórico exacto → producto nuevo → recepción dos unidades → stock y movimiento → una recarga explícita → UUID histórico → observación SQL de dos operaciones/un movimiento/stock dos → B sin empresas y deep link denegado. El cambio A/B limpia únicamente cookies del contexto del navegador mediante el harness y revalida la ruta existente; **no prueba logout ni revocación de la sesión A**. No introduce un coordinador paralelo.

Comprueba anchos 320/768/1440, ausencia de overflow de página, texto al 200 %, foco por teclado, movimiento reducido y radios cero. Emite dos frames `MECANET_BROWSER_IMAGE` con PNG, hash y base64 del main de inventario sintético, nunca de login ni contraseña. Cada PNG debe ser menor de 1 MiB. Los frames no se suben como artefacto independiente.

El cierre registra cada solicitud hasta `requestfinished` o `requestfailed`, espera completitud, intenta cerrar contexto y proceso incluso ante error, drena las tareas de hash de respuestas tras el ACK y verifica otra vez los contadores definitivos. Sólo entonces puede emitir PASS. Cualquier incertidumbre, error tardío, solicitud activa o incumplimiento conserva FAIL y un reporte censurado en `error.ciBrowserReport`.

## Límites de la evidencia

La revisión independiente del responsable y el job real aún son necesarios. Ninguna prueba local de este directorio demuestra aceptación Oracle/VPS, POS, custodia ARM64 del VPS, restore completo ni L3 TERMINAL. El estado global lo determina el expediente canónico del responsable principal, no este README.
