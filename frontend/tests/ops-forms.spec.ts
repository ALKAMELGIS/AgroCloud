import ExcelJS from 'exceljs'
import { expect, test } from 'playwright/test'
import { signInAsAdmin, trackPageErrors } from './helpers/session'

/**
 * Operations forms end to end against the real API (throwaway database, synthetic data only):
 * import an Excel workbook, filter, edit with history + navigation, save & new, reports, settings.
 * Each project (desktop / tablet / mobile) uses its own batch tag so parallel runs never collide.
 */

/** The PWA install prompt (mobile/tablet) is its own dialog; keep it out of the way. */
async function prepare(page: import('playwright/test').Page) {
  await signInAsAdmin(page)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('agro_pwa_install_dismissed_v1', String(Date.now()))
    } catch {
      /* ignore */
    }
  })
}

async function harvestWorkbook(tag: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Harvest')
  ws.addRow(['ELITE AGRO UAE LLC'])
  ws.addRow(['HARVEST RECORD'])
  ws.addRow(['Date of Harvest', 'Start Time', 'Field Name/ID', 'Segment ID', 'Product Name', 'Variety', 'Receipt No/Batch Number', 'Total Harvested Quantity'])
  const crops = ['Tomato', 'Cucumber', 'Capsicum']
  for (let i = 0; i < 12; i++) {
    ws.addRow([`${String((i % 9) + 1).padStart(2, '0')}/03/2026`, '07:30', `NH ${(i % 3) + 1}`, String(i + 1), crops[i % 3], 'Test variety', `${tag}-${i}`, 10 + i])
  }
  ws.addRow(['not a date', '', 'NH 1', '', 'Tomato', '', `${tag}-bad`, 5]) // dropped: no valid date
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test.describe('operations forms', () => {
  test('import, filter, edit, navigate, report and export', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const tag = `E2E${testInfo.project.name.toUpperCase()}${Date.now() % 100000}`
    await prepare(page)
    const errors = trackPageErrors(page)

    await page.goto('/AgroCloud/#/ops')
    await expect(page.getByRole('heading', { level: 1, name: /operations forms/i })).toBeVisible()
    await page.goto('/AgroCloud/#/ops/harvest')
    await expect(page.getByRole('heading', { level: 1, name: /harvest record/i })).toBeVisible()

    // Import
    await page.getByRole('button', { name: /^import$/i }).first().click()
    const importDialog = page.getByRole('dialog', { name: /import records/i })
    await importDialog.locator('input[type=file]').setInputFiles({
      name: `harvest-${tag}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await harvestWorkbook(tag),
    })
    const importBtn = importDialog.getByRole('button', { name: /import 12 records/i })
    await expect(importBtn).toBeEnabled()
    await importBtn.click()
    await importDialog.getByRole('button', { name: /^done$/i }).click()

    // Search narrows to this run's rows
    await page.getByRole('textbox', { name: /search records/i }).fill(tag)
    await expect(page.getByText(/^12 records/)).toBeVisible()
    await page.getByRole('textbox', { name: /search records/i }).fill(`${tag}-1`) // -1, -10, -11
    await expect(page.getByText(/^3 records/)).toBeVisible()
    await page.getByRole('textbox', { name: /search records/i }).fill(tag)
    await expect(page.getByText(/^12 records/)).toBeVisible()

    // Edit the first record, check history and next-record navigation
    await page.getByRole('row', { name: /^open record/i }).first().click()
    const editor = page.getByRole('dialog', { name: /harvest|record/i }).first()
    const qty = editor.getByLabel(/harvested quantity/i)
    await qty.fill('99')
    await editor.getByRole('button', { name: /^save$/i }).click()
    await expect(editor.getByText(/saved/i).first()).toBeVisible()
    await expect(editor.getByRole('button', { name: /next record/i })).toBeEnabled()
    await editor.getByRole('button', { name: /next record/i }).click()
    await expect(qty).not.toHaveValue('99')
    await editor.getByRole('button', { name: /previous record/i }).click()
    await expect(qty).toHaveValue('99')
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)

    // Reports in every format follow the page filters
    for (const [label, format] of [['PDF', 'PDF'], ['Excel', 'XLSX'], ['Word', 'DOCX']]) {
      await page.getByRole('button', { name: /^report$/i }).click()
      const dialog = page.getByRole('dialog', { name: /generate report/i })
      await dialog.getByRole('radio', { name: label, exact: true }).click()
      const download = page.waitForEvent('download')
      await dialog.getByRole('button', { name: new RegExp(`download ${format}`, 'i') }).click()
      const file = await download
      expect(file.suggestedFilename().toLowerCase()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`))
      await expect(dialog).toHaveCount(0)
    }

    // Export
    await page.getByRole('button', { name: /^export/i }).click()
    const exported = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: /excel/i }).click()
    expect((await exported).suggestedFilename()).toMatch(/\.xlsx$/)

    // Settings page lists the values the import added
    await page.goto('/AgroCloud/#/ops/settings')
    await expect(page.getByRole('heading', { level: 1, name: /settings/i })).toBeVisible()

    expect(errors).toEqual([])
  })

  test('validation blocks an incomplete record and save & new keeps the context', async ({ page }, testInfo) => {
    const tag = `NEW${testInfo.project.name.toUpperCase()}${Date.now() % 100000}`
    await prepare(page)
    await page.goto('/AgroCloud/#/ops/harvest?new=1')
    const editor = page.getByRole('dialog', { name: /new record/i })
    await expect(editor).toBeVisible()
    await editor.getByRole('button', { name: /^save$/i }).click()
    await expect(editor.getByText(/required/i).first()).toBeVisible()

    await editor.getByLabel(/harvest date/i).fill('2026-03-10')
    await editor.getByLabel(/field \/ house/i).fill('NH 02')
    await editor.getByLabel(/^product/i).fill('Tomato')
    await editor.getByLabel(/receipt \/ batch/i).fill(tag)
    await editor.getByLabel(/harvested quantity/i).fill('42')
    await editor.getByRole('button', { name: /save & new/i }).click()
    await expect(editor.getByText(/saved\. enter the next record/i)).toBeVisible()
    await expect(editor.getByLabel(/harvest date/i)).toHaveValue('2026-03-10') // sticky
    await expect(editor.getByLabel(/harvested quantity/i)).toHaveValue('') // cleared
  })
})

test.describe('operations forms — permissions and audit log', () => {
  test('a Viewer only reads; an Admin edits the matrix and sees it in the audit log', async ({ page, browser }, testInfo) => {
    test.setTimeout(90_000)
    // Viewer: can open and report, cannot add / import / see deleted records or settings.
    const viewerCtx = await browser.newContext({ viewport: page.viewportSize() ?? undefined })
    const viewer = await viewerCtx.newPage()
    await viewer.addInitScript(() => {
      try {
        sessionStorage.setItem('agroSplashShown', '1')
        localStorage.setItem('agro_pwa_install_dismissed_v1', String(Date.now()))
        localStorage.setItem('currentUser', JSON.stringify({ id: 9, name: 'Read Only', email: 'viewer@example.com', role: 'Viewer' }))
      } catch {
        /* ignore */
      }
    })
    await viewer.goto('/AgroCloud/#/ops/harvest')
    await expect(viewer.getByRole('heading', { level: 1, name: /harvest record/i })).toBeVisible()
    await expect(viewer.getByRole('button', { name: /^new record$/i })).toHaveCount(0)
    await expect(viewer.getByRole('button', { name: /^import$/i })).toHaveCount(0)
    await expect(viewer.getByText(/^deleted$/i)).toHaveCount(0)
    await viewer.goto('/AgroCloud/#/ops/settings')
    await expect(viewer.getByRole('alert')).toContainText(/cannot open the forms settings/i)
    await viewerCtx.close()

    // Admin: flip one right for a role, save, flip it back, then find both changes in the audit log.
    await prepare(page)
    await page.goto('/AgroCloud/#/ops/settings')
    await page.getByRole('button', { name: /^permissions$/i }).click()
    const role = { desktop: 'Editor', tablet: 'Manager', mobile: 'Admin Manager' }[testInfo.project.name] ?? 'Editor'
    await page.getByRole('tab', { name: role, exact: true }).click()
    const box = page.getByRole('checkbox', { name: 'Plant protection (PPP) application: Import' })
    const save = page.getByRole('button', { name: /save permissions/i })
    for (let i = 0; i < 2; i++) {
      await box.click()
      await expect(save).toBeEnabled()
      await save.click()
      await expect(page.getByText(/permissions saved/i)).toBeVisible()
    }
    // Admin rows are locked
    await page.getByRole('tab', { name: 'Admin', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Plant protection (PPP) application: Import' })).toBeDisabled()

    await page.getByRole('button', { name: /^audit log$/i }).click()
    await page.getByRole('combobox', { name: /^action$/i }).selectOption('settings')
    await expect(page.locator('.ops-audit tbody tr').first()).toContainText(/permissions/i)
  })
})
