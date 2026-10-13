# Provenance y representación de la evidencia CP-016

Los JSON y stdout de este directorio conservan sus bytes originales, incluidos terminadores CRLF cuando el arnés Windows los produjo. `.gitattributes` desactiva exclusivamente su conversión de texto; mantiene las comprobaciones de espacios finales y espacios antes de tabuladores, reconociendo CRLF como terminador. La comprobación de los 57 archivos previos contra sus blobs staged acreditó cero diferencias de bytes. No se eliminan líneas de los logs para hacer pasar el gate.

Los hashes de fuentes y manifiestos registrados por los ensayos locales corresponden a bytes del worktree Windows de esa ejecución. Los manifiestos de código siguen la normalización Git LF del proyecto: esos hashes físicos no se presentan como hashes de los blobs Git ni como evidencia Linux. SHA probado local: `0d8285cef117d6174a6053f18ceaac180f8aa1c5`; la ejecución remota y su SHA se registrarán por separado.

Fundamento del tratamiento de texto y whitespace: [documentación oficial de atributos Git](https://git-scm.com/docs/gitattributes) y [configuración oficial de whitespace](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corewhitespace). El ajuste no modifica código funcional, umbrales de seguridad ni los snapshots aprobados.
