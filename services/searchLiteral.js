export const searchLiteral = value => String(value).slice(0, 128).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
