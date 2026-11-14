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
    await expect(page.getByRole('heading', { name: 'Seen a water leak?' })).toBeVisible();
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
    await expect(page.getByText(/accurate to about/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Leak location pin/ })).toBeVisible();
    await expectAccessible(page, 'location step');
    await page.getByRole('button', { name: 'The pin is on the leak' }).click();

    // Step 3: details
    await expect(page.getByText('Step 3 of 3')).toBeVisible();
    await page.getByRole('radio', { name: /^Burst pipe/ }).check({ force: true });
    await page.getByRole('radio', { name: 'Gushing', exact: true }).check({ force: true });
    await page.getByLabel(/Phone number for SMS updates/).fill('0712 345 678');
    await expectAccessible(page, 'details step');
    const different = page.getByRole('button', { name: 'No, this is a different leak' });
    if (await different.isVisible()) await different.click();
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

    await page.getByLabel('Search').fill(reference);
    const row = page.locator('tr', { hasText: reference });
    await expect(row).toHaveCount(1);
    await row.click();

    // Every score explains itself.
    await expect(page.getByRole('heading', { name: 'Priority and why' })).toBeVisible();
    await expect(page.getByText(/Severity: Critical/)).toBeVisible();
    await expectAccessible(page, 'report detail');

    // Assign with the keyboard shortcut.
    await row.focus();
    await page.keyboard.press('a');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Technician').selectOption({ label: 'Otieno Ochieng' });
    await expectAccessible(page, 'assign dialog');
    await dialog.getByRole('button', { name: 'Assign' }).click();
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
    await expect(job.getByRole('link', { name: /Get directions/ })).toBeVisible();
    await expectAccessible(page, 'technician jobs');

    await job.getByRole('button', { name: 'Start work' }).click();
    await expect(job.getByText('In progress')).toBeVisible();
    await job.getByRole('button', { name: 'Mark fixed' }).click();
    // No after photo yet, so we're asked to confirm.
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
    await context.close();
  });
});

test('the citizen app works in Swahili', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'SW' }).click();
  await expect(page.getByRole('heading', { name: 'Umeona maji yakivuja?' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sw');
  await expectAccessible(page, 'home in Swahili');
});
