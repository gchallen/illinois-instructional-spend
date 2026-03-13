import type { ProcessedFaculty } from "./salaries"
import type { CISCourse, CISInstructor } from "./cis"

export interface MatchedFaculty {
  faculty: ProcessedFaculty
  coursesTeaching: { subject: string; number: string; label: string; sections: string[] }[]
}

export interface MatchResult {
  matched: MatchedFaculty[]
  unmatchedFaculty: ProcessedFaculty[]
  unmatchedInstructors: CISInstructor[]
}

function extractNameParts(grayBookName: string): { lastName: string; firstInitial: string } | null {
  // Grey Book format: "LastName, FirstName MiddleName" or "LastName, FirstName"
  const parts = grayBookName.split(",")
  if (parts.length < 2) return null

  const lastName = parts[0].trim().toLowerCase()
  const firstPart = parts[1].trim().split(/\s+/)[0]
  if (!firstPart) return null

  return { lastName, firstInitial: firstPart[0].toLowerCase() }
}

export function matchFacultyToCourses(
  faculty: ProcessedFaculty[],
  courses: CISCourse[],
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
      const cisLastName = entry.instructor.lastName.toLowerCase()
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

  return { matched, unmatchedFaculty, unmatchedInstructors }
}
