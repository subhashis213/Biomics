import { requestJson } from './client';

export type PlanType = 'pro' | 'elite';

export type CheckoutTarget = {
  course: string;
  batch?: string;
  moduleName?: string; // 'ALL_MODULES' bundle, a module name, or a batch name for batch checkout
  planType: PlanType;
  voucherCode?: string;
};

export type OrderPricing = {
  batch: string;
  moduleName: string;
  planType: PlanType;
  durationMonths: number;
  originalAmountInPaise: number;
  discountInPaise: number;
  finalAmountInPaise: number;
  voucherCode?: string;
};

export type CreateOrderResponse = {
  unlocked: boolean;
  purchaseRequired: boolean;
  message?: string;
  order?: { id: string; amount: number; currency: string };
  pricing?: OrderPricing;
  razorpayKeyId?: string;
  activeMembership?: { moduleName?: string; planType?: string; expiresAt?: string };
};

export type VerifyResponse = {
  unlocked: boolean;
  message?: string;
  activeMembership?: { moduleName?: string; planType?: string; expiresAt?: string };
};

function body(target: CheckoutTarget) {
  return JSON.stringify({
    course: target.course,
    batch: target.batch || 'General',
    moduleName: target.moduleName || 'ALL_MODULES',
    planType: target.planType,
    voucherCode: target.voucherCode || undefined
  });
}

export function previewOrder(token: string, target: CheckoutTarget) {
  return requestJson<CreateOrderResponse>('/payments/preview-order', {
    method: 'POST',
    token,
    body: body(target)
  });
}

export function createOrder(token: string, target: CheckoutTarget) {
  return requestJson<CreateOrderResponse>('/payments/create-order', {
    method: 'POST',
    token,
    body: body(target)
  });
}

export function verifyPayment(
  token: string,
  payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
) {
  return requestJson<VerifyResponse>('/payments/verify', {
    method: 'POST',
    token,
    body: JSON.stringify(payload)
  });
}

export type StudentVoucher = {
  code: string;
  description?: string;
  discountType: 'percent' | 'flat' | string;
  discountValue: number;
  maxDiscountInPaise?: number;
  validUntil?: string | null;
};

export function fetchStudentVouchers(token: string, course?: string) {
  const qs = course ? `?course=${encodeURIComponent(course)}` : '';
  return requestJson<{ course: string; vouchers: StudentVoucher[] }>(`/payments/vouchers/student${qs}`, { token });
}
