import * as SecureStore from 'expo-secure-store';

export type TestSeriesSeriesType = 'topic_test' | 'full_mock';

export type TestSeriesCartItem = {
  key: string;
  course: string;
  seriesType: TestSeriesSeriesType;
  label: string;
  priceInPaise: number;
  validityDays: number;
  voucherCode?: string;
  appliedPricing?: {
    originalAmountInPaise: number;
    discountInPaise: number;
    finalAmountInPaise: number;
  };
};

function storageKey(username: string) {
  const safe = (username || 'guest').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `biomics_ts_cart_${safe}`;
}

export function makeTestSeriesCartKey(course: string, seriesType: TestSeriesSeriesType) {
  return `${course.trim().toLowerCase()}::${seriesType}`;
}

export async function readTestSeriesCart(username: string): Promise<TestSeriesCartItem[]> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeTestSeriesCart(username: string, items: TestSeriesCartItem[]) {
  await SecureStore.setItemAsync(storageKey(username), JSON.stringify(items));
}

export async function addTestSeriesCartItem(username: string, item: TestSeriesCartItem) {
  const items = await readTestSeriesCart(username);
  const next = items.some((i) => i.key === item.key) ? items.map((i) => (i.key === item.key ? item : i)) : [...items, item];
  await writeTestSeriesCart(username, next);
  return next;
}

export async function removeTestSeriesCartItem(username: string, key: string) {
  const items = (await readTestSeriesCart(username)).filter((i) => i.key !== key);
  await writeTestSeriesCart(username, items);
  return items;
}

export async function updateTestSeriesCartItem(username: string, key: string, patch: Partial<TestSeriesCartItem>) {
  const items = await readTestSeriesCart(username);
  const next = items.map((i) => (i.key === key ? { ...i, ...patch } : i));
  await writeTestSeriesCart(username, next);
  return next;
}
