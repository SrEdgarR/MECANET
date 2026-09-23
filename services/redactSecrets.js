const secretField = /pass(word)?|secret|token|authorization|cookie|(?:api|private)[_-]?key|mongo.*uri/i;
export function redactSecrets(value, depth = 0) {
  if (depth > 20) return '[OMITTED]';
  if (typeof value === 'string') {
    return value.replace(/(mongodb(?:\+srv)?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, depth + 1));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const sensitiveChange = typeof value.field === 'string' && secretField.test(value.field);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    secretField.test(key) || (sensitiveChange && ['oldValue', 'newValue', 'before', 'after'].includes(key))
      ? '[REDACTED]' : redactSecrets(item, depth + 1)
  ]));
}
