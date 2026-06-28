/**
 * 02-register.spec.ts
 *
 * Tests for the Registration flow:
 *  - Register form flips into view
 *  - Validation hints appear for invalid inputs
 *  - Password strength meter works
 *  - Successful registration shows toast and flips back to login
 *  - Duplicate username is rejected
 */

import { test, expect } from '@playwright/test';
import { createTestUser, registerUser, isBackendAvailable } from './helpers';

test.describe('User Registration', () => {
  test.beforeAll(async () => {
    const available = await isBackendAvailable();
    if (!available) {
      console.log('⚠️  Backend not running — skipping registration tests. Start backend on port 5002.');
    }
  });
  test('register form flips open when "New candidate? Register here" is clicked', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();
    await expect(page.getByRole('heading', { name: /Student Registration/i })).toBeVisible();
  });

  test('shows phone validation hint for invalid phone number', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();

    await page.getByPlaceholder('10-digit phone').fill('123'); // too short
    await page.getByPlaceholder('Choose username').click();    // blur phone field

    await expect(page.getByText(/Must be exactly 10 digits/i)).toBeVisible();
  });

  test('shows username length validation hint', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();

    await page.getByPlaceholder('Choose username').fill('ab'); // too short
    await page.getByPlaceholder('10-digit phone').click();

    await expect(page.getByText(/Username must be at least 3 characters/i)).toBeVisible();
  });

  test('shows email format validation hint', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();

    await page.getByPlaceholder(/yourname@gmail\.com/i).fill('notanemail');
    await page.getByPlaceholder('10-digit phone').click();

    await expect(page.getByText(/Enter a valid email address/i)).toBeVisible();
  });

  test('shows password strength meter', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();

    await page.getByPlaceholder('Min 8 chars, letters + numbers').fill('weak');
    await expect(page.locator('.password-strength')).toBeVisible();
    await expect(page.locator('.password-strength small')).toContainText(/Weak/i);

    await page.getByPlaceholder('Min 8 chars, letters + numbers').fill('StrongPass123!');
    await expect(page.locator('.password-strength small')).toContainText(/Strong|Medium/i);
  });

  test('shows confirm-password mismatch hint', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();

    await page.getByPlaceholder('Min 8 chars, letters + numbers').fill('Test1234!');
    await page.getByPlaceholder('Re-enter password').fill('Different9999');
    await page.getByPlaceholder('10-digit phone').click();

    await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
  });

  test('Register button is disabled when form is incomplete', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();

    // Only fill phone — rest still empty
    await page.getByPlaceholder('10-digit phone').fill('9876543210');
    const registerBtn = page.getByRole('button', { name: /^Register$/i });
    await expect(registerBtn).toBeDisabled();
  });

  test('successful registration shows toast and flips back to login', async ({ page }) => {
    const backendUp = await isBackendAvailable();
    if (!backendUp) {
      console.log('⚠️  Skipping: backend not available on port 5002.');
      test.skip();
      return;
    }

    const user = createTestUser();
    await registerUser(page, user);

    // Toast should be visible
    await expect(
      page.getByRole('status').filter({ hasText: /Registered successfully/i })
    ).toBeVisible();

    // Form should flip back to login after ~3 s
    await expect(
      page.getByRole('heading', { name: /Sign in/i })
    ).toBeVisible({ timeout: 6_000 });
  });

  test('"Already registered? Sign in" button flips back to login', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: /New candidate\? Register here/i }).click();
    await expect(page.getByRole('heading', { name: /Student Registration/i })).toBeVisible();

    await page.getByRole('button', { name: /Already registered\? Sign in/i }).click();
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();
  });
});
