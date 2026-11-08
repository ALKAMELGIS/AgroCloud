import { expect, test, type Page } from 'playwright/test'

/**
 * Dashboard Builder on Develop Dashboard: add elements from the library (drag and click),
 * configure data, cross-filter between elements, delete + undo, persistence after reload.
 * ArcGIS is answered by a local fake layer so the test is deterministic and offline.
 */

const countries = ['Egypt', 'Morocco', 'Serbia', 'Ethiopia', 'Somalia']
const types = ['Greenhouse', 'Nethouse', 'Glasshouse']
const rows = Array.from({ length: 60 }, (_, i) => ({
  OBJECTID: i + 1,
  Farm_Name: `Farm ${i + 1}`,
  Country: countries[i % 5],
  Type: types[i % 3],
  Area: 5 + (i % 7) * 2.5,
}))
const fields = [
  { name: 'OBJECTID', alias: 'OBJECTID', type: 'esriFieldTypeOID' },
  { name: 'Farm_Name', alias: 'Farm name', type: 'esriFieldTypeString' },
  { name: 'Country', alias: 'Country', type: 'esriFieldTypeString' },
  { name: 'Type', alias: 'Structure type', type: 'esriFieldTypeString' },
  { name: 'Area', alias: 'Area (ha)', type: 'esriFieldTypeDouble' },
]

async function fakeArcgis(page: Page) {
  await page.route(/arcgis\.com|arcgisonline|google\.com\/vt|sentinel-hub|planetarycomputer/, async route => {
    const url = route.request().url()
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
    if (!/arcgis\.com\/.*FeatureServer/.test(url)) return route.fulfill({ status: 404, body: '' })
    if (/FeatureServer\?f=/.test(url)) return json({ layers: [{ id: 21, name: 'Agro_Structures' }], tables: [{ id: 32, name: 'Crops_Planted' }] })
    if (/\/query\?/.test(url)) {
      if (/returnCountOnly=true/.test(url)) return json({ count: rows.length })
      if (/f=geojson/.test(url)) {
        return json({
          type: 'FeatureCollection',
          features: rows.map(r => ({ type: 'Feature', properties: r, geometry: { type: 'Point', coordinates: [30 + r.OBJECTID * 0.1, 25] } })),
        })
      }
      return json({ features: rows.map(r => ({ attributes: r })), exceededTransferLimit: false })
    }
    return json({ name: 'Agro_Structures', geometryType: 'esriGeometryPolygon', fields })
  })
}

const indicatorValue = (page: Page) => page.locator('.deb-el--indicator .deb-indicator__value').last()
const panel = (page: Page, name: string) => page.getByRole('complementary', { name: new RegExp(`${name} properties`) })

test.describe('Dashboard Builder', () => {
  test.skip(({ isMobile }) => isMobile, 'Layout editing is a desktop workflow')

  test('add, configure, cross-filter, delete/undo and persist elements', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('agroSplashShown', '1')
      localStorage.setItem('currentUser', JSON.stringify({ id: 1, name: 'Admin', email: 'admin@example.com', role: 'Admin' }))
    })
    await fakeArcgis(page)
    await page.goto('/AgroCloud/#/dashboard/develop')

    await page.getByRole('button', { name: /Edit layout/i }).click()
    await expect(page.getByRole('complementary', { name: 'Element library' })).toBeVisible()

    // Drag a chart from the library onto the grid.
    const grid = page.locator('.develop-elite__dashboard-grid')
    const box = (await grid.boundingBox())!
    await page.locator('.deb-lib-item', { hasText: 'Bar / line chart' }).dragTo(grid, { targetPosition: { x: 40, y: box.height - 60 } })
    const chartPanel = panel(page, 'Bar / line chart')
    await expect(chartPanel.getByText(/60 records · 5 fields/)).toBeVisible()
    await chartPanel.getByLabel('Category field').selectOption('Country')
    await chartPanel.getByRole('textbox', { name: 'Element title' }).fill('Farms by country')
    await expect(page.locator('.deb-el--serial-chart canvas')).toBeVisible()

    // Click to add a selector and an indicator.
    await page.locator('.deb-lib-item', { hasText: 'Category selector' }).click()
    const selPanel = panel(page, 'Category selector')
    await expect(selPanel.getByText(/records · /)).toBeVisible()
    await selPanel.getByLabel('Field to filter by').selectOption('Country')
    await selPanel.getByRole('tab', { name: 'Display' }).click()
    await selPanel.getByLabel('Style').selectOption('buttons')

    await page.locator('.deb-lib-item', { hasText: 'Indicator' }).click()
    await panel(page, 'Indicator').getByRole('textbox', { name: 'Element title' }).fill('Farms')
    await expect(indicatorValue(page)).toHaveText('60')

    // Selector → filters the indicator and the chart.
    await page.locator('.deb-selector--buttons .deb-pill', { hasText: 'Egypt' }).click()
    await expect(indicatorValue(page)).toHaveText('12')
    await expect(page.locator('.deb-el--serial-chart .deb-chip', { hasText: 'Filtered' })).toBeVisible()
    await page.locator('.deb-selector--buttons .deb-pill', { hasText: 'All' }).click()
    await expect(indicatorValue(page)).toHaveText('60')

    // Element filter condition.
    await page.locator('.deb-el--indicator').last().click()
    const indPanel = panel(page, 'Indicator')
    await indPanel.getByRole('button', { name: 'Add condition' }).click()
    const cond = indPanel.locator('.deb-filter').first()
    await cond.getByLabel('Filter field').selectOption('Area')
    await cond.getByLabel('Condition', { exact: true }).selectOption('>=')
    await cond.getByLabel('Value', { exact: true }).fill('15')
    await expect(indicatorValue(page)).toHaveText('24')

    // Delete (with confirmation) and undo.
    await indPanel.getByRole('button', { name: 'Delete' }).click()
    await indPanel.getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('.deb-el--indicator')).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('.deb-el--indicator')).toHaveCount(1)

    // Done + reload keeps everything.
    await page.getByRole('button', { name: /Done/ }).click()
    await page.reload()
    await expect(page.locator('.deb-el__title', { hasText: 'Farms by country' })).toBeVisible()
    await expect(indicatorValue(page)).toHaveText('24')
  })
})
