import { readFileSync, watch, existsSync } from "fs"
import { resolve } from "path"
import type { DepartmentAnalysis } from "./analysis"

const PORT = 3456
const SRC_DIR = resolve(import.meta.dir)
const OUTPUT_DIR = resolve(import.meta.dir, "../output")
const REPORT_FILE = resolve(OUTPUT_DIR, "report.html")
const RESULTS_FILE = resolve(OUTPUT_DIR, "results.json")
const REPORT_MODULE = resolve(SRC_DIR, "report.ts")

// Track SSE clients for live reload
const clients = new Set<ReadableStreamDefaultController>()

function notifyClients() {
  for (const controller of clients) {
    try {
      controller.enqueue("data: reload\n\n")
    } catch {
      clients.delete(controller)
    }
  }
}

async function regenerateReport() {
  try {
    const results: DepartmentAnalysis[] = JSON.parse(readFileSync(RESULTS_FILE, "utf-8"))
    // Cache-bust the import so Bun re-evaluates the module on each change
    const mod = await import(REPORT_MODULE + "?t=" + Date.now())
    mod.generateReport(results)
    console.log(`  Report regenerated (${new Date().toLocaleTimeString()})`)
    notifyClients()
  } catch (e: any) {
    console.log(`  Regeneration failed: ${e.message}`)
  }
}

// Watch src directory — regenerate report when source changes
let debounce: ReturnType<typeof setTimeout> | null = null
watch(SRC_DIR, { recursive: true }, (_event, filename) => {
  if (!filename || filename.includes("dev-server")) return
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    console.log(`  ${filename} changed`)
    regenerateReport()
  }, 200)
})

// Inject live-reload script into HTML
function injectReloadScript(html: string): string {
  const script = `<script>
    (function() {
      const es = new EventSource('/__reload');
      es.onmessage = () => location.reload();
      es.onerror = () => setTimeout(() => location.reload(), 2000);
    })();
  </script>`
  return html.replace("</body>", script + "\n</body>")
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  fetch(req) {
    const url = new URL(req.url)

    // SSE endpoint for live reload
    if (url.pathname === "/__reload") {
      const stream = new ReadableStream({
        start(controller) {
          clients.add(controller)
          req.signal.addEventListener("abort", () => clients.delete(controller))
        },
      })
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    // Serve report.html (with reload script injected)
    if (url.pathname === "/" || url.pathname === "/report.html") {
      try {
        const html = readFileSync(REPORT_FILE, "utf-8")
        return new Response(injectReloadScript(html), {
          headers: { "Content-Type": "text/html" },
        })
      } catch {
        return new Response("report.html not found — run `bun run start` first to generate initial data", { status: 404 })
      }
    }

    // Serve other files from output dir
    const filePath = resolve(OUTPUT_DIR, url.pathname.slice(1))
    if (filePath.startsWith(OUTPUT_DIR)) {
      try {
        return new Response(Bun.file(filePath))
      } catch {
        return new Response("Not found", { status: 404 })
      }
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Dev server running at http://localhost:${PORT}`)
console.log(`Watching src/ for changes — report regenerates automatically`)
