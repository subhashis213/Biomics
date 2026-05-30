export function formatInrFromPaise(paise?: number | null) {
  const amount = Number(paise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

export function decodeRouteParam(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  return decodeURIComponent(String(raw || '').trim());
}
