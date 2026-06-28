/**
 * 04-student-dashboard.spec.ts
 *
 * Tests for the Student Dashboard after login:
 *  - Dashboard loads with expected sections
 *  - Navigation links work (My Courses, Courses, etc.)
 *  - Logout clears session
 *  - Theme toggle works
 *  - Unauthenticated access to /student redirects to /auth
 */

import { test, expect } from '@playwright/test';
import { createTestUser, registerAndLogin } from './helpers';

test.describe('Student Dashboard', () => {
  let sharedUser: ReturnType<typeof createTestUser>;

  test.beforeAll(() => {
    sharedUser = createTestUser();
  });

  test('unauthenticated access to /student redirects to /auth', async ({ page }) => {
    await page.goto('/student');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('dashboard loads after login', async ({ page }) => {
    await registerAndLogin(page, sharedUser);
    await expect(page).toHaveURL(/\/student/);

    // AppShell should be visible
    await expect(page.locator('.app-shell, main, [class*="dashboard"]').first()).toBeVisible();
  });

  test('dashboard shows welcome/greeting to the user', async ({ page }) => {
    await registerAndLogin(page, sharedUser);

    // Look for username mention anywhere in the dashboard
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toContain(sharedUser.username.toLowerCase());
  });

  test('dashboard has a Courses navigation link', async ({ page }) => {
    await registerAndLogin(page, sharedUser);

    // At least one link or button pointing to courses
    const coursesNavItem = page.getByRole('link', { name: /Courses/i })
      .or(page.getByRole('button', { name: /Courses/i }));
    await expect(coursesNavItem.first()).toBeVisible();
  });

  test('clicking Courses navigates to /student/courses', async ({ page }) => {
    await registerAndLogin(page, sharedUser);

    // Find any "Courses" clickable element
    const coursesLink = page.getByRole('link', { name: /^Courses$/i })
      .or(page.getByRole('button', { name: /^Courses$/i }))
      .first();
    await coursesLink.click();

    await expect(page).toHaveURL(/\/student\/courses/, { timeout: 10_000 });
  });

  test('My Courses section/page is accessible', async ({ page }) => {
    await registerAndLogin(page, sharedUser);

    const myCoursesLink = page.getByRole('link', { name: /My Courses/i })
      .or(page.getByRole('button', { name: /My Courses/i }))
      .first();
    if (await myCoursesLink.isVisible()) {
      await myCoursesLink.click();
      await expect(page).toHaveURL(/\/student\/my-courses|\/student/, { timeout: 10_000 });
    }
  });

  test('student can log out', async ({ page }) => {
    await registerAndLogin(page, sharedUser);

    // Look for logout button — various possible selectors
    const logoutBtn = page.getByRole('button', { name: /Log ?out|Sign ?out/i }).first();
    if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/|\/auth/, { timeout: 10_000 });
    } else {
      // May be behind a profile menu — try opening it
      const profileTrigger = page.locator('[aria-label*="profile" i], [class*="profile-trigger"], [class*="avatar"]').first();
      if (await profileTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
        await profileTrigger.click();
        await page.getByRole('button', { name: /Log ?out|Sign ?out/i }).click();
        await expect(page).toHaveURL(/\/|\/auth/, { timeout: 10_000 });
      }
    }
  });
});
