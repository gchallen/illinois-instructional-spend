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

interface EnrollmentResult {
  uniqueStudents: number
  ldapFailures: number
  totalSections: number
}

async function getEnrollment(
  client: LDAPClient,
  sections: { subject: string; number: string; sectionNumber: string; crn: number }[],
): Promise<EnrollmentResult> {
  const allNetIDs = new Set<string>()
  let processed = 0
  let ldapFailures = 0

  await batch(sections, CONCURRENCY, async (q) => {
    try {
      const netIDs = await getEnrollmentForSection(
        client,
        q.subject,
        q.number,
        q.sectionNumber,
        q.crn,
      )
      for (const id of netIDs) allNetIDs.add(id)
    } catch {
      ldapFailures++
    }
    processed++
    if (processed % 20 === 0 || processed === sections.length) {
      process.stdout.write(`\r    Enrollment: ${processed}/${sections.length} sections`)
    }
  })

  if (sections.length > 0) console.log()
  if (ldapFailures > 0) {
    console.log(`    LDAP failures: ${ldapFailures}/${sections.length} sections`)
  }
  return { uniqueStudents: allNetIDs.size, ldapFailures, totalSections: sections.length }
}

async function main() {
  console.log("UIUC Instructional Salary Spend Analysis — Spring 2026\n")

  const username = process.env.LDAP_USERNAME
  const password = process.env.LDAP_PASSWORD
  if (!username || !password) {
    throw new Error("LDAP_USERNAME and LDAP_PASSWORD must be set in .env")
  }

  // Step 1: Department mapping (Grey Book dept → CIS subjects)
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
    console.log(`  [${deptIndex}/${mappings.length}] ${mapping.grayBookName} (${mapping.grayBookId}) → ${mapping.cisSubjects.join(", ")}`)

    // Parse Grey Book faculty
    let faculty: ProcessedFaculty[]
    try {
      const members = parseDepartment(mapping.grayBookId)
      faculty = processFaculty(members)
    } catch (e: any) {
      console.log(`    Grey Book parse error: ${e.message}`)
      continue
    }
    console.log(`    Faculty: ${faculty.length}`)

    if (faculty.length === 0) {
      console.log(`    Skipping — no faculty`)
      continue
    }

    // Fetch CIS courses for all mapped subjects
    const allCourses: CISCourse[] = []
    for (const subject of mapping.cisSubjects) {
      try {
        const courses = await fetchCoursesForSubject(subject)
        allCourses.push(...courses)
      } catch (e: any) {
        console.log(`    CIS fetch error for ${subject}: ${e.message}`)
      }
    }
    const totalSections = allCourses.reduce((n, c) => n + c.sections.length, 0)
    console.log(`    CIS: ${allCourses.length} courses, ${totalSections} sections`)

    if (allCourses.length === 0) {
      console.log(`    Skipping — no courses`)
      continue
    }

    // Match faculty to CIS instructors (scoped to mapped subjects)
    const matchResult = matchFacultyToCourses(faculty, allCourses)
    const teachingPct = (matchResult.matched.length / faculty.length * 100).toFixed(0)
    console.log(`    Teaching: ${matchResult.matched.length}/${faculty.length} (${teachingPct}%)`)

    // Collect all sections from matched faculty for enrollment
    const sectionSet = new Map<number, { subject: string; number: string; sectionNumber: string; crn: number }>()
    const courseKeys = new Set<string>()
    for (const m of matchResult.matched) {
      for (const c of m.coursesTeaching) {
        courseKeys.add(`${c.subject}-${c.number}`)
        for (const s of c.sections) {
          sectionSet.set(s.crn, { subject: c.subject, number: c.number, sectionNumber: s.sectionNumber, crn: s.crn })
        }
      }
    }

    // Compute credit hours from matched courses
    const courseLookup = new Map<string, CISCourse>()
    for (const c of allCourses) courseLookup.set(`${c.subject}-${c.number}`, c)
    let totalCreditHours = 0
    for (const courseKey of courseKeys) {
      const course = courseLookup.get(courseKey)
      if (course?.creditHours) totalCreditHours += course.creditHours
    }

    // Get enrollment via LDAP for matched sections
    const enrollment = await getEnrollment(client, [...sectionSet.values()])
    console.log(`    Students: ${enrollment.uniqueStudents.toLocaleString()}`)

    // Analyze
    const analysis = analyzeDepartment(
      mapping.grayBookId,
      mapping.grayBookName,
      matchResult,
      enrollment.uniqueStudents,
      totalCreditHours,
      courseKeys.size,
      {
        ldapFailures: enrollment.ldapFailures,
        totalLdapQueries: enrollment.totalSections,
      },
    )
    // Store the mapped CIS subjects on the analysis for reporting
    analysis.cisSubjects = mapping.cisSubjects
    results.push(analysis)

    if (enrollment.uniqueStudents > 0) {
      console.log(`    Spend/student: $${Math.round(analysis.perStudent).toLocaleString()}`)
    }
    console.log()
  }

  // Step 4: Generate report
  console.log("=== Step 4: Generating report ===")
  generateReport(results)

  // Summary
  const withStudents = results.filter((r) => r.uniqueStudents > 0 && !r.dataQuality.excluded)
  const sorted = [...withStudents].sort((a, b) => b.perStudent - a.perStudent)

  console.log(`\n=== Top 20 departments by spend per student (teaching 70%, research 30%) ===\n`)
  for (const r of sorted.slice(0, 20)) {
    const spend = `$${Math.round(r.perStudent).toLocaleString()}`
    console.log(`  ${r.grayBookName.substring(0, 35).padEnd(37)} ${spend.padStart(8)} /student  (${r.matchedFaculty} matched, ${r.uniqueStudents.toLocaleString()} students)`)
  }

  client.destroy()
  console.log("\nDone.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
