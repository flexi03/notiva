import { expect, test } from '@playwright/test'
import { go, openDemo, pageErrors } from './helpers'

test.describe('Notenrechner', () => {
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('Schnitt jetzt, mit Annahmen und was für den Zielschnitt nötig ist', async ({ page }) => {
    await go(page, '#/grades')
    const calc = page.getByTestId('grade-calculator')
    // Like the dashboard tile: 9 ECTS at 2,3 and 6 ECTS at 1,7.
    await expect(calc).toContainText('2,06')
    await calc.getByLabel('Zielschnitt').fill('2,0')
    // Open: Lineare Algebra 9, Datenbanken 6, Software Engineering 6 (elective, but taken).
    await expect(calc.getByTestId('grade-needed')).toHaveText(
      'Dafür brauchst du im Schnitt 1,95 in den übrigen 21 ECTS.',
    )
    await calc.getByLabel('Erwartete Note in „Lineare Algebra“').fill('1,0')
    await expect(calc.getByTestId('grade-projected')).toHaveText('1,66')
    await expect(calc.getByTestId('grade-needed')).toContainText('2,67 in den übrigen 12 ECTS')
    // Kept on this device.
    await page.reload()
    await openDemo(page)
    await go(page, '#/grades')
    await expect(page.getByTestId('grade-calculator').getByLabel('Zielschnitt')).toHaveValue('2,0')
  })
})
