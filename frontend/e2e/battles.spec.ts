import { expect, test } from '@playwright/test';
import { importTeam, signUp } from './helpers';

const CORE = `Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Flare Blitz

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Level: 50
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball`;

const WEAK = `Pikachu
Ability: Static
Level: 50
- Thunder Shock

Raichu
Ability: Static
Level: 50
- Thunder Shock`;

test('simulate a win rate and win a live battle against the AI', async ({ page }) => {
  await signUp(page, 'battler');
  await importTeam(page, 'Pikachus', WEAK);
  await importTeam(page, 'Core', CORE);
  await page.getByLabel('Opponent team').selectOption({ label: 'Pikachus' });

  await test.step('win rate', async () => {
    await page.getByLabel('Games').selectOption('50');
    await page.getByRole('button', { name: 'Win rate' }).click();
    await expect(page.getByRole('status')).toContainText('of 50', { timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText(/Win rate (9\d|100)%/);
  });

  await test.step('live battle', async () => {
    await page.getByRole('link', { name: 'Battle' }).click();
    await page.getByRole('button', { name: 'Incineroar' }).click();
    await page.getByRole('button', { name: 'Flutter Mane' }).click();
    await page.getByRole('button', { name: 'Start battle' }).click();

    // Every move here needs a target: use the first move on the first target until the battle ends.
    const result = page.getByRole('status');
    const move = page.locator('.move-grid button:not([disabled])').first();
    for (let choices = 0; choices < 40; choices++) {
      await expect(move.or(result)).toBeVisible({ timeout: 15_000 });
      if (await result.isVisible()) break;
      await move.click();
      await page.getByRole('group', { name: 'Targets' }).getByRole('button').first().click();
    }
    await expect(result).toContainText('You won!');
    await expect(page.getByLabel('Battle log')).toContainText('Turn 1');
  });
});
