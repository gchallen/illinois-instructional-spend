import { cachedFetch, ONE_WEEK } from "./cache"

const GPA_CSV_URL =
  "https://raw.githubusercontent.com/wadefagen/datasets/refs/heads/main/gpa/uiuc-gpa-dataset.csv"

export interface GPAInstructor {
  lastName: string
  firstName: string
  subject: string
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

function parseInstructorName(name: string): { lastName: string; firstName: string } | null {
  if (!name || name === "?" || name === "STAFF") return null
  const parts = name.split(",")
  if (parts.length < 2) return null
  const lastName = parts[0].trim()
  const firstName = parts[1].trim().split(/\s+/)[0] // First name only, drop middle initial
  if (!lastName || !firstName) return null
  return { lastName, firstName }
}

/**
 * Fetch and parse the UIUC GPA dataset.
 * Returns a map: subject → Set of "lastname|firstname" keys (lowercased).
 * Only includes recent semesters (2022+) for relevance.
 */
export async function fetchGPAInstructors(): Promise<Map<string, Map<string, GPAInstructor>>> {
  const csv = await cachedFetch<string>("gpa-dataset-csv", ONE_WEEK, async () => {
    console.log("    Downloading GPA dataset...")
    const response = await fetch(GPA_CSV_URL)
    if (!response.ok) throw new Error(`Failed to fetch GPA data: ${response.status}`)
    return response.text()
  })

  const lines = csv.split("\n")
  const header = parseCSVLine(lines[0])

  const yearIdx = header.indexOf("Year")
  const subjectIdx = header.indexOf("Subject")
  const instructorIdx = header.indexOf("Primary Instructor")

  if (yearIdx < 0 || subjectIdx < 0 || instructorIdx < 0) {
    throw new Error(`GPA CSV missing expected columns. Found: ${header.join(", ")}`)
  }

  // subject → Map<"lastname|firstname", GPAInstructor>
  const result = new Map<string, Map<string, GPAInstructor>>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)
    const year = parseInt(fields[yearIdx])
    if (year < 2022) continue // Only recent data

    const subject = fields[subjectIdx]
    const instructorRaw = fields[instructorIdx]
    const parsed = parseInstructorName(instructorRaw)
    if (!parsed) continue

    const key = `${parsed.lastName.toLowerCase()}|${parsed.firstName.toLowerCase()}`

    if (!result.has(subject)) result.set(subject, new Map())
    if (!result.get(subject)!.has(key)) {
      result.get(subject)!.set(key, {
        lastName: parsed.lastName,
        firstName: parsed.firstName,
        subject,
      })
    }
  }

  return result
}

/**
 * Build a full-name lookup for cross-checking.
 * Returns a map: "lastname|firstinitial" → array of full GPAInstructor entries for a given subject.
 * This helps resolve name collisions and validate matches.
 */
export function buildNameLookup(
  gpaData: Map<string, Map<string, GPAInstructor>>,
  subject: string,
): Map<string, GPAInstructor[]> {
  const lookup = new Map<string, GPAInstructor[]>()
  const subjectData = gpaData.get(subject)
  if (!subjectData) return lookup

  for (const instr of subjectData.values()) {
    const key = `${instr.lastName.toLowerCase()}|${instr.firstName[0].toLowerCase()}`
    if (!lookup.has(key)) lookup.set(key, [])
    lookup.get(key)!.push(instr)
  }

  return lookup
}
