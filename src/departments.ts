import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { fetchAllSubjects, type CISSubject } from "./cis"
import { getAllGrayBookDepartments, type GrayBookDepartment } from "./salaries"

const MAPPING_FILE = resolve(import.meta.dir, "../department-mapping.json")

export interface DepartmentMapping {
  cisSubject: string
  cisName: string
  grayBookId: string
  grayBookName: string
  matchScore: number
  matchMethod: string
}

const MANUAL_OVERRIDES: Record<string, string> = {
  // Engineering (c17)
  CS: "c17-d21",   // Siebel School Comp & Data Sci
  ECE: "c17-d7",   // Electrical & Computer Eng
  ME: "c17-d16",   // Mechanical Sci & Engineering
  AE: "c17-d1",    // Aerospace Engineering
  CEE: "c17-d4",   // Civil & Environmental Eng
  MSE: "c17-d15",  // Materials Science & Engineerng
  IE: "c17-d12",   // Industrial&Enterprise Sys Eng
  NPRE: "c17-d18", // Nuclear, Plasma, & Rad Engr
  BIOE: "c17-d3",  // Bioengineering
  PHYS: "c17-d19", // Physics

  // LAS Sciences (c20)
  MATH: "c20-d42",  // Mathematics
  STAT: "c20-d63",  // Statistics
  CHEM: "c20-d15",  // Chemistry
  CHBE: "c20-d14",  // Chemical & Biomolecular Engr
  ECON: "c20-d25",  // Economics
  PSYC: "c20-d51",  // Psychology
  SOC: "c20-d60",   // Sociology
  HIST: "c20-d35",  // History
  PHIL: "c20-d46",  // Philosophy
  PS: "c20-d48",    // Political Science
  ENGL: "c20-d26",  // English
  LING: "c20-d41",  // Linguistics
  ANTH: "c20-d4",   // Anthropology
  SPAN: "c20-d61",  // Spanish and Portuguese
  FR: "c20-d30",    // French and Italian
  GER: "c20-d33",   // Germanic Languages & Lit
  MCB: "c20-d58",   // School of Molecular & Cell Bio
  IB: "c20-d57",    // School of Integrative Biology
  MIP: "c20-d44",   // Molecular & Integrative Physl
  MICR: "c20-d43",  // Microbiology
  ASTR: "c20-d7",   // Astronomy
  ATMS: "c20-d17",  // Climate Meteorology & Atm Sci
  GGIS: "c20-d32",  // Geography & GIS
  GEOL: "c20-d24",  // Earth Sci & Environmental Chng
  CMN: "c20-d19",   // Communication
  AFRO: "c20-d2",   // African American Studies
  GWS: "c20-d31",   // Gender and Women's Studies
  EALC: "c20-d23",  // E. Asian Languages & Cultures
  REL: "c20-d52",   // Religion
  CDB: "c20-d10",   // Cell & Developmental Biology
  ENT: "c20-d27",   // Entomology
  ASRM: "c20-d1",   // Actuarial Sci and Risk Mgmt
  CWL: "c20-d20",   // Comparative & World Literature
  NEUR: "c20-d45",  // Neuroscience Program
  SLCL: "c20-d59",  // Slavic Languages & Literature

  // ACES (c1)
  ABE: "c1-d6",    // Agricultural & Biological Engr
  ANSC: "c1-d7",   // Animal Sciences
  CPSC: "c1-d9",   // Crop Sciences
  FSHN: "c1-d10",  // Food Science & Human Nutrition
  NRES: "c1-d12",  // Natural Res & Env Sci
  ACE: "c1-d4",    // Agr & Consumer Economics
  HDFS: "c1-d11",  // Human Dvlpmt & Family Studies
  NUTR: "c1-d13",  // Nutritional Sciences

  // Gies Business (c15)
  ACCY: "c15-d1",  // Accountancy
  FIN: "c15-d6",   // Finance
  BADM: "c15-d2",  // Business Administration

  // College of Media (c8)
  ADV: "c8-d1",    // Advertising
  JOUR: "c8-d10",  // Journalism
  MACS: "c8-d11",  // Media and Cinema Studies

  // Fine and Applied Arts (c14)
  ARCH: "c14-d1",  // Architecture
  DANC: "c14-d3",  // Dance
  LA: "c14-d8",    // Landscape Architecture
  MUS: "c14-d9",   // Music
  THEA: "c14-d10", // Theatre
  UP: "c14-d11",   // Urban & Regional Planning

  // Education (c11)
  CI: "c11-d4",    // Curriculum and Instruction
  EPOL: "c11-d5",  // Educ Policy, Orgzn & Leadrshp
  EPSY: "c11-d7",  // Educational Psychology
  SPED: "c11-d8",  // Special Education

  // Applied Health Sciences (c2)
  HK: "c2-d5",    // Health and Kinesiology
  RST: "c2-d6",   // Recreation, Sport and Tourism
  SHS: "c2-d7",   // Speech & Hearing Science

  // Other colleges
  LAW: "c19-d1",   // Law
  IS: "c25-d2",    // Information Sciences
  INFO: "c25-d1",  // Informatics
  SOCW: "c27-d1",  // School of Social Work
  LER: "c26-d1",   // School of Labor & Empl. Rel.
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(dept|department|program|school|college|division|of|the|for|in|and)\b/g, " ")
    .replace(/\beng\b/g, "engineering")
    .replace(/\bsci\b/g, "science")
    .replace(/\bcomp\b/g, "computer")
    .replace(/\badmn?\b/g, "administration")
    .replace(/\bldrshp\b/g, "leadership")
    .replace(/\beduc?\b/g, "education")
    .replace(/\bcomm\b/g, "communication")
    .replace(/\bdvlpmt\b/g, "development")
    .replace(/\bres\b/g, "resources")
    .replace(/\benv\b/g, "environmental")
    .replace(/\bsvcs?\b/g, "services")
    .replace(/\bctr\b/g, "center")
    .replace(/\bassoc\b/g, "associate")
    .replace(/\binfo\b/g, "information")
    .replace(/\btechnol\b/g, "technology")
    .replace(/\bbiolog\b/g, "biological")
    .replace(/\bengr\b/g, "engineering")
    .replace(/\bmech\b/g, "mechanical")
    .replace(/\belec\b/g, "electrical")
    .replace(/\bmatl?s?\b/g, "materials")
    .replace(/\baero\b/g, "aerospace")
    .replace(/\bagr\b/g, "agricultural")
    .replace(/\bnatl?\b/g, "natural")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter((w) => w.length > 2))
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const w of a) {
    if (b.has(w)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export async function loadOrCreateMapping(): Promise<DepartmentMapping[]> {
  if (existsSync(MAPPING_FILE)) {
    console.log("  Loading saved department mapping...")
    return JSON.parse(readFileSync(MAPPING_FILE, "utf-8"))
  }

  console.log("  Auto-generating department mapping...")

  const cisSubjects = await fetchAllSubjects()
  const grayBookDepts = getAllGrayBookDepartments()

  console.log(`  CIS subjects: ${cisSubjects.length}, Grey Book departments: ${grayBookDepts.length}`)

  const mappings: DepartmentMapping[] = []
  const usedGrayBook = new Set<string>()
  const unmatchedCIS: CISSubject[] = []

  // Apply manual overrides first
  for (const subject of cisSubjects) {
    const override = MANUAL_OVERRIDES[subject.code]
    if (override) {
      const gbDept = grayBookDepts.find((d) => d.id === override)
      if (gbDept) {
        mappings.push({
          cisSubject: subject.code,
          cisName: subject.name,
          grayBookId: gbDept.id,
          grayBookName: gbDept.name,
          matchScore: 1.0,
          matchMethod: "manual",
        })
        usedGrayBook.add(gbDept.id)
      }
    }
  }

  // Auto-match remaining by name similarity
  for (const subject of cisSubjects) {
    if (MANUAL_OVERRIDES[subject.code]) continue

    const subjectTokens = tokenize(subject.name)
    let bestScore = 0
    let bestDept: GrayBookDepartment | null = null

    for (const dept of grayBookDepts) {
      if (usedGrayBook.has(dept.id)) continue
      const deptTokens = tokenize(dept.name)
      const score = jaccardScore(subjectTokens, deptTokens)
      if (score > bestScore) {
        bestScore = score
        bestDept = dept
      }
    }

    if (bestDept && bestScore > 0.4) {
      mappings.push({
        cisSubject: subject.code,
        cisName: subject.name,
        grayBookId: bestDept.id,
        grayBookName: bestDept.name,
        matchScore: bestScore,
        matchMethod: "auto",
      })
      usedGrayBook.add(bestDept.id)
    } else {
      unmatchedCIS.push(subject)
    }
  }

  const unmatchedGB = grayBookDepts.filter((d) => !usedGrayBook.has(d.id))

  console.log(`  Mapped: ${mappings.length} departments`)
  console.log(`  Unmatched CIS subjects: ${unmatchedCIS.length}`)
  console.log(`  Unmatched Grey Book departments: ${unmatchedGB.length}`)

  if (unmatchedCIS.length > 0) {
    console.log("\n  Unmatched CIS subjects:")
    for (const s of unmatchedCIS.slice(0, 20)) {
      console.log(`    ${s.code} - ${s.name}`)
    }
    if (unmatchedCIS.length > 20) console.log(`    ... and ${unmatchedCIS.length - 20} more`)
  }

  writeFileSync(MAPPING_FILE, JSON.stringify(mappings, null, 2))
  console.log(`  Mapping saved to department-mapping.json`)

  return mappings
}
