/**
 * 03-login.spec.ts
 *
 * Tests for the Login flow (frontend-only — no backend needed for most tests):
 *  - Form renders correctly
 *  - Validation hints work
 *  - OTP tab switching
 *  - Show/hide password
 *  - Forgot Password toggle
 */

import { test, expect } from '@playwright/test';
import { createTestUser, registerAndLogin, isBackendAvailable } from './helpers';

test.describe('Login', () => {
  test('login page renders sign-in form', async ({ page }) => {
    await page.goto('/auth');
    // Wait for the page to fully render
    await page.waitForLoadState('networkidle');

    // The login form is inside the front face of the flip card
    await expect(page.locator('.auth-flip-face-front')).toBeVisible();
    await expect(page.locator('.auth-flip-face-front h2')).toContainText(/Sign in/i);
    await expect(page.getByPlaceholder('Enter username')).toBeVisible();
    await expect(page.locator('.auth-flip-face-front input[placeholder="Enter password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Login$/i })).toBeVisible();
  });

  test('Login button is disabled when fields are empty', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^Login$/i })).toBeDisabled();
  });

  test('shows password length hint when password is too short', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Enter username').fill('testuser');
    await page.locator('.auth-flip-face-front input[placeholder="Enter password"]').fill('ab');
    // Click elsewhere to trigger blur/validation
    await page.getByPlaceholder('Enter username').click();

    // The hint text from AuthPage line 218
    await expect(page.locator('.field-hint').filter({ hasText: /too short|at least 6/i })).toBeVisible();
  });

  test('OTP tab is visible for non-admin users', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Gmail \+ OTP/i })).toBeVisible();
  });

  test('switching to OTP tab shows email input', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Gmail \+ OTP/i }).click();

    // OTP mode shows an email input and a Send OTP button
    await expect(page.locator('.email-otp-block')).toBeVisible();
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Send OTP/i })).toBeVisible();
  });

  test('OTP Send button is disabled for invalid email', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Gmail \+ OTP/i }).click();
    // Fill invalid email
    await page.locator('.email-otp-block input[type="email"]').fill('bademail');

    await expect(page.getByRole('button', { name: /Send OTP/i })).toBeDisabled();
  });

  test('show/hide password toggle works on login form', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('.auth-flip-face-front input[placeholder="Enter password"]');
    await passwordInput.fill('mypassword');

    // Default: hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click Show
    await page.locator('.auth-flip-face-front .toggle-password-btn').click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click Hide
    await page.locator('.auth-flip-face-front .toggle-password-btn').click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('wrong credentials show error message (requires backend)', async ({ page }) => {
    const backendUp = await isBackendAvailable();
    if (!backendUp) {
      console.log('⚠️  Skipping: backend not available on port 5002.');
      test.skip();
      return;
    }

    await page.goto('/auth');
    await page.getByPlaceholder('Enter username').fill('nonexistent_user_xyz_abc');
    await page.getByPlaceholder('Enter password').fill('wrongpass99');
    await page.getByRole('button', { name: /^Login$/i }).click();

    await expect(page.locator('.inline-message.error')).toBeVisible({ timeout: 15_000 });
  });

  test('successful login redirects to /student dashboard (requires backend)', async ({ page }) => {
    const backendUp = await isBackendAvailable();
    if (!backendUp) {
      console.log('⚠️  Skipping: backend not available on port 5002.');
      test.skip();
      return;
    }
    const user = createTestUser();
    await registerAndLogin(page, user);
    await expect(page).toHaveURL(/\/student/);
  });

  test('authenticated user visiting /auth is redirected to /student (requires backend)', async ({ page }) => {
    const backendUp = await isBackendAvailable();
    if (!backendUp) {
      console.log('⚠️  Skipping: backend not available on port 5002.');
      test.skip();
      return;
    }
    const user = createTestUser();
    await registerAndLogin(page, user);
    await page.goto('/auth');
    await expect(page).toHaveURL(/\/student/);
  });

  test('Forgot Password button toggles its label', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const forgotBtn = page.getByRole('button', { name: /Forgot Password\?/i });
    await expect(forgotBtn).toBeVisible();
    await forgotBtn.click();

    // After click the button text changes to "Close Forgot Password"
    await expect(page.getByRole('button', { name: /Close Forgot Password/i })).toBeVisible();
  });
});
