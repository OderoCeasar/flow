import { devices, expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectAccessible } from './a11y';

const here = path.dirname(fileURLToPath(import.meta.url));
const PHOTO = path.join(here, '..', 'fixtures', 'leak.jpg');
const PASSWORD = 'flowdemo123';
// Near Kenyatta Avenue, Nairobi CBD. Nudged per run so it doesn't match earlier runs as a duplicate.
const LEAK = { latitude: -1.2851 + Math.random() * 0.01, longitude: 36.8205 + Math.random() * 0.01 };

let reference = '';

test.describe.serial('report → assign → fix → citizen sees Fixed', () => {
  test('citizen reports a leak on a small phone in three steps', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Pixel 5'],
      geolocation: LEAK,
      permissions: ['geolocation'],
      locale: 'en-KE',
    });
    const page = await context.newPage();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Spot a leak\?/ })).toBeVisible();
    await expectAccessible(page, 'home');
    await page.getByRole('link', { name: 'Report a leak' }).click();

    // Step 1: photo
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
    await expect(page.getByText(/Photo ready/)).toBeVisible();
    await expectAccessible(page, 'photo step');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: location from GPS, pin shown
    await expect(page.getByText('Step 2 of 3')).toBeVisible();
    await expect(page.getByText('We found your location.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Leak location pin/ })).toBeVisible();
    await expectAccessible(page, 'location step');
    await page.getByRole('button', { name: 'Confirm location' }).click();
    // If someone reported a leak right here, this run treats it as a new one.
    const sheet = page.getByRole('dialog', { name: /reported a leak/ });
    if (await sheet.isVisible().catch(() => false)) await sheet.getByRole('button', { name: 'No, this is a different leak' }).click();

    // Step 3: details
    await expect(page.getByText('Step 3 of 3')).toBeVisible();
    await page.getByRole('radio', { name: /^Burst pipe/ }).check({ force: true });
    await page.getByRole('radio', { name: 'Gushing', exact: true }).check({ force: true });
    await page.getByLabel('Phone number').fill('712 345 678');
    await expectAccessible(page, 'details step');
    await page.getByRole('button', { name: 'Send report' }).click();

    // Success screen with a reference number and timeline
    await expect(page.getByRole('heading', { name: 'Report sent. Thank you!' })).toBeVisible();
    reference = (await page.getByTestId('reference-code').textContent())!.trim();
    expect(reference).toMatch(/^FLW-[A-Z0-9]{6}$/);
    await expect(page.getByText('Received').first()).toBeVisible();
    await expectAccessible(page, 'success screen');
    await context.close();
  });

  test('dispatcher finds it on the dashboard and assigns a technician', async ({ page }) => {
    await page.goto('/staff/login');
    await page.getByLabel('Work email').fill('dispatcher@flow.local');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expectAccessible(page, 'dashboard');

    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('textbox', { name: 'Search', exact: true }).fill(reference);
    const row = page.locator('tr', { hasText: reference });
    await expect(row).toHaveCount(1);
    await row.click();

    // Every score explains itself.
    await expect(page.getByText('Why this score?')).toBeVisible();
    await expect(page.getByText(/Severity: Critical/)).toBeVisible();
    await expectAccessible(page, 'report detail');

    // Assign with the keyboard shortcut.
    await row.focus();
    await page.keyboard.press('a');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /Otieno Ochieng/ }).check();
    await expectAccessible(page, 'assign dialog');
    await dialog.getByRole('button', { name: 'Assign job' }).click();
    await expect(page.getByText('Assigned to Otieno Ochieng.')).toBeVisible();
    await expect(row.getByText('Scheduled')).toBeVisible();
  });

  test('technician starts the job and marks it fixed on their phone', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Pixel 5'] });
    const page = await context.newPage();
    await page.goto('/staff/login');
    await page.getByLabel('Work email').fill('tech1@flow.local');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'My jobs' })).toBeVisible();

    const job = page.locator('li', { hasText: reference });
    await expect(job).toBeVisible();
    await expect(job.getByRole('link', { name: /Directions/ })).toBeVisible();
    await expectAccessible(page, 'technician jobs');

    await job.getByRole('link', { name: /priority/ }).click();
    await expect(page.getByRole('heading', { name: 'Job details' })).toBeVisible();
    await expectAccessible(page, 'job details');
    await page.getByRole('button', { name: 'Start job' }).click();
    await expect(page.getByText('In progress')).toBeVisible();
    await page.getByRole('link', { name: 'Mark fixed' }).click();
    await expect(page.getByRole('heading', { name: 'Add an after photo' })).toBeVisible();
    await page.getByLabel('Work note').fill('Replaced 2 m of pipe');
    await expectAccessible(page, 'mark fixed');
    await page.getByRole('button', { name: 'Confirm fixed' }).click();
    // No after photo, so we're asked to confirm.
    await page.getByRole('dialog').getByRole('button', { name: 'Mark fixed' }).click();
    await expect(page.getByText('Marked fixed. The citizen has been told.')).toBeVisible();
    await context.close();
  });

  test('citizen sees Fixed on the status page', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Pixel 5'] });
    const page = await context.newPage();
    await page.goto(`/track/${reference}`);
    await expect(page.getByText(reference)).toBeVisible();
    await expect(page.getByText('Fixed').first()).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toContainText('Fixed');
    await expectAccessible(page, 'status page');
    // The reporter can say whether the repair worked.
    await page.getByRole('button', { name: 'Yes, it was' }).click();
    await expect(page.getByText("Thank you! We're glad it's fixed.")).toBeVisible();
    await context.close();
  });
});

test('the citizen app looks like a phone app on a small screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');
  // No sideways scrolling, and the main action is on screen without scrolling.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('link', { name: 'Report a leak' })).toBeInViewport();
  const box = await page.getByRole('link', { name: 'Report a leak' }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.goto('/track');
  await expect(page.getByRole('heading', { name: 'Find your report' })).toBeVisible();
  await expectAccessible(page, 'track form');
  await context.close();
});

test('the citizen app works in Swahili', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Kiswahili' }).click();
  await expect(page.getByRole('heading', { name: /Umeona uvujaji\?/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sw');
  await expectAccessible(page, 'home in Swahili');
});

test('a second reporter is offered the existing report and can still send theirs', async ({ browser, request }) => {
  const spot = { latitude: -1.2735 - Math.random() * 0.005, longitude: 36.8105 + Math.random() * 0.005 };
  const first = await request.post('/api/v1/reports', {
    headers: { Origin: 'http://localhost:8080' },
    multipart: { lat: String(spot.latitude), lng: String(spot.longitude), leak_type: 'burst_pipe', description: 'Pipe burst by the gate', address_text: 'Muthithi Road, Westlands' },
  });
  expect(first.ok()).toBeTruthy();
  const firstRef = (await first.json()).reference_code as string;

  const context = await browser.newContext({ ...devices['Pixel 5'], geolocation: spot, permissions: ['geolocation'] });
  const page = await context.newPage();
  await page.goto('/report');
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('We found your location.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm location' }).click();

  const sheet = page.getByRole('dialog', { name: /Someone reported a leak \d+ m from here/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Burst pipe on Muthithi Road')).toBeVisible();
  await expectAccessible(page, 'duplicate sheet');
  await sheet.getByRole('button', { name: "Yes, it's the same leak" }).click();

  await expect(page.getByText(new RegExp(`will be added to ${firstRef}`))).toBeVisible();
  await page.getByRole('button', { name: 'Add my report' }).click();
  await expect(page.getByRole('heading', { name: 'Added. Thank you!' })).toBeVisible();
  await context.close();
});
