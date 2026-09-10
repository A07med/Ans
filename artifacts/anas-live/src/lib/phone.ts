export function normalizeOmanPhone(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, '');
  const local = digits.startsWith('968') ? digits.slice(3) : digits;
  if (!/^[79]\d{7}$/.test(local)) return null;
  return `+968${local}`;
}

export function validateDisplayName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length >= 2 && normalized.length <= 80 ? normalized : null;
}
