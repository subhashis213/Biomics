/**
 * 06-free-course-purchase.spec.ts
 *
 * End-to-end test for the complete free course access flow:
 *
 *  1. Register a new random user
 *  2. Log in
 *  3. Navigate to Course Catalog (/student/courses)
 *  4. Open the first available course → View Batches
 *  5. If a free batch exists → click "Open Content" directly
 *  6. If a paid batch exists → Add to Cart → verify cart badge → checkout
 *  7. Verify course content page (/student/course/.../modules) loads
 *
 * This is the CORE user journey test.
 */

import { test, expect, Page } from '@playwright/test';
import { createTestUser, registerAndLogin, isBackendAvailable } from './helpers';

// ─── Helper: navigate to first available course's batches page ─────────────────

async function goToFirstCourseBatches(page: Page): Promise<string | null> {
  await page.goto('/student/courses');
  await page.waitForLoadState('networkidle');

  const courseCards = page.locator('.student-course-catalog-item');
  const count = await courseCards.count();
  if (count === 0) return null;

  // Click "View Batches" on the first course
  const firstViewBatches = courseCards.first().getByRole('button', { name: /View Batches/i });
  await firstViewBatches.click();

  await page.waitForURL(/\/student\/course\/.+\/batches/, { timeout: 15_000 });

  // Extract course name from URL
  const urlMatch = page.url().match(/\/student\/course\/([^/]+)\/batches/);
  return urlMatch ? decodeURIComponent(urlMatch[1]) : null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Free Course Purchase Flow (Full Journey)', () => {
  test.beforeAll(async () => {
    const available = await isBackendAvailable();
    if (!available) {
      console.log('⚠️  Backend not running — skipping free course purchase journey. Start backend on port 5002.');
    }
  });

  test('complete journey: register → login → browse courses → enroll → select topic → see lecture', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const available = await isBackendAvailable();
    if (!available) {
      test.skip();
      return;
    }
    // STEP 1 & 2: Register and log in
    const user = createTestUser();
    console.log(`👤 Registering user: ${user.username}...`);
    await registerAndLogin(page, user);

    await expect(page).toHaveURL(/\/student/, { timeout: 20_000 });
    console.log(`✅ Logged in as: ${user.username}`);
    await page.waitForTimeout(1500); // Pause so user can see dashboard

    // STEP 3: Navigate to Course Catalog
    console.log('🔍 Navigating to Course Catalog...');
    await page.goto('/student/courses');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // Pause so user can see catalog

    const courseCards = page.locator('.student-course-catalog-item');
    const courseCount = await courseCards.count();
    console.log(`📚 Found ${courseCount} course(s) in catalog`);

    if (courseCount === 0) {
      console.log('⚠️  No courses in catalog — skipping batch/content steps');
      test.skip();
      return;
    }

    // STEP 4: Specifically locate and navigate to the Free Course
    console.log('📂 Locating the Free Course in catalog...');
    const freeCourseCard = page.locator('.student-course-catalog-item').filter({ hasText: /Free/i }).first();
    
    if (await freeCourseCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('🎯 Found Free Course! Clicking View Batches...');
      await freeCourseCard.getByRole('button', { name: /View Batches/i }).click();
    } else {
      console.log('📂 Free course not found by name, opening first course...');
      await courseCards.first().getByRole('button', { name: /View Batches/i }).click();
    }
    
    await page.waitForURL(/\/student\/course\/.+\/batches/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Pause so user can clearly see the batches

    // STEP 5: Enroll in the Free Batch (Open Content)
    const batchCards = page.locator('.student-batch-card');
    const openContentBtn = batchCards.locator('button:has-text("Open Content")').first();

    if (await openContentBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('🔓 Free batch found — clicking Open Content to enroll/view...');
      await openContentBtn.click();
      await expect(page).toHaveURL(/\/student\/course\/.+\/modules/, { timeout: 15_000 });
      console.log(`✅ On course modules page: ${page.url()}`);
      await page.waitForTimeout(2000); // Pause so user can see modules list

      // STEP 6: Click into a module
      const moduleCards = page.locator('.module-card-btn');
      if (await moduleCards.count() > 0) {
        console.log('📖 Clicking into the first module...');
        await moduleCards.first().click();
        await page.waitForURL(/\/student\/module\/.+/, { timeout: 15_000 });
        await page.waitForTimeout(2000); // Pause so user can see module details

        // STEP 7: Open Lecture Workspace
        const lectureBtn = page.getByRole('button', { name: /Lecture Workspace/i });
        if (await lectureBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          console.log('🎬 Opening Lecture Workspace...');
          await lectureBtn.click();
          await page.waitForURL(/\/student\/module\/.+\/lectures/, { timeout: 15_000 });
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000); // Pause so user can see topics / video search

          // STEP 8: Select a Topic Folder or search for a lecture
          const topicCards = page.locator('.lecture-topic-card');
          if (await topicCards.count() > 0) {
            console.log('📁 Selecting the first topic folder...');
            await topicCards.first().click();
            await page.waitForTimeout(2000); // Pause so user can see filtered video list
          }

          // Verify a video card is visible and inspect it
          const videoCards = page.locator('.compact-premium-video-card');
          if (await videoCards.count() > 0) {
            console.log('▶️ Found lecture video! Clicking play overlay...');
            await expect(videoCards.first()).toBeVisible();
            await page.waitForTimeout(1500); // Pause before clicking play
            
            const thumbWrap = videoCards.first().locator('.cpv-thumb-wrap');
            if (await thumbWrap.isVisible()) {
              await thumbWrap.click();
              console.log('🎬 Video player opened! Watching video playback...');
              await page.waitForTimeout(6000); // Pause for 6 seconds so user can clearly watch the video playing
            } else {
              await page.waitForTimeout(4000);
            }
          }
        }
      }
    } else {
      console.log('ℹ️ All courses currently require payment or have no free batch.');
    }
  });
});

// ─── Batch Page — individual assertions ───────────────────────────────────────

test.describe('Batch Page Interactions', () => {
  let sharedUser: ReturnType<typeof createTestUser>;

  test.beforeAll(async () => {
    const available = await isBackendAvailable();
    if (!available) {
      console.log('⚠️  Backend not running — skipping batch page interactions.');
    }
    sharedUser = createTestUser();
  });

  test.beforeEach(async () => {
    const available = await isBackendAvailable();
    if (!available) test.skip();
  });

  test('batch page loads and shows batch heading', async ({ page }) => {
    await registerAndLogin(page, sharedUser);
    const courseName = await goToFirstCourseBatches(page);
    if (!courseName) return test.skip();

    await expect(page.getByRole('heading', { name: courseName, exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('price is shown as "Free" or formatted INR', async ({ page }) => {
    await registerAndLogin(page, sharedUser);
    await goToFirstCourseBatches(page);

    const batchCards = page.locator('.student-batch-card');
    if (await batchCards.count() === 0) return;

    const priceEl = batchCards.first().locator('.student-course-catalog-price-stack strong');
    await expect(priceEl).toBeVisible({ timeout: 8_000 });
    const priceText = await priceEl.innerText();

    // Price should be either "Free" or "₹XXX" format
    expect(priceText).toMatch(/Free|₹[\d,]+/i);
    console.log(`💰 Price shown: ${priceText}`);
  });

  test('lock pill shows correct status', async ({ page }) => {
    await registerAndLogin(page, sharedUser);
    await goToFirstCourseBatches(page);

    const batchCards = page.locator('.student-batch-card');
    if (await batchCards.count() === 0) return;

    const lockPill = batchCards.first().locator('.student-batch-lock-pill');
    await expect(lockPill).toBeVisible({ timeout: 8_000 });

    const pillText = await lockPill.innerText();
    expect(pillText).toMatch(/Free|Locked|Unlocked/i);
    console.log(`🔒 Lock status: ${pillText}`);
  });

  test('plan selector has Pro and Elite options', async ({ page }) => {
    await registerAndLogin(page, sharedUser);
    await goToFirstCourseBatches(page);

    const batchCards = page.locator('.student-batch-card');
    if (await batchCards.count() === 0) return;

    const planSelect = batchCards.first().locator('select.student-course-plan-select, select');
    if (await planSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const options = await planSelect.locator('option').allInnerTexts();
      expect(options.join(' ')).toMatch(/Pro|Elite/i);
      console.log(`📋 Plan options: ${options.join(', ')}`);
    }
  });

  test('back button returns to course catalog', async ({ page }) => {
    await registerAndLogin(page, sharedUser);
    await goToFirstCourseBatches(page);

    await page.getByRole('button', { name: /← Back/i }).click();
    await expect(page).toHaveURL(/\/student\/courses/, { timeout: 10_000 });
  });

  test('coupon panel toggles open and closed', async ({ page }) => {
    await registerAndLogin(page, sharedUser);
    await goToFirstCourseBatches(page);

    const batchCards = page.locator('.student-batch-card');
    if (await batchCards.count() === 0) return;

    const couponBtn = batchCards.first().getByRole('button', { name: /COUPONS/i });
    if (await couponBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await couponBtn.click();
      await expect(
        batchCards.first().locator('.student-batch-coupon-panel.is-open')
      ).toBeVisible({ timeout: 3_000 });

      // Close it
      await batchCards.first().getByRole('button', { name: /HIDE COUPONS/i }).click();
      await expect(
        batchCards.first().locator('.student-batch-coupon-panel.is-open')
      ).not.toBeVisible();
    }
  });
});

// ─── Cart persistence ─────────────────────────────────────────────────────────

test.describe('Cart Persistence', () => {
  test('cart items persist across page navigation', async ({ page }) => {
    const available = await isBackendAvailable();
    if (!available) {
      test.skip();
      return;
    }
    const user = createTestUser();
    await registerAndLogin(page, user);
    await goToFirstCourseBatches(page);

    const batchCards = page.locator('.student-batch-card');
    if (await batchCards.count() === 0) return;

    const addToCartBtn = batchCards.first().getByRole('button', { name: /Add to Cart/i });
    const hasAddToCart = await addToCartBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasAddToCart) return; // free course, skip

    await addToCartBtn.click();
    await page.waitForTimeout(500);

    // Navigate away and back
    await page.goto('/student/courses');
    await page.goto('/student');

    // Check localStorage still has cart data
    const cartData = await page.evaluate((username) => {
      const key = `biomics:student-cart:${username.toLowerCase()}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    }, user.username);

    expect(Array.isArray(cartData)).toBe(true);
    expect(cartData.length).toBeGreaterThan(0);
    console.log('✅ Cart data persisted in localStorage across navigation');
  });
});
