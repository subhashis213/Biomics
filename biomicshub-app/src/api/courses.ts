import { requestJson } from './client';

export type CatalogPlan = {
  planType?: string;
  type?: string;
  label?: string;
  saleAmountInPaise: number;
  mrpAmountInPaise: number;
  tenureMonths?: number;
  durationMonths?: number;
};

export type CourseCatalogItem = {
  courseName: string;
  displayName?: string;
  description?: string;
  icon?: string;
  thumbnailUrl?: string;
  moduleCount?: number;
  totalQuizzes?: number;
  unlocked?: boolean;
  isEnrolledCourse?: boolean;
  batches?: { name: string; active?: boolean }[];
  plans?: CatalogPlan[];
  featuredPlan?: CatalogPlan | null;
};

export type BatchCatalogItem = {
  batchName: string;
  description?: string;
  moduleCount?: number;
  proPriceInPaise: number;
  elitePriceInPaise: number;
  proMrpInPaise: number;
  eliteMrpInPaise: number;
  thumbnailUrl?: string;
  active?: boolean;
  hasProAccess?: boolean;
  hasEliteAccess?: boolean;
};

export type ModuleCatalogItem = {
  moduleName: string;
  batch: string;
  proPriceInPaise: number;
  elitePriceInPaise: number;
  proMrpInPaise: number;
  eliteMrpInPaise: number;
  proTenureMonths?: number;
  eliteTenureMonths?: number;
  unlocked?: boolean;
  active?: boolean;
};

export function fetchCourseCatalog(token: string) {
  return requestJson<{ courses: CourseCatalogItem[] }>('/payments/catalog', { token });
}

export function fetchCourseBatches(token: string, courseName: string) {
  return requestJson<{ courseName: string; batches: BatchCatalogItem[] }>(
    `/payments/catalog/${encodeURIComponent(courseName)}/batches`,
    { token }
  );
}

export function fetchBatchModules(token: string, courseName: string, batchName: string) {
  return requestJson<{ courseName: string; batchName: string; modules: ModuleCatalogItem[] }>(
    `/payments/catalog/${encodeURIComponent(courseName)}/batches/${encodeURIComponent(batchName)}/modules`,
    { token }
  );
}
