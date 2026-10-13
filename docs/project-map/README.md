# Mapa de progreso local

No es parte del producto ni se publica en Vercel/Coolify. Los estados se mantienen en los documentos canónicos, no en HTML/JSON generados.

Actualizar tras un hito:

```powershell
node docs/project-map/build.mjs
node docs/project-map/build.mjs --check
```

Abrir `docs/project-map/index.html` como archivo local o usar la vista de documentación:

```powershell
node docs/project-map/serve.mjs
```

Visitar `http://127.0.0.1:4174/docs/project-map/index.html`. El servidor escucha solo en loopback y sirve únicamente extensiones documentales dentro de docs, .agentic y tasks, más el archivo canónico DEPLOYMENT.md enlazado desde el inventario. No ejecuta backend, no expone .env y no se conecta a MongoDB. Detener con Ctrl+C cuando termine la revisión.

Fuentes: PROJECT_STATE, ROADMAP, DECISIONS, TECH_DEBT, CHECKPOINTS, PLANNING_STATE y METHODOLOGY_FEEDBACK. `build.mjs` genera PROJECT_MAP_DATA.json y la vista con el mismo objeto; registra hashes de las fuentes y valida estados/fase activa. `--check` falla si los resultados están desactualizados.

`template.html` contiene presentación e interacción, sin datos escritos manualmente. Preview real del producto en docs/evidence/ui, con sus límites de verificación. No se incluyen credenciales ni datos de clientes reales.
