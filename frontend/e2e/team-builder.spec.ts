import { expect, test } from '@playwright/test';

const TEAM = `Flutter Mane @ Booster Energy
Ability: Protosynthesis
Level: 50
EVs: 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball

Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
EVs: 252 HP / 252 SpD
Careful Nature
- Fake Out
- Flare Blitz`;

test('sign up, build a team, optimize a spread, compare it and share it', async ({ page, browser }) => {
  const username = `trainer${Date.now()}`;

  await test.step('sign up', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: 'No account? Sign up' }).click();
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(`${username}@example.com`);
    await page.getByLabel('Password').fill('pikachu123');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('heading', { name: 'Your teams' })).toBeVisible();
  });

  await test.step('import a team from Showdown', async () => {
    await page.getByPlaceholder('Team name').fill('Sun Offense');
    await page.getByRole('button', { name: 'Import from Showdown' }).click();
    await page.getByPlaceholder('Paste a Showdown team export here').fill(TEAM);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/teams\/\d+$/);
    await expect(page.locator('button.slot')).toHaveCount(2);
  });

  await test.step('add a Pokémon from the Pokédex and save', async () => {
    await page.getByPlaceholder('Search by name').fill('Torkoal');
    await page.locator('.dex-row', { hasText: 'Torkoal' }).getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible();
  });

  await test.step('the team reloads exactly as saved', async () => {
    await page.reload();
    await expect(page.locator('button.slot')).toHaveCount(3);
    await expect(page.locator('button.slot', { hasText: 'Torkoal' })).toBeVisible();
  });

  await test.step('hovering a move shows the damage formula', async () => {
    await page.getByLabel('Opponent team').selectOption({ label: 'Sun Offense (this team)' });
    await page.locator('button.slot', { hasText: 'Flutter Mane' }).click();
    await page.locator('.move-row').first().hover();
    const tooltip = page.locator('.move-row').first().locator('.tooltip');
    await expect(tooltip.locator('.formula')).toContainText('= ');
    await expect(tooltip).toContainText('HP (');
    await page.getByRole('button', { name: 'Done' }).click();
  });

  await test.step('the EV optimizer finds and applies a spread', async () => {
    await page.locator('button.slot', { hasText: 'Incineroar' }).click();
    await page.getByRole('button', { name: 'EV optimizer' }).click();
    await page.getByRole('button', { name: '+ Survive' }).click();
    await page.locator('.goal').getByLabel('Pokémon').selectOption({ label: 'Flutter Mane' });
    await page.getByRole('button', { name: 'Find spread' }).click();
    const result = page.locator('.result').first();
    await expect(result).toContainText("Survive Flutter Mane's Moonblast");
    await result.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('status')).toContainText('Applied');
    await page.getByRole('button', { name: 'Done' }).click();
  });

  await test.step('compare the team against itself', async () => {
    await page.getByRole('button', { name: 'Compare teams' }).click();
    await expect(page.locator('.speed-list li')).toHaveCount(6);
    await page.locator('.modal .tabs button', { hasText: 'Damage' }).click();
    await expect(page.locator('td.dmg').first()).toContainText('%');
    await page.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('a share link shows the team to logged-out visitors', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Create share link' }).click();
    const link = await page.getByLabel('Share link').inputValue();

    const visitor = await browser.newContext();
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(link);
    await expect(visitorPage.getByRole('heading', { name: 'Sun Offense' })).toBeVisible();
    await expect(visitorPage.getByText(`Shared by ${username}`)).toBeVisible();
    await expect(visitorPage.locator('.slot')).toHaveCount(3);
    await visitor.close();
  });
});
