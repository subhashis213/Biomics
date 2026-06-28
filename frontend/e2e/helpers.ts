/**
 * helpers.ts
 *
 * Shared utilities for BiomicsHub E2E tests.
 * - Random data generators
 * - Auth helpers (register + login)
 * - Reusable navigation helpers
 */

import { Page, expect, request } from '@playwright/test';

// ─── Backend config ────────────────────────────────────────────────────────────

/** Local backend runs on port 5002 */
export const BACKEND_URL = 'http://localhost:5002';

/**
 * Returns true if the backend API is reachable.
 * Tests that require registration/login should call this and skip if false.
 */
export async function isBackendAvailable(): Promise<boolean> {
  try {
    const ctx = await request.newContext({ baseURL: BACKEND_URL });
    const res = await ctx.get('/health', { timeout: 5000 });
    await ctx.dispose();
    return res.ok();
  } catch {
    return false;
  }
}

// ─── Random data generators ───────────────────────────────────────────────────

/** Generate a random 10-digit Indian mobile number (starts with 6-9) */
export function randomPhone(): string {
  const start = String(Math.floor(Math.random() * 4) + 6); // 6,7,8,9
  const rest = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return start + rest;
}

/** Generate a unique username safe for BiomicsHub (≥3 chars, alphanumeric) */
export function randomUsername(): string {
  const adjectives = ['swift', 'bright', 'keen', 'bold', 'sharp'];
  const nouns = ['bio', 'cell', 'gene', 'lab', 'nerd'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}${noun}${num}`;
}

/** Generate a random email */
export function randomEmail(username: string): string {
  return `${username}@testmail.dev`;
}

/** Generate a strong password that satisfies BiomicsHub rules (≥8 chars, letter+digit) */
export function randomPassword(): string {
  return `Test${Math.floor(Math.random() * 9000) + 1000}!`;
}

/** A fixed birth date (far enough in the past) */
export function randomBirthDate(): string {
  const year = Math.floor(Math.random() * 10) + 1990; // 1990–1999
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Test user fixture ─────────────────────────────────────────────────────────

export interface TestUser {
  phone: string;
  username: string;
  email: string;
  password: string;
  birthDate: string;
  city: string;
  course: string;
}

export function createTestUser(): TestUser {
  const username = randomUsername();
  return {
    phone: randomPhone(),
    username,
    email: randomEmail(username),
    password: randomPassword(),
    birthDate: randomBirthDate(),
    city: 'Bhubaneswar',
    course: 'IIT-JAM',
  };
}

// ─── Auth helpers ──────────────────────────────────────────────────────────────

/** Navigate to /auth and register a brand-new user.
 *  Returns when the success toast "Registered successfully" is visible.
 */
export async function registerUser(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth');

  // Click "New candidate? Register here"
  await page.getByRole('button', { name: /New candidate\? Register here/i }).click();

  // Wait for the registration form to flip into view
  await expect(page.getByRole('heading', { name: /Student Registration/i })).toBeVisible();

  // Fill registration form
  await page.getByPlaceholder('10-digit phone').fill(user.phone);
  await page.getByPlaceholder('Choose username').fill(user.username);
  await page.getByPlaceholder(/yourname@gmail\.com/i).fill(user.email);

  // Select course
  await page.getByRole('combobox').selectOption(user.course);

  await page.getByPlaceholder('Enter city').fill(user.city);

  // Birth date
  await page.locator('input[type="date"]').first().fill(user.birthDate);

  // Password
  await page.getByPlaceholder('Min 8 chars, letters + numbers').fill(user.password);
  await page.getByPlaceholder('Re-enter password').fill(user.password);

  // Submit
  await page.getByRole('button', { name: /^Register$/i }).click();

  // Wait for either: success toast OR an error message
  const successToast = page.getByRole('status').filter({ hasText: /Registered successfully/i });
  const errorMsg = page.locator('.inline-message.error, p.inline-message');

  // Race between success and error
  await Promise.race([
    expect(successToast).toBeVisible({ timeout: 20_000 }),
    expect(errorMsg).toBeVisible({ timeout: 20_000 }),
  ]).catch(() => {});

  // If an error appeared, throw with its message
  if (await errorMsg.isVisible().catch(() => false)) {
    const errText = await errorMsg.innerText().catch(() => 'Registration failed');
    throw new Error(`Registration failed: ${errText}`);
  }

  // Success toast must be visible
  await expect(successToast).toBeVisible({ timeout: 5_000 });
}

/** Log in with username + password.
 *  Returns when redirected to /student.
 */
export async function loginUser(page: Page, user: Pick<TestUser, 'username' | 'password'>): Promise<void> {
  await page.goto('/auth');

  // Ensure "Username + Password" tab is selected
  await page.getByRole('button', { name: /Username \+ Password/i }).click();

  await page.getByPlaceholder('Enter username').fill(user.username);
  await page.locator('.auth-flip-face-front input[placeholder="Enter password"]').fill(user.password);

  await page.getByRole('button', { name: /^Login$/i }).click();

  // Should land on student dashboard
  await page.waitForURL('**/student', { timeout: 20_000 });
  await expect(page).toHaveURL(/\/student/);
}

/** Register then immediately log in.
 *  Convenience wrapper used by most tests.
 */
export async function registerAndLogin(page: Page, user: TestUser): Promise<void> {
  await registerUser(page, user);
  await loginUser(page, user);
}
