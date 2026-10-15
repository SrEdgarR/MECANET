# CP-023 — pruebas funcionales de desarrollo antes de aceptación objetivo

2026-10-15. Fuente: instrucción humana directa CP-023. **CONFIRMED / autorizado:** ensayos PostgreSQL reales fuera del VPS, correcciones dentro de B vigente y publicación segura de una rama/PR borrador exclusivamente CI. No merge, P2, producción, recursos compartidos, reinicio r03, r04 o cambios de cotas/ventanas QA objetivo. Esta estrategia no aprueba otra baseline funcional ni elimina salidas L3.

## Plan acotado y entorno

Base canónica comprobada en GitHub:86985fe7589032f202ebf0cb057a9b1384217151. Entrada local685a09fa5b3167322ebd3c3deb6a13bfe9e790be/codex/p1-l3 limpia. Continuar worktree aislado existente; preservar primary/kilo y evidencia anterior.

Docker y PostgreSQL no instalados; WSL confirma subsistema no instalado. Se selecciona PostgreSQL18.6 portable Windowsx64, sin servicio/instalador/cambios al sistema. Archivo oficial EDB18.6-5 SHA256e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2 coincide checksum del proveedor en https://github.com/EnterpriseDB/edb-installers/issues/733. Binarios sin Authenticode; no se presenta la firma como verificada. Origen https://www.postgresql.org/download/windows/ → EDB; descarga HTTPS, archivo e inventario comprobados.

Cluster exclusivo `.qa-private/cp023-development/source`, ACL usuario actual, marker/puerto/system identifier positivos. Sólo127.0.0.1, puerto15432 libre antes START, TLS CA propia/servername localhost, bootstrap nuevo y contraseñas aleatorias separadas. Nunca cargar `.env`, URI externa o secretos existentes. Configuración privada por argumento explícito; sin fallback ambiental de credenciales. fsync/full_page_writes/synchronous_commit ON, scram, max_connections60; pools acotados. No Docker/VPS, builds o carga externa. No se atribuyen límites cgroup a un proceso nativo Windows.

## Orden de verificación

1. Preflight binarios/puerto/directorio nuevos; initdb y consulta positiva de versión/data_directory/system identifier antes DDL.
2. SQL001…006 productivo, roles reales, fixture enteramente sintético, productos/recepciones/idempotencia y gates/restricciones.
3. Dos API, login nuevo, historial propio, creación/recepción/replay/stock/movimientos y negativas.
4. Copia física verificable/destino independiente, origen detenido; guardas/CAS/restricciones/credenciales nuevas y fallos. Reutilizar mecanismos existentes; declarar por separado subpropiedades no ejecutables en Windows y cubrirlas en Linux CI cuando sea viable, sin simular durabilidad POSIX.
5. Ampliar sólo pruebas afectadas/negativas nuevas; no repetir las415/395 locales sin cambio material. Retener FAIL con fuente y RED→fix→GREEN.

Cada invocación de desarrollo usa timeout finito, consultas contadas y datos propios. No reasigna casos, tiempo o cargos r03; sus135 casos/45s/1800s y demás límites permanecen intactos. No convertir un timeout de desarrollo en aceptación de QA objetivo.

## CI, aborto y cleanup

Antes de publicar: workflows/hooks/integraciones conocidos sin deploy, cuenta/repo exactos, runner estándar público sin gasto nuevo, sin secrets/productive/env/VPS. Checkout por SHA sin credenciales persistidas; dependencias locked, configuración temporal local y PostgreSQL18. PR únicamente borrador; jamás merge por PASS desarrollo. No artifacts/cache facturables o dumps privados publicados; resultados sanitizados en logs.

Fallo o identidad incierta: conservar evidencia y detener sólo PID/cluster propios acreditados. No borrar/reutilizar automáticamente data incierta. Cleanup final: parar API/clock/PG propios, verificar fin positivo y puerto cerrado; conservar metadatos/FAIL sanitizados, retirar credenciales temporales sólo tras cierre acreditado y con destino absoluto validado. Ningún proceso ajeno se termina.

Frentes independientes: A Node/SQL/HTTP/restore y CI; B diagnóstico/reentrada sin efectos VPS; C baseline POS y propuesta de orden sin código P2. Ownership por archivos; revisión cruzada antes de integrar. Salida: subpropiedades de desarrollo por versión/entorno, matriz L3 conservadora y §27, no TERMINAL por extrapolación.
