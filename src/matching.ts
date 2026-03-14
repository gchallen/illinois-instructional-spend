import type { ProcessedFaculty } from "./salaries"
import type { CISCourse, CISInstructor } from "./cis"

export interface CourseTeaching {
  subject: string
  number: string
  label: string
  sections: { sectionNumber: string; crn: number }[]
}

export interface MatchedFaculty {
  faculty: ProcessedFaculty
  coursesTeaching: CourseTeaching[]
}

export interface MatchResult {
  matched: MatchedFaculty[]
  unmatchedFaculty: ProcessedFaculty[]
  nameCollisions: string[]
}

function normalizeLastName(name: string): string {
  return name.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim()
}

export function extractNameParts(grayBookName: string): { lastName: string; firstInitial: string } | null {
  // Grey Book format: "LastName, FirstName MiddleName" or "LastName, FirstName"
  const parts = grayBookName.split(",")
  if (parts.length < 2) return null

  const lastName = normalizeLastName(parts[0])
  const firstPart = parts[1].trim().split(/\s+/)[0]
  if (!firstPart) return null

  return { lastName, firstInitial: firstPart[0].toLowerCase() }
}

/** Section types excluded from matching (not classroom instruction) */
const EXCLUDED_SECTION_TYPES = new Set(["IND"])

/**
 * Match a department's Grey Book faculty against CIS courses for specific subjects.
 * Courses are scoped to the department's mapped CIS subjects to avoid name collisions.
 * Sections with excluded types (e.g. Independent Study) are filtered out before matching.
 */
export function matchFacultyToCourses(
  faculty: ProcessedFaculty[],
  courses: CISCourse[],
): MatchResult {
  const matched: MatchedFaculty[] = []
  const unmatchedFaculty: ProcessedFaculty[] = []

  // Build a lookup of CIS instructors from the scoped courses, excluding non-instructional sections
  const cisInstructors = new Map<string, { instructor: CISInstructor; courses: { subject: string; number: string; label: string; sectionNumber: string; crn: number }[] }>()

  for (const course of courses) {
    for (const section of course.sections) {
      if (EXCLUDED_SECTION_TYPES.has(section.typeCode)) continue
      for (const instr of section.instructors) {
        const cisLastName = normalizeLastName(instr.lastName)
        const cisFirstInitial = instr.firstName.toLowerCase().charAt(0)
        const key = `${cisLastName}|${cisFirstInitial}`

        if (!cisInstructors.has(key)) {
          cisInstructors.set(key, { instructor: instr, courses: [] })
        }
        cisInstructors.get(key)!.courses.push({
          subject: course.subject,
          number: course.number,
          label: course.label,
          sectionNumber: section.sectionNumber,
          crn: section.crn,
        })
      }
    }
  }

  for (const f of faculty) {
    const nameParts = extractNameParts(f.name)
    if (!nameParts) {
      unmatchedFaculty.push(f)
      continue
    }

    const key = `${nameParts.lastName}|${nameParts.firstInitial}`
    const entry = cisInstructors.get(key)

    if (entry) {
      // Group by course (subject + number)
      const courseMap = new Map<string, CourseTeaching>()
      for (const c of entry.courses) {
        const courseKey = `${c.subject}-${c.number}`
        if (!courseMap.has(courseKey)) {
          courseMap.set(courseKey, { subject: c.subject, number: c.number, label: c.label, sections: [] })
        }
        courseMap.get(courseKey)!.sections.push({ sectionNumber: c.sectionNumber, crn: c.crn })
      }
      matched.push({ faculty: f, coursesTeaching: [...courseMap.values()] })
    } else {
      unmatchedFaculty.push(f)
    }
  }

  // Detect name collisions: Grey Book faculty sharing the same lastName|firstInitial key
  const nameKeyMap = new Map<string, string[]>()
  for (const f of faculty) {
    const parts = extractNameParts(f.name)
    if (!parts) continue
    const key = `${parts.lastName}|${parts.firstInitial}`
    if (!nameKeyMap.has(key)) nameKeyMap.set(key, [])
    nameKeyMap.get(key)!.push(f.name)
  }
  const nameCollisions: string[] = []
  for (const [key, names] of nameKeyMap) {
    if (names.length > 1) {
      nameCollisions.push(`${key}: ${names.join(", ")}`)
    }
  }

  return { matched, unmatchedFaculty, nameCollisions }
}
