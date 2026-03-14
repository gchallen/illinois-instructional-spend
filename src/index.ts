import "dotenv/config"
import { loadOrCreateMapping } from "./departments"
import { fetchCoursesForSubject, type CISCourse } from "./cis"
import { parseDepartment, processFaculty, type ProcessedFaculty } from "./salaries"
import { matchFacultyToCourses } from "./matching"
import { analyzeDepartment, type DepartmentAnalysis } from "./analysis"
import { connectLDAP, getEnrollmentForSection, type LDAPClient } from "./ldap"
import { generateReport } from "./report"
import { fetchGPAInstructors, buildNameLookup } from "./gpa"

const CONCURRENCY = 8

async function batch<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map(fn))
    results.push(...chunkResults)
  }
  return results
}

interface EnrollmentResult {
  uniqueStudents: number
  ldapFailures: number
  totalSections: number
}

async function getEnrollment(
  client: LDAPClient,
  courses: CISCourse[],
  subject: string,
): Promise<EnrollmentResult> {
  const allNetIDs = new Set<string>()

  const queries: { number: string; sectionNumber: string; crn: number }[] = []
  for (const course of courses) {
    for (const section of course.sections) {
      queries.push({ number: course.number, sectionNumber: section.sectionNumber, crn: section.crn })
    }
  }

  let processed = 0
  let ldapFailures = 0
  await batch(queries, CONCURRENCY, async (q) => {
    try {
      const netIDs = await getEnrollmentForSection(
        client,
        subject,
        q.number,
        q.sectionNumber,
        q.crn,
      )
      for (const id of netIDs) allNetIDs.add(id)
    } catch {
      ldapFailures++
    }
    processed++
    if (processed % 20 === 0 || processed === queries.length) {
      process.stdout.write(`\r    Enrollment: ${processed}/${queries.length} sections`)
    }
  })

  if (queries.length > 0) console.log()
  if (ldapFailures > 0) {
    console.log(`    LDAP failures: ${ldapFailures}/${queries.length} sections`)
  }
  return { uniqueStudents: allNetIDs.size, ldapFailures, totalSections: queries.length }
}

async function main() {
  console.log("UIUC Instructional Salary Spend Analysis — Spring 2026\n")

  const username = process.env.LDAP_USERNAME
  const password = process.env.LDAP_PASSWORD
  if (!username || !password) {
    throw new Error("LDAP_USERNAME and LDAP_PASSWORD must be set in .env")
  }

  // Step 1: Department mapping
  console.log("=== Step 1: Department Mapping ===")
  const mappings = await loadOrCreateMapping()
  console.log(`  ${mappings.length} departments mapped\n`)

  // Step 2: Load GPA dataset for cross-checking
  console.log("=== Step 2: GPA Dataset ===")
  const gpaData = await fetchGPAInstructors()
  console.log(`  ${gpaData.size} subjects with instructor data\n`)

  // Step 3: Connect LDAP
  console.log("=== Step 3: Connecting to LDAP ===")
  const client = await connectLDAP(username, password)
  console.log("  Connected.\n")

  // Step 4: Process each department
  console.log("=== Step 4: Processing departments ===\n")
  const results: DepartmentAnalysis[] = []
  let deptIndex = 0

  for (const mapping of mappings) {
    deptIndex++
    console.log(`  [${deptIndex}/${mappings.length}] ${mapping.cisSubject} (${mapping.cisName}) ↔ ${mapping.grayBookName}`)

    // Parse Grey Book
    let faculty: ProcessedFaculty[]
    try {
      const members = parseDepartment(mapping.grayBookId)
      faculty = processFaculty(members)
    } catch (e: any) {
      console.log(`    ⚠ Grey Book parse error: ${e.message}`)
      continue
    }
    console.log(`    Grey Book: ${faculty.length} faculty`)

    // Fetch CIS courses
    let courses: CISCourse[]
    try {
      courses = await fetchCoursesForSubject(mapping.cisSubject)
    } catch (e: any) {
      console.log(`    ⚠ CIS fetch error: ${e.message}`)
      continue
    }
    const totalSections = courses.reduce((n, c) => n + c.sections.length, 0)
    console.log(`    CIS: ${courses.length} courses, ${totalSections} sections`)

    if (courses.length === 0) {
      console.log(`    Skipping — no courses`)
      continue
    }

    // Match faculty to CIS instructors
    const gpaLookup = buildNameLookup(gpaData, mapping.cisSubject)
    const matchResult = matchFacultyToCourses(faculty, courses, gpaLookup)
    const teachingPct = (matchResult.matched.length / Math.max(faculty.length, 1) * 100).toFixed(0)
    console.log(`    Teaching: ${matchResult.matched.length}/${faculty.length} faculty (${teachingPct}%)`)
    if (gpaLookup.size > 0) {
      console.log(`    GPA cross-check: ${matchResult.gpaConfirmed} confirmed, ${matchResult.gpaOnlyInstructors} GPA-only instructors`)
    }

    // Get enrollment via LDAP
    const enrollment = await getEnrollment(client, courses, mapping.cisSubject)
    console.log(`    Students: ${enrollment.uniqueStudents.toLocaleString()}`)

    // Analyze
    const analysis = analyzeDepartment(
      mapping.cisSubject,
      mapping.cisName,
      mapping.grayBookId,
      mapping.grayBookName,
      matchResult,
      courses,
      enrollment.uniqueStudents,
      {
        matchScore: mapping.matchScore,
        matchMethod: mapping.matchMethod,
        ldapFailures: enrollment.ldapFailures,
        totalLdapQueries: enrollment.totalSections,
        nameCollisions: matchResult.nameCollisions,
        gpaConfirmed: matchResult.gpaConfirmed,
        gpaOnlyInstructors: matchResult.gpaOnlyInstructors,
      },
    )
    results.push(analysis)

    if (enrollment.uniqueStudents > 0) {
      console.log(`    Spend/student: $${Math.round(analysis.perStudent).toLocaleString()}`)
    }
    console.log()
  }

  // Step 5: Generate report
  console.log("=== Step 5: Generating report ===")
  generateReport(results)

  // Summary
  const withStudents = results.filter((r) => r.uniqueStudents > 0)
  const sorted = withStudents.sort((a, b) => b.perStudent - a.perStudent)

  console.log(`\n=== Top 20 departments by spend per student (teaching 70%, research 30%) ===\n`)
  for (const r of sorted.slice(0, 20)) {
    const spend = `$${Math.round(r.perStudent).toLocaleString()}`
    console.log(`  ${r.cisSubject.padEnd(8)} ${spend.padStart(8)} /student  (${r.matchedFaculty} matched, ${r.uniqueStudents.toLocaleString()} students)`)
  }

  client.destroy()
  console.log("\nDone.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
