import { expect, test } from '@playwright/test';
import { importTeam, signUp } from './helpers';

// Needs a usage report in the database: CI loads backend/tests/fixtures/chaos-gen9vgc2024regg-1630.json.
const TEAM = `Amoonguss @ Rocky Helmet
Ability: Regenerator
Level: 50
EVs: 252 HP / 172 Def / 84 SpD
Relaxed Nature
- Spore
- Pollen Puff`;

test('rank meta threats and turn the top six into an opponent team', async ({ page }) => {
  await signUp(page, 'meta');
  await importTeam(page, 'Fungus', TEAM);

  await page.getByRole('button', { name: 'Meta threats' }).click();
  const rows = page.locator('table.threats tbody tr.clickable');
  await expect(rows.first()).toBeVisible();
  // Flare Blitz is super effective on Amoonguss, so the most used Incineroar is the top threat.
  await expect(rows.first()).toContainText('Incineroar');

  await rows.first().click();
  await expect(page.getByText('Amoonguss: takes')).toBeVisible();

  await page.getByRole('button', { name: 'Use the top 6 as opponent team' }).click();
  await expect(page.getByRole('status')).toContainText('chose it as the opponent team');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByLabel('Opponent team')).toHaveValue(/\d+/);
  await expect(page.getByRole('button', { name: 'Compare teams' })).toBeEnabled();
});
