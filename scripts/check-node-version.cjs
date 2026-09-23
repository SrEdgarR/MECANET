const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error('MECANET requiere Node.js 22.12 o posterior. Actualice Node.js antes de continuar.');
  process.exitCode = 1;
}
