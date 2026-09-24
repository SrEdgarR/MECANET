// Lista explícita de campos: evita guardar contraseñas, tokens y datos internos.
export function auditChanges(before, after, labels) {
  const oldData = before?.toObject ? before.toObject() : (before || {});
  const newData = after?.toObject ? after.toObject() : (after || {});
  return Object.entries(labels).flatMap(([field, fieldLabel]) => {
    const oldValue = oldData[field] ?? null;
    const newValue = newData[field] ?? null;
    return JSON.stringify(oldValue) === JSON.stringify(newValue)
      ? [] : [{ field, fieldLabel, oldValue, newValue }];
  });
}
