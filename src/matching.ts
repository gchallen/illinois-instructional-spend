import type { ProcessedFaculty } from "./salaries"
import type { CISCourse, CISInstructor } from "./cis"
import type { GPAInstructor } from "./gpa"

export interface MatchedFaculty {
  faculty: ProcessedFaculty
  coursesTeaching: { subject: string; number: string; label: string; sections: string[] }[]
}

export interface MatchResult {
  matched: MatchedFaculty[]
  unmatchedFaculty: ProcessedFaculty[]
  unmatchedInstructors: CISInstructor[]
  nameCollisions: string[]
  gpaConfirmed: number
  gpaOnlyInstructors: number
}

function normalizeLastName(name: string): string {
  return name.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim()
}

function extractNameParts(grayBookName: string): { lastName: string; firstInitial: string } | null {
  // Grey Book format: "LastName, FirstName MiddleName" or "LastName, FirstName"
  const parts = grayBookName.split(",")
  if (parts.length < 2) return null

  const lastName = normalizeLastName(parts[0])
  const firstPart = parts[1].trim().split(/\s+/)[0]
  if (!firstPart) return null

  return { lastName, firstInitial: firstPart[0].toLowerCase() }
}

export function matchFacultyToCourses(
  faculty: ProcessedFaculty[],
  courses: CISCourse[],
  gpaLookup?: Map<string, GPAInstructor[]>,
): MatchResult {
  const matched: MatchedFaculty[] = []
  const unmatchedFaculty: ProcessedFaculty[] = []

  // Build a lookup of all CIS instructors for quick matching
  const allCISInstructors = new Map<string, { instructor: CISInstructor; courses: { subject: string; number: string; label: string; section: string }[] }>()

  for (const course of courses) {
    for (const section of course.sections) {
      for (const instr of section.instructors) {
        const key = `${instr.lastName.toLowerCase()}|${instr.firstName.toLowerCase()}`
        if (!allCISInstructors.has(key)) {
          allCISInstructors.set(key, { instructor: instr, courses: [] })
        }
        allCISInstructors.get(key)!.courses.push({
          subject: course.subject,
          number: course.number,
          label: course.label,
          section: section.sectionNumber,
        })
      }
    }
  }

  // Track which CIS instructors got matched
  const matchedCISKeys = new Set<string>()

  for (const f of faculty) {
    const nameParts = extractNameParts(f.name)
    if (!nameParts) {
      unmatchedFaculty.push(f)
      continue
    }

    // Search CIS instructors for matching (lastName, firstInitial)
    let found = false
    const coursesTeaching: MatchedFaculty["coursesTeaching"] = []

    for (const [key, entry] of allCISInstructors) {
      const cisLastName = normalizeLastName(entry.instructor.lastName)
      const cisFirstInitial = entry.instructor.firstName.toLowerCase().charAt(0)

      if (cisLastName === nameParts.lastName && cisFirstInitial === nameParts.firstInitial) {
        matchedCISKeys.add(key)
        found = true

        // Group by course
        const courseMap = new Map<string, { subject: string; number: string; label: string; sections: string[] }>()
        for (const c of entry.courses) {
          const courseKey = `${c.subject}-${c.number}`
          if (!courseMap.has(courseKey)) {
            courseMap.set(courseKey, { subject: c.subject, number: c.number, label: c.label, sections: [] })
          }
          courseMap.get(courseKey)!.sections.push(c.section)
        }
        coursesTeaching.push(...courseMap.values())
      }
    }

    if (found) {
      matched.push({ faculty: f, coursesTeaching })
    } else {
      unmatchedFaculty.push(f)
    }
  }

  // Collect unmatched CIS instructors
  const unmatchedInstructors: CISInstructor[] = []
  for (const [key, entry] of allCISInstructors) {
    if (!matchedCISKeys.has(key)) {
      unmatchedInstructors.push(entry.instructor)
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

  // GPA cross-check: validate matches against historical GPA data
  let gpaConfirmed = 0
  let gpaOnlyInstructors = 0

  if (gpaLookup && gpaLookup.size > 0) {
    const matchedKeys = new Set<string>()
    for (const m of matched) {
      const parts = extractNameParts(m.faculty.name)
      if (!parts) continue
      const key = `${parts.lastName}|${parts.firstInitial}`
      matchedKeys.add(key)
      if (gpaLookup.has(key)) {
        gpaConfirmed++
      }
    }

    // Count GPA instructors not matched to any Grey Book faculty
    for (const key of gpaLookup.keys()) {
      if (!matchedKeys.has(key)) {
        gpaOnlyInstructors++
      }
    }
  }

  return { matched, unmatchedFaculty, unmatchedInstructors, nameCollisions, gpaConfirmed, gpaOnlyInstructors }
}
