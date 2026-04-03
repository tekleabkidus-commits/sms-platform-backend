import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Tenant code').fill('acme-et');
  await page.getByLabel('Email address').fill('admin@example.com');
  await page.getByLabel('Password').fill('ChangeMe123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test('logs in and shows the tenant dashboard', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Delivery, spend, and policy posture')).toBeVisible();
  await expect(page.getByText('Available balance')).toBeVisible();
});

test('submits a single SMS from the send page', async ({ page }) => {
  await login(page);
  await page.goto('/send');
  await page.getByLabel('Destination').fill('+251911999999');
  await page.getByLabel('Sender ID (single send)').selectOption({ label: 'MYAPP (pending)' });
  await page.getByLabel('Message body').fill('Manual single-send body');
  await page.getByRole('button', { name: 'Send now' }).click();
  await page.goto('/messages');
  await expect(page.getByText('Manual single-send body').first()).toBeVisible();
});

test('creates a bulk campaign and navigates from the campaigns list into campaign detail', async ({ page }) => {
  await login(page);
  await page.goto('/send');
  await page.setInputFiles('input[type="file"]', {
    name: 'recipients.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('phone_number,name\n+251911123456,Abel\n+251922123456,Hanna\n'),
  });
  await page.getByLabel('Campaign name').fill('April subscriber campaign');
  await page.getByLabel('Start time').fill('2026-04-02T12:00');
  await page.getByLabel('Sender ID (bulk send)').selectOption({ label: 'MYAPP' });
  await page.getByLabel('Template (bulk send)').selectOption({ label: 'otp-login@1' });
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByText(/bulk campaign scheduled/i)).toBeVisible();

  await page.goto('/campaigns');
  await page.getByRole('link', { name: 'OTP Warmup' }).click();
  await expect(page).toHaveURL(/\/campaigns\/1$/);
  await expect(page.getByText('Campaign jobs')).toBeVisible();
  await expect(page.getByText('Recent failed records')).toBeVisible();
});

test('exports campaigns as CSV from the explorer page', async ({ page }) => {
  await login(page);
  await page.goto('/campaigns');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('campaigns.csv');
});

test('opens the notifications center and marks alerts as read', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Open notifications center' }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Wallet balance is below threshold')).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByText('All alerts have been reviewed.')).toBeVisible();
});

test('requires typed confirmation and re-authentication for dangerous API key revocation', async ({ page }) => {
  await login(page);
  await page.goto('/developer/api-keys');

  await page.getByRole('button', { name: 'Revoke' }).first().click();
  await expect(page.getByRole('dialog', { name: /revoke primary key/i })).toBeVisible();
  await page.getByLabel('Type abc123 to continue').fill('abc123');
  await page.getByLabel('Password confirmation').fill('ChangeMe123!');
  await page.getByRole('button', { name: 'Revoke key' }).click();

  await expect(page.getByText(/api key disabled/i)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Disabled' })).toBeVisible();
});

test('shows upload preview state and invalid-row handling for bulk contact imports', async ({ page }) => {
  await login(page);
  await page.goto('/contacts/uploads');

  await page.setInputFiles('input[type="file"]', {
    name: 'invalid-contacts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('phone_number,name\n+251911123456,Abel\n0911,Invalid\n'),
  });

  await expect(page.getByText(/duplicate values detected before upload/i)).toBeVisible();
  await page.getByRole('button', { name: 'Commit import' }).click();
  await expect(page.getByText(/accepted with 1 invalid rows/i)).toBeVisible();

  await page.getByRole('link', { name: 'View invalid rows' }).first().click();
  await expect(page.getByText(/invalid phone number/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /download invalid rows/i })).toBeVisible();
});

test('redirects to login when the session cookie is expired', async ({ page, context }) => {
  await context.addCookies([{
    name: 'sms_cp_token',
    value: 'expired:tenant-1',
    url: 'http://127.0.0.1:3001',
  }]);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
