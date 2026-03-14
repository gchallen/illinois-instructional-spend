import type { FacultyType } from "./salaries"
import type { MatchedFaculty, MatchResult } from "./matching"
import type { CISCourse } from "./cis"

export interface DataQualityFlags {
  excluded: boolean
  reasons: string[]
  matchRateWarning: boolean
  lowConfidenceMapping: boolean
  ldapFailureRate: number
  nameCollisions: string[]
}

const TEACHING_FOCUSED: Set<FacultyType> = new Set(["teaching", "clinical"])
const RESEARCH_FOCUSED: Set<FacultyType> = new Set(["tenure_track", "research"])

export function isTeachingFocused(type: FacultyType): boolean {
  return TEACHING_FOCUSED.has(type)
}

export function isResearchFocused(type: FacultyType): boolean {
  return RESEARCH_FOCUSED.has(type)
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

  // Faculty by category
  teachingFocusedCount: number
  researchFocusedCount: number

  // Salary totals
  totalProposedSalary: number
  matchedProposedSalary: number

  // Matched salary by category (for frontend recomputation with sliders)
  matchedTeachingFocusedSalary: number
  matchedResearchFocusedSalary: number

  // Instructional spend (at default 70/30)
  instructionalSpend: number

  // Enrollment
  uniqueStudents: number
  totalCreditHours: number
  courseCount: number

  // Per-student and per-credit-hour (at default 70/30)
  perStudent: number
  perCreditHour: number

  // Data quality
  dataQuality: DataQualityFlags

  // GPA cross-check
  gpaConfirmed: number
  gpaOnlyInstructors: number
}

const DEFAULT_TEACHING_PCT = 0.7
const DEFAULT_RESEARCH_PCT = 0.3

export function analyzeDepartment(
  cisSubject: string,
  cisName: string,
  grayBookId: string,
  grayBookName: string,
  matchResult: MatchResult,
  courses: CISCourse[],
  uniqueStudents: number,
  options?: {
    matchScore?: number
    matchMethod?: string
    ldapFailures?: number
    totalLdapQueries?: number
    nameCollisions?: string[]
    gpaConfirmed?: number
    gpaOnlyInstructors?: number
  },
): DepartmentAnalysis {
  const allFaculty = [...matchResult.matched.map((m) => m.faculty), ...matchResult.unmatchedFaculty]
  const totalFaculty = allFaculty.length

  const teachingFocusedCount = allFaculty.filter((f) => isTeachingFocused(f.facultyType)).length
  const researchFocusedCount = allFaculty.filter((f) => isResearchFocused(f.facultyType)).length

  const totalProposedSalary = allFaculty.reduce((s, f) => s + f.totalProposedSalary, 0)
  const matchedProposedSalary = matchResult.matched.reduce((s, m) => s + m.faculty.totalProposedSalary, 0)

  // Matched salary by category
  let matchedTeachingFocusedSalary = 0
  let matchedResearchFocusedSalary = 0
  for (const m of matchResult.matched) {
    if (isTeachingFocused(m.faculty.facultyType)) {
      matchedTeachingFocusedSalary += m.faculty.totalProposedSalary
    } else if (isResearchFocused(m.faculty.facultyType)) {
      matchedResearchFocusedSalary += m.faculty.totalProposedSalary
    }
  }

  // Instructional spend at default fractions
  const instructionalSpend =
    matchedTeachingFocusedSalary * DEFAULT_TEACHING_PCT +
    matchedResearchFocusedSalary * DEFAULT_RESEARCH_PCT

  // Credit hours — per course, not per section
  let totalCreditHours = 0
  for (const course of courses) {
    if (course.creditHours) {
      totalCreditHours += course.creditHours
    }
  }

  const courseCount = courses.length
  const matchRate = totalFaculty > 0 ? matchResult.matched.length / totalFaculty : 0

  const perStudent = uniqueStudents > 0 ? instructionalSpend / uniqueStudents : 0
  const perCreditHour = totalCreditHours > 0 ? instructionalSpend / totalCreditHours : 0

  // Data quality flags
  const reasons: string[] = []
  if (totalFaculty === 0 && uniqueStudents > 0) {
    reasons.push("Administrative unit — no teaching faculty positions in Grey Book")
  } else if (matchRate === 0) {
    reasons.push("No Grey Book faculty matched to CIS instructors")
  }
  if (uniqueStudents < 10) reasons.push(`Very low enrollment (${uniqueStudents} students)`)
  const excluded = matchRate === 0 || uniqueStudents < 10

  const matchRateWarning = matchRate > 0 && matchRate < 0.5
  if (matchRateWarning) reasons.push(`Few faculty teaching this semester (${(matchRate * 100).toFixed(0)}%)`)

  const lowConfidenceMapping = (options?.matchMethod === "auto" && (options?.matchScore ?? 1) < 0.6)
  if (lowConfidenceMapping) reasons.push(`Low-confidence department mapping (score: ${options?.matchScore?.toFixed(2)})`)

  const ldapFailures = options?.ldapFailures ?? 0
  const totalLdapQueries = options?.totalLdapQueries ?? 0
  const ldapFailureRate = totalLdapQueries > 0 ? ldapFailures / totalLdapQueries : 0
  if (ldapFailureRate > 0.1) reasons.push(`High LDAP failure rate (${(ldapFailureRate * 100).toFixed(0)}%)`)

  const nameCollisions = options?.nameCollisions ?? []
  if (nameCollisions.length > 0) reasons.push(`${nameCollisions.length} name collision(s) in matching`)

  const dataQuality: DataQualityFlags = {
    excluded,
    reasons,
    matchRateWarning,
    lowConfidenceMapping,
    ldapFailureRate,
    nameCollisions,
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
    teachingFocusedCount,
    researchFocusedCount,
    matchedTeachingFocusedSalary,
    matchedResearchFocusedSalary,
    totalProposedSalary,
    matchedProposedSalary,
    instructionalSpend,
    uniqueStudents,
    totalCreditHours,
    courseCount,
    perStudent,
    perCreditHour,
    dataQuality,
    gpaConfirmed: options?.gpaConfirmed ?? 0,
    gpaOnlyInstructors: options?.gpaOnlyInstructors ?? 0,
  }
}
