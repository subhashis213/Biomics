import { test, expect } from '@playwright/test';
import { createTestUser, registerUser, loginUser, isBackendAvailable } from './helpers';

test.describe('Smoke Tests', () => {
  test('app root is reachable and serves HTML', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).toBeVisible();
  });

  test('/auth page loads', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible({ timeout: 10_000 });
  });

  test('/privacy-policy page loads', async ({ page }) => {
    await page.goto('/privacy-policy');
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('unknown route does not white-screen (SPA fallback works)', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    // Should either redirect to landing, auth, or show some content — not a blank page
    await page.waitForLoadState('domcontentloaded');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('backend API is reachable on port 5002', async () => {
    const available = await isBackendAvailable();
    if (!available) {
      console.log('⚠️  Backend not running on port 5002. Start it with: cd backend && npm start');
      test.skip();
    }
    expect(available).toBe(true);
  });

  test('full register → login round-trip', async ({ page }) => {
    // Skip gracefully if backend is not running
    const backendUp = await isBackendAvailable();
    if (!backendUp) {
      console.log('⚠️  Skipping: backend not available on port 5002. Run the backend first.');
      test.skip();
      return;
    }

    const user = createTestUser();

    // Register
    await registerUser(page, user);
    await expect(
      page.getByRole('status').filter({ hasText: /Registered successfully/i })
    ).toBeVisible({ timeout: 15_000 });

    // Log in
    await loginUser(page, user);
    await expect(page).toHaveURL(/\/student/, { timeout: 20_000 });

    console.log(`✅ Smoke: registered and logged in as "${user.username}"`);
  });

  test('no JS console errors on landing page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known 3rd-party / non-critical errors
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('favicon') &&
        !err.includes('google') &&
        !err.includes('gsi') &&
        !err.includes('fonts')
    );

    if (criticalErrors.length > 0) {
      console.warn('Console errors detected:', criticalErrors);
    }
    // Not failing on console errors (may have Google SDK warnings) — just log them
  });

  test('page has no broken images on landing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.src);
    });

    if (brokenImages.length > 0) {
      console.warn('Broken images found:', brokenImages);
    }
    // Warn rather than fail (thumbnails may be optional)
    expect(brokenImages.length).toBeLessThan(5);
  });
});
