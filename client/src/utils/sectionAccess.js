export const hasSection = (user, key) => user?.role === 'desarrollador' || user?.sections?.includes(key);

export const firstAllowedPath = user => {
  const first = user?.sections?.[0];
  return first === 'dashboard' ? '/' : first ? `/${first}` : null;
};
