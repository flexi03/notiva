import { expect, test } from '@playwright/test'
import { go, openDemo, pageErrors, pageTitle, peek, peekTitle } from './helpers'

test.describe('Studien-Dashboard', () => {
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('zeigt berechnete Kacheln', async ({ page }) => {
    const tile = (name: string) => page.getByRole('region', { name })
    await expect(tile('Notenschnitt')).toContainText('2,06')
    await expect(tile('ECTS')).toContainText('15')
    await expect(tile('ECTS')).toContainText('/ 180 · 8 %')
    await expect(tile('Nächste Prüfung')).toContainText('40')
    await expect(tile('Nächste Prüfung')).toContainText('Klausur Lineare Algebra')
    await expect(tile('Offene Aufgaben')).toContainText('3')
    await expect(tile('Vorlesungszeit')).toContainText('Woche von 15')
    await expect(tile('Diese Woche fällig').getByRole('button')).toHaveCount(2)
  })

  test('Link-Kachel und Listeneintrag öffnen als Vorschau', async ({ page }) => {
    await page.getByRole('button', { name: /Module.*Alle Module/ }).click()
    await expect(peekTitle(page)).toHaveValue('Module')
    await page.keyboard.press('Escape')
    await expect(peek(page)).toHaveCount(0)
    await expect(await pageTitle(page)).toHaveValue('Studium')
    await page
      .getByRole('region', { name: 'Diese Woche fällig' })
      .getByRole('button', { name: /Übungsblatt 3 LA/ })
      .click()
    await expect(peekTitle(page)).toHaveValue('Übungsblatt 3 LA')
    await peek(page).getByRole('button', { name: 'Als ganze Seite öffnen' }).click()
    await expect(peek(page)).toHaveCount(0)
    await expect(await pageTitle(page)).toHaveValue('Übungsblatt 3 LA')
  })

  test('Note eintragen aktualisiert Notenschnitt und ECTS', async ({ page }) => {
    await page.getByRole('button', { name: /Module.*Alle Module/ }).click()
    await expect(peekTitle(page)).toHaveValue('Module')
    await peek(page).getByRole('tab', { name: 'Tabelle' }).click()
    const row = peek(page).getByRole('row', { name: /Lineare Algebra/ })
    await row.getByRole('button', { name: 'Note Bearbeiten' }).click()
    await page.getByRole('dialog', { name: 'Note' }).getByRole('textbox').fill('1,0')
    await page.keyboard.press('Enter')
    await row.getByRole('button', { name: 'Status Bearbeiten' }).click()
    await page
      .getByRole('dialog', { name: 'Status' })
      .getByRole('option', { name: 'Bestanden', exact: true })
      .click()
    await peek(page).getByRole('button', { name: 'Schließen' }).click()
    await expect(page.getByRole('region', { name: 'Notenschnitt' })).toContainText('1,66')
    await expect(page.getByRole('region', { name: 'ECTS' })).toContainText('24')
  })

  test('Mein Semester: „Praktikum bearbeiten“ legt den Code-Ordner des Moduls an', async ({ page }) => {
    await go(page, '/#/semester')
    const dbs = page.getByRole('region', { name: 'Datenbanken' })
    await dbs.getByRole('button', { name: 'Praktikum bearbeiten' }).click()
    await expect(await pageTitle(page)).toHaveValue('Praktikum')
    // Second time: the same folder opens again.
    await go(page, '/#/semester')
    await expect(page.getByRole('region', { name: 'Datenbanken' })).toContainText('Praktikum')
    await page
      .getByRole('region', { name: 'Datenbanken' })
      .getByRole('button', { name: 'Praktikum bearbeiten' })
      .click()
    await expect(await pageTitle(page)).toHaveValue('Praktikum')
  })
})

test.describe('Modulseite', () => {
  test.beforeEach(async ({ page }) => openDemo(page))
  test.afterEach(({ page }) => expect(pageErrors(page)).toEqual([]))

  test('zeigt die Termine und plant Praktikumstermine mit Vorbereitung', async ({ page }) => {
    await go(page, `/#/p/${encodeURIComponent('Studium/Module/Software Engineering.md')}`)
    const sessions = page.getByRole('region', { name: 'Termine' })
    await expect(sessions.getByTestId('module-sessions')).toContainText('14:00–17:00 · Labor')
    await expect(sessions).toContainText('Lab 1')
    const lab = page.getByRole('region', { name: 'Praktikum', exact: true })
    await expect(lab).toContainText('Vorschlag: Praktikumstermine ab Do 14:00')
    await lab.getByRole('button', { name: 'Ansehen' }).click()
    const planner = lab.getByTestId('lab-planner')
    await expect(planner.getByLabel('Erster Termin')).toHaveValue('2026-10-15')
    await planner.getByLabel('Anzahl Termine').fill('2')
    await expect(planner.getByRole('list', { name: 'Vorschau' })).toContainText('P01 Praktikumstermin')
    await planner.getByRole('button', { name: '4 eintragen' }).click()
    const dates = lab.getByTestId('lab-dates')
    await expect(dates.getByRole('listitem')).toHaveCount(4)
    await expect(dates).toContainText('15.10.2026, 14:00')
    await expect(dates).toContainText('P01 Vorbereitung')
  })

  test('„Als Nächstes“ in der Statusleiste öffnet das Modul und hebt passende Dateien hervor', async ({
    page,
  }) => {
    const bar = page.getByRole('contentinfo', { name: 'Statusleiste' })
    await bar.getByRole('button', { name: /SE Labor/ }).click()
    await expect(await pageTitle(page)).toHaveValue('Software Engineering')
    const focus = page.getByTestId('session-focus')
    await expect(focus).toContainText('Für diesen Termin')
    await expect(focus).toContainText('Labor')
  })

  test('Namensfeld im Dialog: Tippen markiert nicht nach jedem Zeichen alles', async ({ page }) => {
    await go(page, '/#/semester')
    await page
      .getByRole('region', { name: 'Datenbanken' })
      .getByRole('button', { name: 'Praktikum bearbeiten' })
      .click()
    await page.getByRole('button', { name: 'Neue Datei' }).click()
    const field = page.getByRole('dialog').getByRole('textbox')
    await field.pressSequentially('abfrage.sql')
    await expect(field).toHaveValue('abfrage.sql')
  })

  test('„Heute“ zeigt die Termine und Aufgaben des Tages', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Seiten' })
    // Narrow screens: the side bar is folded away.
    if (!(await nav.isVisible()))
      await page.getByRole('button', { name: 'Seitenleiste ein-/ausblenden' }).first().click()
    await nav.getByRole('button', { name: 'Heute' }).click()
    const day = page.getByTestId('day-overview')
    await expect(day).toContainText('Heute')
    await expect(day).toContainText('Lineare Algebra')
    await expect(day).toContainText('Übung')
    // Due in the next days: listed under "Demnächst" with their date.
    await expect(day.getByTestId('day-upcoming')).toContainText('Demnächst')
    await expect(day.getByTestId('day-upcoming').getByRole('listitem').first()).toBeVisible()
    // A click on a session opens its module (with the files for it).
    await day
      .getByRole('button', { name: /Lineare Algebra/ })
      .first()
      .click()
    await expect(await pageTitle(page)).toHaveValue('Lineare Algebra')
    await expect(page.getByTestId('session-focus')).toBeVisible()
  })

  test('Praktikumstermine sind mit dem Praktikumsordner verbunden', async ({ page }) => {
    await go(page, '/#/semester')
    await page
      .getByRole('region', { name: 'Datenbanken' })
      .getByRole('button', { name: 'Praktikum bearbeiten' })
      .click()
    await expect(page.getByTestId('lab-dates-folder')).toContainText('Noch keine Praktikumstermine')
    await go(page, `/#/p/${encodeURIComponent('Studium/Module/Datenbanken.md')}`)
    const lab = page.getByRole('region', { name: 'Praktikum', exact: true })
    await lab.getByRole('button', { name: 'Termine planen' }).click()
    const planner = lab.getByTestId('lab-planner')
    await planner.getByLabel('Anzahl Termine').fill('1')
    await planner.getByRole('button', { name: '2 eintragen' }).click()
    await expect(lab.getByTestId('lab-dates').getByRole('listitem')).toHaveCount(2)
    // The lab folder lists them – linked both ways.
    await go(page, '/#/semester')
    await page
      .getByRole('region', { name: 'Datenbanken' })
      .getByRole('button', { name: 'Praktikum bearbeiten' })
      .click()
    const dates = page.getByTestId('lab-dates-folder')
    await expect(dates).toContainText('P01 Praktikumstermin')
    await expect(dates).toContainText('P01 Vorbereitung')
    await expect(dates.getByRole('button', { name: /Mit dem Praktikumsordner verbinden/ })).toHaveCount(0)
  })
})
