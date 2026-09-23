import dns from 'node:dns';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import fetch from 'node-fetch';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

// Validar y utilizar la misma resolución evita una segunda consulta DNS sin control.
const agent = new https.Agent({
  lookup(hostname, options, callback) {
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
        return callback(new Error('Destino de imagen no permitido'));
      }
      const allowed = addresses.filter(item => !options.family || item.family === options.family);
      if (!allowed.length) return callback(new Error('Destino de imagen no disponible'));
      if (options.all) callback(null, allowed);
      else callback(null, allowed[0].address, allowed[0].family);
    });
  }
});

export async function fetchPublicImage(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('URL inválida');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      (url.port && url.port !== '443') || isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw new Error('Solo se permiten imágenes HTTPS de servidores públicos');
  }
  const response = await fetch(url, {
    agent, redirect: 'error', signal: AbortSignal.timeout(8000), size: 2 * 1024 * 1024
  });
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok || !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(type)) {
    response.body?.destroy();
    throw new Error('Formato de imagen no permitido');
  }
  return { type, data: Buffer.from(await response.arrayBuffer()) };
}
