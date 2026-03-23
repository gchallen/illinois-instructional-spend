import { readFileSync } from "fs"
import { resolve } from "path"
import { generateReport } from "./report"

const resultsPath = resolve(import.meta.dir, "../output/results.json")
const results = JSON.parse(readFileSync(resultsPath, "utf-8"))
generateReport(results)
console.log("Done.")
