import "dotenv/config"
import { loadOrCreateMapping } from "./departments"
import { fetchCoursesForSubject, type CISCourse } from "./cis"
import { parseDepartment, processFaculty, type ProcessedFaculty } from "./salaries"
import { matchFacultyToCourses } from "./matching"
import { analyzeDepartment, type DepartmentAnalysis } from "./analysis"
import { connectLDAP, getEnrollmentForSection, type LDAPClient } from "./ldap"
import { generateReport } from "./report"

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

async function getEnrollment(
  client: LDAPClient,
  courses: CISCourse[],
  subject: string,
): Promise<number> {
  const allNetIDs = new Set<string>()

  const queries: { number: string; sectionNumber: string; crn: number }[] = []
  for (const course of courses) {
    for (const section of course.sections) {
      queries.push({ number: course.number, sectionNumber: section.sectionNumber, crn: section.crn })
    }
  }

  let processed = 0
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
      // Skip failed sections
    }
    processed++
    if (processed % 20 === 0 || processed === queries.length) {
      process.stdout.write(`\r    Enrollment: ${processed}/${queries.length} sections`)
    }
  })

  if (queries.length > 0) console.log()
  return allNetIDs.size
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

  // Step 2: Connect LDAP
  console.log("=== Step 2: Connecting to LDAP ===")
  const client = await connectLDAP(username, password)
  console.log("  Connected.\n")

  // Step 3: Process each department
  console.log("=== Step 3: Processing departments ===\n")
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
    const matchResult = matchFacultyToCourses(faculty, courses)
    console.log(`    Matched: ${matchResult.matched.length}/${faculty.length} faculty (${(matchResult.matched.length / Math.max(faculty.length, 1) * 100).toFixed(0)}%)`)

    // Get enrollment via LDAP
    const uniqueStudents = await getEnrollment(client, courses, mapping.cisSubject)
    console.log(`    Students: ${uniqueStudents.toLocaleString()}`)

    // Analyze
    const analysis = analyzeDepartment(
      mapping.cisSubject,
      mapping.cisName,
      mapping.grayBookId,
      mapping.grayBookName,
      matchResult,
      courses,
      uniqueStudents,
    )
    results.push(analysis)

    if (uniqueStudents > 0) {
      console.log(`    Spend/student: $${Math.round(analysis.perStudent.realistic).toLocaleString()} (realistic)`)
    }
    console.log()
  }

  // Step 4: Generate report
  console.log("=== Step 4: Generating report ===")
  generateReport(results)

  // Summary
  const withStudents = results.filter((r) => r.uniqueStudents > 0)
  const sorted = withStudents.sort((a, b) => b.perStudent.realistic - a.perStudent.realistic)

  console.log(`\n=== Top 20 departments by spend per student (realistic) ===\n`)
  for (const r of sorted.slice(0, 20)) {
    const spend = `$${Math.round(r.perStudent.realistic).toLocaleString()}`
    console.log(`  ${r.cisSubject.padEnd(8)} ${spend.padStart(8)} /student  (${r.matchedFaculty} matched, ${r.uniqueStudents.toLocaleString()} students)`)
  }

  client.destroy()
  console.log("\nDone.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
