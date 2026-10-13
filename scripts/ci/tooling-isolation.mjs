// A regression barrier for P1-L1 tooling, not a dependency audit exception.
// Vite contains bundled copies: this barrier cannot inspect their internal calls.
import { registerHooks } from 'node:module';
import { realpathSync } from 'node:fs';
import { relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const guardedRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));

export const blockedPackages = Object.freeze([
  'braces', 'chokidar', 'fast-glob', 'micromatch',
  'postcss-nested', 'postcss-selector-parser', 'tailwindcss',
]);
const blocked = new Set(blockedPackages);
export const marker = Symbol.for('mecanet.p1-l1.tooling-isolation');

export function blockedPackage(value) {
  let path = String(value).replaceAll('\\', '/');
  try { path = decodeURIComponent(path); } catch { /* Match undecoded text too. */ }
  // A package specifier or a resolved node_modules path (including nested deps).
  if (blocked.has(path.split('/')[0])) return path.split('/')[0];
  const segments = path.split('/');
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] === 'node_modules' && blocked.has(segments[index + 1])) {
      return segments[index + 1];
    }
  }
  return null;
}

function reject(value) {
  const name = blockedPackage(value);
  if (name) {
    const error = new Error(`P1-L1 must not load legacy tooling: ${name}`);
    error.code = 'ERR_P1_L1_TOOLING_ISOLATION';
    throw error;
  }
  if (String(value).startsWith('file:')) {
    const resolved = fileURLToPath(value);
    if (resolved.replaceAll('\\', '/').split('/').includes('node_modules')) {
      const path = relative(guardedRoot, realpathSync(resolved));
      if (path === '..' || path.startsWith('..\\') || path.startsWith('../') || isAbsolute(path)) {
        const error = new Error('P1-L1 tooling must not fall back to dependencies outside its source root');
        error.code = 'ERR_P1_L1_TOOLING_FALLBACK';
        throw error;
      }
    }
  }
}

if (!globalThis[marker]) {
  if (typeof registerHooks !== 'function') throw new Error('NODE_MODULE_HOOKS_REQUIRED');
  registerHooks({
    resolve(specifier, context, nextResolve) {
      reject(specifier);
      const resolved = nextResolve(specifier, context);
      reject(resolved.url);
      return resolved;
    },
    load(url, context, nextLoad) {
      reject(url);
      return nextLoad(url, context);
    },
  });
  Object.defineProperty(globalThis, marker, { value: true, writable: false, configurable: false });
}
