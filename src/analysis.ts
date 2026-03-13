import type { FacultyType } from "./salaries"
import type { MatchedFaculty, MatchResult } from "./matching"
import type { CISCourse } from "./cis"

export type Scenario = "realistic" | "generous" | "unlikely"

const INSTRUCTIONAL_FRACTIONS: Record<FacultyType, Record<Scenario, number>> = {
  teaching: { realistic: 0.7, generous: 0.7, unlikely: 0.7 },
  tenure_track: { realistic: 0.2, generous: 0.3, unlikely: 0.4 },
  research: { realistic: 0.2, generous: 0.3, unlikely: 0.4 },
  clinical: { realistic: 0.5, generous: 0.5, unlikely: 0.5 },
  other: { realistic: 0, generous: 0, unlikely: 0 },
}

export function getInstructionalFraction(type: FacultyType, scenario: Scenario): number {
  return INSTRUCTIONAL_FRACTIONS[type][scenario]
}

export interface DepartmentAnalysis {
  cisSubject: string
  cisName: string
  grayBookId: string
  grayBookName: string

  // Faculty counts
  totalFaculty: number
  matchedFaculty: number
  unmatchedFaculty: number
  unmatchedInstructors: number
  matchRate: number

  // Faculty by type
  teachingCount: number
  tenureTrackCount: number
  researchCount: number
  clinicalCount: number
  otherCount: number

  // Salary totals
  totalProposedSalary: number
  matchedProposedSalary: number

  // Instructional spend by scenario
  instructionalSpend: Record<Scenario, number>

  // Enrollment
  uniqueStudents: number
  totalCreditHours: number
  courseCount: number

  // Per-student and per-credit-hour
  perStudent: Record<Scenario, number>
  perCreditHour: Record<Scenario, number>
}

export function analyzeDepartment(
  cisSubject: string,
  cisName: string,
  grayBookId: string,
  grayBookName: string,
  matchResult: MatchResult,
  courses: CISCourse[],
  uniqueStudents: number,
): DepartmentAnalysis {
  const allFaculty = [...matchResult.matched.map((m) => m.faculty), ...matchResult.unmatchedFaculty]
  const totalFaculty = allFaculty.length

  const teachingCount = allFaculty.filter((f) => f.facultyType === "teaching").length
  const tenureTrackCount = allFaculty.filter((f) => f.facultyType === "tenure_track").length
  const researchCount = allFaculty.filter((f) => f.facultyType === "research").length
  const clinicalCount = allFaculty.filter((f) => f.facultyType === "clinical").length
  const otherCount = allFaculty.filter((f) => f.facultyType === "other").length

  const totalProposedSalary = allFaculty.reduce((s, f) => s + f.totalProposedSalary, 0)
  const matchedProposedSalary = matchResult.matched.reduce((s, m) => s + m.faculty.totalProposedSalary, 0)

  // Compute instructional spend — only for matched faculty
  const instructionalSpend: Record<Scenario, number> = { realistic: 0, generous: 0, unlikely: 0 }
  for (const scenario of ["realistic", "generous", "unlikely"] as Scenario[]) {
    for (const m of matchResult.matched) {
      const fraction = getInstructionalFraction(m.faculty.facultyType, scenario)
      instructionalSpend[scenario] += m.faculty.totalProposedSalary * fraction
    }
  }

  // Credit hours
  let totalCreditHours = 0
  for (const course of courses) {
    if (course.creditHours) {
      totalCreditHours += course.creditHours * course.sections.length
    }
  }

  const courseCount = courses.length
  const matchRate = totalFaculty > 0 ? matchResult.matched.length / totalFaculty : 0

  const perStudent: Record<Scenario, number> = { realistic: 0, generous: 0, unlikely: 0 }
  const perCreditHour: Record<Scenario, number> = { realistic: 0, generous: 0, unlikely: 0 }

  for (const scenario of ["realistic", "generous", "unlikely"] as Scenario[]) {
    if (uniqueStudents > 0) {
      perStudent[scenario] = instructionalSpend[scenario] / uniqueStudents
    }
    if (totalCreditHours > 0) {
      perCreditHour[scenario] = instructionalSpend[scenario] / totalCreditHours
    }
  }

  return {
    cisSubject,
    cisName,
    grayBookId,
    grayBookName,
    totalFaculty,
    matchedFaculty: matchResult.matched.length,
    unmatchedFaculty: matchResult.unmatchedFaculty.length,
    unmatchedInstructors: matchResult.unmatchedInstructors.length,
    matchRate,
    teachingCount,
    tenureTrackCount,
    researchCount,
    clinicalCount,
    otherCount,
    totalProposedSalary,
    matchedProposedSalary,
    instructionalSpend,
    uniqueStudents,
    totalCreditHours,
    courseCount,
    perStudent,
    perCreditHour,
  }
}
