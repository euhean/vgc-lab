import { expect, type Page } from '@playwright/test';

export async function signUp(page: Page, prefix: string): Promise<void> {
  const username = `${prefix}${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'No account? Sign up' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.com`);
  await page.getByLabel('Password').fill('pikachu123');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Your teams' })).toBeVisible();
}

/** Creates a team from a Showdown paste and opens it. */
export async function importTeam(page: Page, name: string, paste: string): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder('Team name').fill(name);
  await page.getByRole('button', { name: 'Import from Showdown' }).click();
  await page.getByPlaceholder('Paste a Showdown team export here').fill(paste);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/teams\/\d+$/);
}
