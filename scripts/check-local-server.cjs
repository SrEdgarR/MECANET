const fs = require('node:fs');
const http = require('node:http');

process.exitCode = 1;

try {
  const envContents = fs.readFileSync('.env', 'utf8');
  const portSetting = envContents.match(/^\s*(?:export\s+)?PORT\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]*))\s*(?:#.*)?$/m);
  const configuredPort = process.env.PORT || portSetting?.[1] || portSetting?.[2] || portSetting?.[3] || 5000;
  const port = Number(configuredPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.exit(1);
  }

  const request = http.get({
    hostname: '127.0.0.1',
    port,
    path: '/api/version',
    timeout: 2000
  }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (response.statusCode === 200 && typeof data.version === 'string') {
          process.stdout.write(String(port));
          process.exitCode = 0;
        }
      } catch {
        process.exitCode = 1;
      }
    });
  });

  request.on('timeout', () => request.destroy());
  request.on('error', () => { process.exitCode = 1; });
} catch {
  process.exit(1);
}
