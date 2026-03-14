import { existsSync, readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { fetchAllSubjects, type CISSubject } from "./cis"
import { getAllGrayBookDepartments, type GrayBookDepartment } from "./salaries"

const MAPPING_FILE = resolve(import.meta.dir, "../department-mapping.json")

export interface DepartmentMapping {
  grayBookId: string
  grayBookName: string
  cisSubjects: string[]
  matchMethod: string
}

/**
 * Grey Book department → CIS subject codes (one-to-many).
 * This is the authoritative mapping of which CIS subjects belong to each Grey Book department.
 */
const MANUAL_MAPPINGS: Record<string, string[]> = {
  // Engineering (c17)
  "c17-d1": ["AE"],                    // Aerospace Engineering
  "c17-d3": ["BIOE"],                  // Bioengineering
  "c17-d4": ["CEE"],                   // Civil & Environmental Eng
  "c17-d7": ["ECE"],                   // Electrical & Computer Eng
  "c17-d12": ["IE", "SE"],             // Industrial&Enterprise Sys Eng
  "c17-d15": ["MSE"],                  // Materials Science & Engineerng
  "c17-d16": ["ME", "TAM"],            // Mechanical Sci & Engineering
  "c17-d18": ["NPRE"],                 // Nuclear, Plasma, & Rad Engr
  "c17-d19": ["PHYS"],                 // Physics
  "c17-d21": ["CS"],                   // Siebel School Comp & Data Sci
  "c17-d22": ["TE"],                   // Technology Entrepreneur Ctr

  // LAS (c20)
  "c20-d1": ["ASRM"],                  // Actuarial Sci and Risk Mgmt
  "c20-d2": ["AFRO"],                  // African American Studies
  "c20-d3": ["AIS"],                   // American Indian Studies Prgrm
  "c20-d4": ["ANTH"],                  // Anthropology
  "c20-d6": ["AAS"],                   // Asian American Studies
  "c20-d7": ["ASTR"],                  // Astronomy
  "c20-d8": ["BIOC"],                  // Biochemistry
  "c20-d10": ["CDB"],                  // Cell & Developmental Biology
  "c20-d14": ["CHBE"],                 // Chemical & Biomolecular Engr
  "c20-d15": ["CHEM"],                 // Chemistry
  "c20-d16": ["CLCV", "GRK", "LAT"],  // Classics
  "c20-d17": ["ATMS"],                 // Climate Meteorology & Atm Sci
  "c20-d19": ["CMN"],                  // Communication
  "c20-d20": ["CWL"],                  // Comparative & World Literature
  "c20-d23": ["EALC", "CHIN", "JAPN", "KOR"], // E. Asian Languages & Cultures
  "c20-d24": ["GEOL", "ESE"],          // Earth Sci & Environmental Chng
  "c20-d25": ["ECON"],                 // Economics
  "c20-d26": ["ENGL", "CW", "RHET"],   // English
  "c20-d27": ["ENT"],                  // Entomology
  "c20-d29": ["IB"],                   // Evolution Ecology Behavior (IB = Integrative Biology)
  "c20-d30": ["FR", "ITAL"],           // French and Italian
  "c20-d31": ["GWS"],                  // Gender and Women's Studies
  "c20-d32": ["GGIS"],                 // Geography & GIS
  "c20-d33": ["GER", "SCAN"],          // Germanic Languages & Lit
  "c20-d34": ["GLBL"],                 // Global Studies Prog & Courses
  "c20-d35": ["HIST"],                 // History
  "c20-d38": ["LAST"],                 // Latin American & Carib Studies
  "c20-d39": ["LLS"],                  // Latina/Latino Studies
  "c20-d41": ["LING", "EIL", "ESL"],   // Linguistics
  "c20-d42": ["MATH"],                 // Mathematics
  "c20-d43": ["MICR"],                 // Microbiology
  "c20-d44": ["MIP"],                  // Molecular & Integrative Physl
  "c20-d46": ["PHIL"],                 // Philosophy
  // Plant Biology (c20-d47) — no dedicated CIS subject; faculty teach under IB, CPSC, NRES
  "c20-d48": ["PS"],                   // Political Science
  "c20-d51": ["PSYC"],                 // Psychology
  "c20-d52": ["REL"],                  // Religion
  "c20-d59": ["SLAV", "RUSS", "POL", "CZE", "BCS"], // Slavic Languages & Literature
  "c20-d60": ["SOC"],                  // Sociology
  "c20-d61": ["SPAN", "PORT"],         // Spanish and Portuguese
  "c20-d63": ["STAT"],                 // Statistics
  "c20-d66": ["TRST"],                 // Translation & Interpreting St

  // ACES (c1)
  "c1-d4": ["ACE"],                    // Agr & Consumer Economics
  "c1-d6": ["ABE"],                    // Agricultural & Biological Engr
  "c1-d7": ["ANSC"],                   // Animal Sciences
  "c1-d9": ["CPSC"],                   // Crop Sciences
  "c1-d10": ["FSHN"],                  // Food Science & Human Nutrition
  "c1-d11": ["HDFS"],                  // Human Dvlpmt & Family Studies
  "c1-d12": ["NRES"],                  // Natural Res & Env Sci

  // Gies Business (c15)
  "c15-d1": ["ACCY"],                  // Accountancy
  "c15-d2": ["BADM", "BDI"],           // Business Administration
  "c15-d6": ["FIN"],                   // Finance

  // College of Media (c8)
  "c8-d1": ["ADV"],                    // Advertising
  "c8-d10": ["JOUR"],                  // Journalism
  "c8-d11": ["MACS"],                  // Media and Cinema Studies

  // Fine and Applied Arts (c14)
  "c14-d1": ["ARCH"],                  // Architecture
  "c14-d2": ["ART", "ARTD", "ARTE", "ARTF", "ARTH", "ARTJ", "ARTS"], // Art & Design
  "c14-d3": ["DANC"],                  // Dance
  "c14-d8": ["LA"],                    // Landscape Architecture
  "c14-d9": ["MUS", "MUSC"],           // Music
  "c14-d10": ["THEA"],                 // Theatre
  "c14-d11": ["UP"],                   // Urban & Regional Planning

  // Education (c11)
  "c11-d4": ["CI"],                    // Curriculum and Instruction
  "c11-d5": ["EPOL"],                  // Educ Policy, Orgzn & Leadrshp
  "c11-d7": ["EPSY"],                  // Educational Psychology
  "c11-d8": ["SPED"],                  // Special Education

  // Applied Health Sciences (c2)
  "c2-d5": ["HK"],                     // Health and Kinesiology
  "c2-d6": ["RST"],                    // Recreation, Sport and Tourism
  "c2-d7": ["SHS"],                    // Speech & Hearing Science

  // Other
  "c19-d1": ["LAW"],                   // Law
  "c25-d1": ["INFO"],                  // Informatics
  "c25-d2": ["IS"],                    // Information Sciences
  "c26-d1": ["LER"],                   // School of Labor & Empl. Rel.
  "c27-d1": ["SOCW"],                  // School of Social Work

  // Vet Med (c33)
  "c33-d2": ["CB"],                    // Comparative Biosciences
  "c33-d4": ["PATH"],                  // Pathobiology
  "c33-d5": ["VCM", "VM"],             // Vet Clinical Medicine

  // AFRO/AFST distinction
  "c20-d45": ["NEUR"],                 // Neuroscience Program
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

  console.log("  Generating department mapping...")

  const cisSubjects = await fetchAllSubjects()
  const grayBookDepts = getAllGrayBookDepartments()

  console.log(`  CIS subjects: ${cisSubjects.length}, Grey Book departments: ${grayBookDepts.length}`)

  const mappings: DepartmentMapping[] = []
  const mappedGrayBook = new Set<string>()

  // Apply manual mappings (Grey Book ID → CIS subjects)
  for (const dept of grayBookDepts) {
    const manual = MANUAL_MAPPINGS[dept.id]
    if (manual) {
      mappings.push({
        grayBookId: dept.id,
        grayBookName: dept.name,
        cisSubjects: manual,
        matchMethod: "manual",
      })
      mappedGrayBook.add(dept.id)
    }
  }

  // Auto-match remaining Grey Book departments → CIS subjects by name similarity
  const usedCIS = new Set<string>()
  for (const m of mappings) {
    for (const s of m.cisSubjects) usedCIS.add(s)
  }

  for (const dept of grayBookDepts) {
    if (mappedGrayBook.has(dept.id)) continue

    const deptTokens = tokenize(dept.name)
    let bestScore = 0
    let bestSubject: CISSubject | null = null

    for (const subject of cisSubjects) {
      if (usedCIS.has(subject.code)) continue
      const subjectTokens = tokenize(subject.name)
      const score = jaccardScore(deptTokens, subjectTokens)
      if (score > bestScore) {
        bestScore = score
        bestSubject = subject
      }
    }

    if (bestSubject && bestScore > 0.4) {
      mappings.push({
        grayBookId: dept.id,
        grayBookName: dept.name,
        cisSubjects: [bestSubject.code],
        matchMethod: "auto",
      })
      mappedGrayBook.add(dept.id)
      usedCIS.add(bestSubject.code)
    }
  }

  const unmappedGB = grayBookDepts.filter((d) => !mappedGrayBook.has(d.id))

  console.log(`  Mapped: ${mappings.length} departments`)
  console.log(`  Unmapped Grey Book departments: ${unmappedGB.length}`)

  if (unmappedGB.length > 0) {
    console.log("\n  Unmapped Grey Book departments (no CIS subjects found):")
    for (const d of unmappedGB.slice(0, 20)) {
      console.log(`    ${d.id} - ${d.name}`)
    }
    if (unmappedGB.length > 20) console.log(`    ... and ${unmappedGB.length - 20} more`)
  }

  writeFileSync(MAPPING_FILE, JSON.stringify(mappings, null, 2))
  console.log(`  Mapping saved to department-mapping.json`)

  return mappings
}
