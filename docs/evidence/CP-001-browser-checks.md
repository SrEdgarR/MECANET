# Evidencia de navegador — mapa documental

Fecha: 2026-10-07. Provenance LOCAL, Codex IAB, URL `http://127.0.0.1:4174/docs/project-map/index.html`. Artefacto documental de CP-001, separado del código del POS f5afaa2.

| Comprobación | Resultado observado | Estado / límite |
|---|---|---|
| Estado inicial | P0 EN CURSO, 8 fases, 20 decisiones; no porcentaje calculado | PASS |
| Filtro EN CURSO | Una fase visible, texto «1 fase visible» | PASS |
| Teclado | Tab desde Contraer todas alcanza SUMMARY de P0; foco solid de 3px; Enter expande el detalle | PASS |
| Filtro PROPOSED | Solo DEC-012/013/014/018/019/020 visibles | PASS |
| Reset y expandir | 8 fases visibles/abiertas, 20 decisiones visibles | PASS |
| Escritorio | clientWidth=1265, scrollWidth=1265, sin desbordamiento horizontal de documento | PASS; viewport nominal 1280x720 |
| Móvil | clientWidth=360, scrollWidth=360, 8 fases abiertas | PASS; override nominal 375x812, barra ocupa ancho restante |
| Imágenes | 0 imágenes sin texto alternativo en el mapa | PASS; no sustituye auditoría semántica completa |
| Animaciones | 0 elementos con animationName distinto de none; no transiciones decorativas en fuente | Sin movimiento que desactivar; preferencia del SO no se cambió |
| Consola | Lista de warnings/errors vacía durante verificación | PASS de esta carga |
| Restauración del entorno | Override de viewport eliminado; filtros en Todas, P0 abierto | PASS |

Capturas: [desktop](ui/map-desktop.jpg) y [móvil](ui/map-mobile.jpg). Se revisaron visualmente después de capturarlas. Los detalles siguen accesibles por teclado y las tablas tienen contenedores desplazables con nombre y foco.

Se detectó en la primera comprobación móvil un scrollWidth de 489 con clientWidth de 360. Causa localizada: tamaño mínimo implícito de los elementos details dentro del grid. Se corrigió solo en el visor documental con columnas minmax(0,1fr), min-width:0 y ajuste de texto; se repitió la medición con las ocho fases abiertas y quedó 360/360. No es defecto de la metodología ni del POS productivo.

Limitaciones de herramientas: un selector de nombre accesible exacto falló por concatenación del badge; se usó el summary observado y se verificó Enter. Un binding de navegador no definido se corrigió consultando el navegador existente; no afecta al producto. No se etiqueta un fallo del arnés como fallo del producto.

Límites: esta es revisión focalizada, no certificación WCAG, prueba completa con lector de pantalla, zoom 200% ni matriz de navegadores. Las capturas de la landing/POS actuales se documentan por separado en INVENTORY; su responsive/a11y siguen NOT VERIFIED.
