import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { PlanType } from '@/src/api/payments';
import { readTestSeriesCart, TestSeriesCartItem } from '@/src/utils/testSeriesCart';
import { useAuth } from './AuthContext';

export type CartItem = {
  key: string;
  course: string;
  courseDisplay?: string;
  batch: string;
  moduleName: string;
  label: string;
  planType: PlanType;
  proPriceInPaise: number;
  elitePriceInPaise: number;
  voucherCode?: string;
  appliedPricing?: {
    originalAmountInPaise: number;
    discountInPaise: number;
    finalAmountInPaise: number;
  };
};

type CartContextValue = {
  items: CartItem[];
  testSeriesItems: TestSeriesCartItem[];
  count: number;
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
  setPlan: (key: string, planType: PlanType) => void;
  setVoucher: (key: string, voucherCode: string, pricing?: CartItem['appliedPricing']) => void;
  clearVoucher: (key: string) => void;
  has: (key: string) => boolean;
  clear: () => void;
  subtotalInPaise: number;
  itemPrice: (item: CartItem) => number;
  refreshTestSeriesCart: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(username: string) {
  const safe = (username || 'guest').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `biomics_cart_${safe}`;
}

export function makeCartKey(course: string, batch: string, moduleName: string) {
  return `${course}::${batch}::${moduleName}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { username } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [testSeriesItems, setTestSeriesItems] = useState<TestSeriesCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refreshTestSeriesCart = useCallback(async () => {
    if (!username) {
      setTestSeriesItems([]);
      return;
    }
    setTestSeriesItems(await readTestSeriesCart(username));
  }, [username]);

  useEffect(() => {
    refreshTestSeriesCart();
  }, [refreshTestSeriesCart]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHydrated(false);
      try {
        const raw = await SecureStore.getItemAsync(storageKey(username));
        const parsed = raw ? JSON.parse(raw) : [];
        if (!cancelled) setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  useEffect(() => {
    if (!hydrated) return;
    SecureStore.setItemAsync(storageKey(username), JSON.stringify(items)).catch(() => {});
  }, [items, username, hydrated]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      if (prev.find((i) => i.key === item.key)) return prev.map((i) => (i.key === item.key ? item : i));
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const setPlan = useCallback((key: string, planType: PlanType) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, planType, voucherCode: undefined, appliedPricing: undefined } : i)));
  }, []);

  const setVoucher = useCallback((key: string, voucherCode: string, pricing?: CartItem['appliedPricing']) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, voucherCode, appliedPricing: pricing } : i)));
  }, []);

  const clearVoucher = useCallback((key: string) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, voucherCode: undefined, appliedPricing: undefined } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const has = useCallback((key: string) => items.some((i) => i.key === key), [items]);

  const basePrice = useCallback((item: CartItem) => (item.planType === 'elite' ? item.elitePriceInPaise : item.proPriceInPaise), []);
  const itemPrice = useCallback(
    (item: CartItem) => item.appliedPricing?.finalAmountInPaise ?? basePrice(item),
    [basePrice]
  );

  const subtotalInPaise = useMemo(() => items.reduce((sum, i) => sum + itemPrice(i), 0), [items, itemPrice]);

  const count = items.length + testSeriesItems.length;

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      testSeriesItems,
      count,
      addItem,
      removeItem,
      setPlan,
      setVoucher,
      clearVoucher,
      has,
      clear,
      subtotalInPaise,
      itemPrice,
      refreshTestSeriesCart
    }),
    [items, testSeriesItems, count, addItem, removeItem, setPlan, setVoucher, clearVoucher, has, clear, subtotalInPaise, itemPrice, refreshTestSeriesCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
