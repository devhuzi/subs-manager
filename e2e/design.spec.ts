import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

const MOBILE = { width: 390, height: 844 }; // iPhone 14-ish
const DESKTOP = { width: 1366, height: 900 };

/** Navigate and wait for the dashboard to finish loading + animating. */
async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Monthly cost', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(900); // count-ups + charts settle
}

const shot = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Bottom tab bar is the disambiguated nav on mobile. */
const tab = (page: Page, name: string) =>
  page.locator('nav[aria-label="Primary"]').getByRole('button', { name, exact: true });

/** Settings is the fifth mobile tab. */
const openSettings = async (page: Page): Promise<void> => {
  await tab(page, 'Settings').click();
  await expect(page.getByText('Appearance')).toBeVisible();
};

test('dashboard — mobile light', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await shot(page, 'dashboard-mobile-light');
});

test('dashboard — mobile dark', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await ready(page);
  await shot(page, 'dashboard-mobile-dark');
});

test('dashboard — desktop light', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await shot(page, 'dashboard-desktop-light');
});

test('subscriptions list — mobile light (full, with conversions)', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await tab(page, 'Subscriptions').click();
  await expect(page.getByRole('button', { name: 'Add subscription' })).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'subscriptions-mobile-light');
  // The app scrolls internally (h-dvh), so fullPage won't grab the list — use a
  // tall viewport so every row (incl. the EUR/GBP conversion rows) is captured.
  await page.setViewportSize({ width: 390, height: 2200 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/subscriptions-mobile-full.png` });
});

test('no horizontal overflow on conversion rows — mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await tab(page, 'Subscriptions').click();
  await expect(page.getByRole('button', { name: 'Add subscription' })).toBeVisible();
  // Adobe is the worst case: foreign currency (EUR→USD conversion) + a large
  // lifetime-paid total. If anything overflows the card, it's here.
  const card = page.locator('li', { hasText: 'Adobe Creative Cloud' });
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: `${SHOTS}/row-adobe.png` });
  const overflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, 'Adobe row should not overflow horizontally').toBeLessThanOrEqual(1);
});

test('purchases list — mobile light', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await tab(page, 'Purchases').click();
  await expect(page.getByRole('button', { name: 'Add purchase' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1800 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/purchases-mobile-full.png` });
});

test('categories + settings — mobile light', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await tab(page, 'Categories').click();
  await page.setViewportSize({ width: 390, height: 1400 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/categories-mobile-full.png` });
  await page.setViewportSize(MOBILE);
  await openSettings(page);
  await page.setViewportSize({ width: 390, height: 2600 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/settings-mobile-full.png` });
});

test('add-subscription bottom sheet — mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await tab(page, 'Subscriptions').click();
  await page.getByRole('button', { name: 'Add subscription' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'add-sheet-mobile');
});

test('ai chat panel — mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await page.getByRole('button', { name: 'Open AI assistant' }).click();
  await expect(page.getByRole('dialog', { name: 'Assistant' })).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'ai-panel-mobile');
});

test('subscription details dialog — mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await tab(page, 'Subscriptions').click();
  // Opening a row shows its details.
  await page.locator('ul').getByRole('button', { name: 'Figma', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1700 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/details-mobile.png` });
});

test('add subscription form — full mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 2400 });
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  await tab(page, 'Subscriptions').click();
  await page.getByRole('button', { name: 'Add subscription' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/add-form-full-mobile.png` });
});

test('form input heights are consistent (text vs date vs select)', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ready(page);
  await tab(page, 'Subscriptions').click();
  await page.getByRole('button', { name: 'Add subscription' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const h = (sel: string) =>
    page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const name = await h('#name');
  const date = await h('#subscribedSince');
  const renewal = await h('#renewalDate');
  const select = await page.getByRole('combobox').first().evaluate((el) =>
    Math.round(el.getBoundingClientRect().height),
  );
  console.log('input heights', { name, date, renewal, select });
  expect(Math.abs(date - name), 'date input should match text input height').toBeLessThanOrEqual(1);
  expect(Math.abs(renewal - name)).toBeLessThanOrEqual(1);
  expect(Math.abs(select - name)).toBeLessThanOrEqual(1);
});

test('PWA theme-color syncs with brand color', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await ready(page);
  const meta = page.locator('meta[name="theme-color"]');
  await expect(meta).toHaveAttribute('content', '#6366F1');
  await openSettings(page);
  await page.getByRole('button', { name: 'Violet', exact: true }).click();
  // The iOS status-bar tint should now follow the chosen accent, not the default.
  await expect(meta).toHaveAttribute('content', '#8B5CF6');
});

test('layout variations — mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  await ready(page);
  for (const v of ['Crisp', 'Default']) {
    await openSettings(page);
    await page.getByRole('button', { name: new RegExp(`^${v}`) }).click();
    await tab(page, 'Dashboard').click();
    await expect(page.getByText('Monthly cost', { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, `variation-${v.toLowerCase()}-mobile`);
  }
});

test('sort dropdown lists each option once', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await ready(page);
  await page.locator('aside').getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sort' }).click();
  await expect(page.getByRole('option', { name: 'Sort: renewal date' })).toHaveCount(1);
});

test('bulk deactivate offers undo', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await ready(page);
  await page.locator('aside').getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Netflix' }).last().check();
  await page.getByRole('checkbox', { name: 'Select Spotify' }).last().check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('region', { name: 'Bulk actions' }).getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('2 subscriptions marked inactive')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('switch', { name: 'Netflix active' }).last()).toBeChecked();
});
