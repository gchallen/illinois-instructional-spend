import { parse } from "node-html-parser"
import { readFileSync } from "fs"
import { resolve } from "path"

const HTML_FILE = resolve(import.meta.dir, "../uiuc-graybook.html")

const FACULTY_CLASSES = new Set(["AA", "AB", "AL", "AM"])

export type FacultyType = "teaching" | "tenure_track" | "research" | "clinical" | "other"

export interface Position {
  title: string
  emplClass: string
  presentFte: number
  presentSalary: number
  proposedSalary: number
}

export interface FacultyMember {
  name: string
  positions: Position[]
}

export interface ProcessedFaculty {
  name: string
  facultyType: FacultyType
  totalPresentSalary: number
  totalProposedSalary: number
  totalFte: number
  primaryTitle: string
}

function parseSalary(s: string): number {
  return parseFloat(s.replace(/[$,]/g, "").trim()) || 0
}

export function getFacultyType(title: string): FacultyType {
  const t = title.toUpperCase()
  if (["TCH ", "TEACHING", "SR. LECTURER", "SR LECTURER", "LECTURER", "INSTR"].some((kw) => t.includes(kw))) {
    return "teaching"
  }
  if (t.includes("RES ") && (t.includes("PROF") || t.includes("ASSOC") || t.includes("ASST"))) {
    return "research"
  }
  if (t.includes("CLIN") || t.includes("CLINICAL")) {
    return "clinical"
  }
  if (t.includes("PROF")) {
    return "tenure_track"
  }
  return "other"
}

export function parseDepartment(deptId: string): FacultyMember[] {
  const htmlContent = readFileSync(HTML_FILE, "utf-8")
  const root = parse(htmlContent)

  const h3 = root.querySelector(`h3#${deptId}`)
  if (!h3) throw new Error(`Department ${deptId} not found`)

  const table = h3.nextElementSibling
  if (!table || table.tagName !== "TABLE") throw new Error(`No table after ${deptId}`)

  const members: FacultyMember[] = []
  const rows = table.querySelectorAll("tr")

  for (const row of rows) {
    const cells = row.querySelectorAll("td")
    if (cells.length < 8) continue

    const title = cells[1].textContent.trim()
    if (title.includes("Employee Total")) continue

    const name = cells[0].textContent.trim()
    const emplClass = cells[3].textContent.trim()
    const presentFte = parseFloat(cells[4].textContent.trim()) || 0
    const presentSalary = parseSalary(cells[6].textContent)
    const proposedSalary = parseSalary(cells[7].textContent)

    const position: Position = { title, emplClass, presentFte, presentSalary, proposedSalary }

    if (members.length > 0 && (!name || name === members[members.length - 1].name)) {
      members[members.length - 1].positions.push(position)
    } else {
      members.push({ name, positions: [position] })
    }
  }

  return members
}

export function processFaculty(members: FacultyMember[]): ProcessedFaculty[] {
  return members
    .map((m) => {
      const facultyPositions = m.positions.filter((p) => FACULTY_CLASSES.has(p.emplClass))
      if (facultyPositions.length === 0) return null

      const primary =
        facultyPositions.filter((p) => p.presentSalary > 0).sort((a, b) => b.presentSalary - a.presentSalary)[0] ||
        facultyPositions[0]

      const totalPresentSalary = facultyPositions.reduce((s, p) => s + p.presentSalary, 0)
      const totalProposedSalary = facultyPositions.reduce((s, p) => s + p.proposedSalary, 0)
      const totalFte = facultyPositions.reduce((s, p) => s + p.presentFte, 0)

      if (totalPresentSalary === 0 && totalProposedSalary === 0) return null
      if (totalFte === 0) return null // Filter endowed chair stipends with no actual appointment

      return {
        name: m.name,
        facultyType: getFacultyType(primary.title),
        totalPresentSalary,
        totalProposedSalary,
        totalFte,
        primaryTitle: primary.title,
      }
    })
    .filter((f): f is ProcessedFaculty => f !== null)
}

export interface GrayBookDepartment {
  id: string
  number: string
  name: string
}

export function getAllGrayBookDepartments(): GrayBookDepartment[] {
  const htmlContent = readFileSync(HTML_FILE, "utf-8")
  const root = parse(htmlContent)

  const departments: GrayBookDepartment[] = []
  const h3s = root.querySelectorAll("h3[id]")

  for (const h3 of h3s) {
    const id = h3.getAttribute("id")
    if (!id || !/^c\d+-d\d+$/.test(id)) continue

    const text = h3.textContent.trim()
    const match = /^(\d+)\s*-\s*(.+)$/.exec(text)
    if (match) {
      departments.push({ id, number: match[1], name: match[2] })
    }
  }

  return departments
}
