/**
 * 01-landing.spec.ts
 *
 * Tests for the public Landing Page:
 *  - Page loads with key sections
 *  - Navigation links scroll correctly
 *  - CTA buttons navigate to /auth
 *  - Google Play Store badge links to the correct URL
 *  - Scroll-to-top button appears after scrolling
 */

import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load with correct page title and hero headline', async ({ page }) => {
    await expect(page).toHaveTitle(/Biomics/i);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Master Biology/i);
  });

  test('should display navbar brand', async ({ page }) => {
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await expect(page.locator('.lp-nav-name')).toHaveText('Biomics Hub');
  });

  test('hero "Start Learning" CTA navigates to /auth', async ({ page }) => {
    await page.getByRole('button', { name: /Start Learning/i }).click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('hero "See What\'s Inside" link scrolls to features section', async ({ page }) => {
    await page.getByRole('link', { name: /See What's Inside/i }).click();
    // Features section should be in viewport
    await expect(page.locator('#features')).toBeInViewport({ timeout: 5000 });
  });

  test('navbar "Courses" link scrolls to courses section', async ({ page }) => {
    await page.getByRole('link', { name: 'Courses' }).first().click();
    await expect(page.locator('#courses')).toBeInViewport({ timeout: 5000 });
  });

  test('stats section is visible on scroll', async ({ page }) => {
    await page.locator('.lp-stats').scrollIntoViewIfNeeded();
    await expect(page.locator('.lp-stats')).toBeVisible();
  });

  test('course slideshow renders slides', async ({ page }) => {
    await page.locator('.lp-slideshow').scrollIntoViewIfNeeded();
    await expect(page.locator('.lp-slide').first()).toBeVisible();
  });

  test('slideshow next/prev arrows work', async ({ page }) => {
    await page.locator('.lp-slideshow').scrollIntoViewIfNeeded();
    const nextBtn = page.getByRole('button', { name: /Next course/i });
    const prevBtn = page.getByRole('button', { name: /Previous course/i });
    await expect(nextBtn).toBeVisible();
    await expect(prevBtn).toBeVisible();
    await nextBtn.click();
    await prevBtn.click();
  });

  test('features section renders feature cards', async ({ page }) => {
    await page.locator('#features').scrollIntoViewIfNeeded();
    await expect(page.locator('.lp-feature-card').first()).toBeVisible();
  });

  test('testimonials section renders student voice cards', async ({ page }) => {
    await page.locator('.lp-voices-marquee-wrap').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.lp-voice-card').first()).toBeVisible();
  });

  test('community social links are present', async ({ page }) => {
    await page.locator('#community').scrollIntoViewIfNeeded();
    const socialCards = page.locator('.lp-social-card');
    await expect(socialCards).toHaveCount(4);
  });

  test('footer renders brand name and about text', async ({ page }) => {
    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect(page.locator('.lp-footer-name')).toHaveText('Biomics Hub');
    await expect(page.locator('.lp-footer-about')).toBeVisible();
  });

  test('footer Google Play badge links to BiomicsHub app', async ({ page }) => {
    await page.locator('footer').scrollIntoViewIfNeeded();
    const playBadge = page.locator('.lp-store-badge--googleplay');
    await expect(playBadge).toBeVisible();
    await expect(playBadge).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.biomicshub.app'
    );
  });

  test('footer App Store badge links to Apple App Store', async ({ page }) => {
    await page.locator('footer').scrollIntoViewIfNeeded();
    const appStoreBadge = page.locator('.lp-store-badge--appstore');
    await expect(appStoreBadge).toBeVisible();
    await expect(appStoreBadge).toHaveAttribute('href', /apple\.com\/app-store|apps\.apple\.com/i);
  });

  test('footer privacy policy link navigates correctly', async ({ page }) => {
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.locator('.lp-footer-bottom').getByRole('button', { name: /Privacy Policy/i }).click();
    await expect(page).toHaveURL(/\/privacy-policy/);
  });

  test('CTA banner "Create Free Account" navigates to /auth', async ({ page }) => {
    await page.locator('.lp-cta').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /Create Free Account/i }).click();
    await expect(page).toHaveURL(/\/auth/);
  });
});
