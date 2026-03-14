import { chromium } from "playwright"
import { resolve } from "path"

const OUTPUT_DIR = resolve(import.meta.dir, "../output")
const REPORT_PATH = resolve(OUTPUT_DIR, "report.html")

async function screenshot() {
  const selector = process.argv[2] || null
  const outName = process.argv[3] || (selector ? "section.png" : "report.png")
  const outPath = resolve(OUTPUT_DIR, outName)

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`file://${REPORT_PATH}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)

  if (selector) {
    const locator = page.locator(selector)
    if ((await locator.count()) > 0) {
      await locator.screenshot({ path: outPath })
      console.log(`Screenshot of "${selector}" → output/${outName}`)
    } else {
      console.error(`Selector "${selector}" not found, taking full page`)
      await page.screenshot({ path: outPath, fullPage: true })
    }
  } else {
    await page.screenshot({ path: outPath, fullPage: true })
    console.log(`Full page screenshot → output/${outName}`)
  }

  await browser.close()
}

screenshot().catch(console.error)
