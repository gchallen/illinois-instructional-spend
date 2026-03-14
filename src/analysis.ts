import type { FacultyType } from "./salaries"
import type { MatchResult } from "./matching"

export interface DataQualityFlags {
  excluded: boolean
  reasons: string[]
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
  grayBookId: string
  grayBookName: string

  /** CIS subjects discovered via faculty matches */
  cisSubjects: string[]

  // Faculty counts
  totalFaculty: number
  matchedFaculty: number
  unmatchedFaculty: number
  matchRate: number

  // Faculty by category
  teachingFocusedCount: number
  researchFocusedCount: number

  // Salary totals
  totalProposedSalary: number
  matchedProposedSalary: number

  // Total salary by category — all Grey Book faculty (for frontend recomputation with sliders)
  totalTeachingFocusedSalary: number
  totalResearchFocusedSalary: number

  // Matched vs unmatched salary breakdown (for teaching/research spend decomposition)
  matchedTeachingFocusedSalary: number
  matchedResearchFocusedSalary: number
  unmatchedNonAdminSalary: number

  // Instructional spend (at default 70/30, using matched faculty only)
  instructionalSpend: number

  // Enrollment (across all matched sections, all subjects)
  uniqueStudents: number
  totalCreditHours: number
  courseCount: number

  // Per-student and per-credit-hour (at default 70/30)
  perStudent: number
  perCreditHour: number

  // Data quality
  dataQuality: DataQualityFlags
}

const DEFAULT_TEACHING_PCT = 0.7
const DEFAULT_RESEARCH_PCT = 0.3

export function analyzeDepartment(
  grayBookId: string,
  grayBookName: string,
  matchResult: MatchResult,
  uniqueStudents: number,
  totalCreditHours: number,
  courseCount: number,
  options?: {
    ldapFailures?: number
    totalLdapQueries?: number
  },
): DepartmentAnalysis {
  const allFaculty = [...matchResult.matched.map((m) => m.faculty), ...matchResult.unmatchedFaculty]
  const totalFaculty = allFaculty.length

  const teachingFocusedCount = allFaculty.filter((f) => isTeachingFocused(f.facultyType)).length
  const researchFocusedCount = allFaculty.filter((f) => isResearchFocused(f.facultyType)).length

  const totalProposedSalary = allFaculty.reduce((s, f) => s + f.totalProposedSalary, 0)
  const matchedProposedSalary = matchResult.matched.reduce((s, m) => s + m.faculty.totalProposedSalary, 0)

  // Total salary by category — all Grey Book faculty
  let totalTeachingFocusedSalary = 0
  let totalResearchFocusedSalary = 0
  for (const f of allFaculty) {
    if (isTeachingFocused(f.facultyType)) {
      totalTeachingFocusedSalary += f.totalProposedSalary
    } else if (isResearchFocused(f.facultyType)) {
      totalResearchFocusedSalary += f.totalProposedSalary
    }
  }

  // Matched vs unmatched salary breakdown
  let matchedTeachingFocusedSalary = 0
  let matchedResearchFocusedSalary = 0
  let unmatchedNonAdminSalary = 0

  for (const m of matchResult.matched) {
    if (isTeachingFocused(m.faculty.facultyType)) {
      matchedTeachingFocusedSalary += m.faculty.totalProposedSalary
    } else if (isResearchFocused(m.faculty.facultyType)) {
      matchedResearchFocusedSalary += m.faculty.totalProposedSalary
    }
  }

  for (const f of matchResult.unmatchedFaculty) {
    if (isTeachingFocused(f.facultyType) || isResearchFocused(f.facultyType)) {
      unmatchedNonAdminSalary += f.totalProposedSalary
    }
  }

  // Instructional spend at default fractions — matched faculty only
  const instructionalSpend =
    matchedTeachingFocusedSalary * DEFAULT_TEACHING_PCT +
    matchedResearchFocusedSalary * DEFAULT_RESEARCH_PCT

  const matchRate = totalFaculty > 0 ? matchResult.matched.length / totalFaculty : 0

  const perStudent = uniqueStudents > 0 ? instructionalSpend / uniqueStudents : 0
  const perCreditHour = totalCreditHours > 0 ? instructionalSpend / totalCreditHours : 0

  // Data quality flags
  const reasons: string[] = []
  if (totalFaculty === 0) {
    reasons.push("No teaching faculty positions in Grey Book")
  } else if (matchRate === 0) {
    reasons.push("No Grey Book faculty found teaching in CIS")
  }
  if (uniqueStudents < 10) reasons.push(`Very low enrollment (${uniqueStudents} students)`)
  const excluded = totalFaculty === 0 || uniqueStudents < 10

  const ldapFailures = options?.ldapFailures ?? 0
  const totalLdapQueries = options?.totalLdapQueries ?? 0
  const ldapFailureRate = totalLdapQueries > 0 ? ldapFailures / totalLdapQueries : 0
  if (ldapFailureRate > 0.1) reasons.push(`High LDAP failure rate (${(ldapFailureRate * 100).toFixed(0)}%)`)

  const nameCollisions = matchResult.nameCollisions
  if (nameCollisions.length > 0) reasons.push(`${nameCollisions.length} name collision(s) in matching`)

  const dataQuality: DataQualityFlags = {
    excluded,
    reasons,
    ldapFailureRate,
    nameCollisions,
  }

  return {
    grayBookId,
    grayBookName,
    cisSubjects: [],
    totalFaculty,
    matchedFaculty: matchResult.matched.length,
    unmatchedFaculty: matchResult.unmatchedFaculty.length,
    matchRate,
    teachingFocusedCount,
    researchFocusedCount,
    totalTeachingFocusedSalary,
    totalResearchFocusedSalary,
    matchedTeachingFocusedSalary,
    matchedResearchFocusedSalary,
    unmatchedNonAdminSalary,
    totalProposedSalary,
    matchedProposedSalary,
    instructionalSpend,
    uniqueStudents,
    totalCreditHours,
    courseCount,
    perStudent,
    perCreditHour,
    dataQuality,
  }
}
