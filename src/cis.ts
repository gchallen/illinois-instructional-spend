import { XMLParser } from "fast-xml-parser"
import { cachedFetch, ONE_WEEK } from "./cache"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
})

const forceArray = (o: unknown) => (Array.isArray(o) ? o : [o])

export interface CISInstructor {
  lastName: string
  firstName: string
}

export interface CISSection {
  crn: number
  sectionNumber: string
  typeCode: string
  typeName: string
  instructors: CISInstructor[]
}

export interface CISCourse {
  subject: string
  number: string
  label: string
  creditHours: number | null
  sections: CISSection[]
}

export interface CISSubject {
  code: string
  name: string
}

const YEAR = 2026
const TERM = "spring"

function parseCreditHours(text: string): number | null {
  const match = /^(\d+)(?:\s+TO\s+(\d+))?\s+hours?/i.exec(text.trim())
  if (!match) return null
  const min = parseInt(match[1])
  if (min === 0) return null // Skip variable-credit starting at 0
  return min
}

function extractInstructors(meetings: any): CISInstructor[] {
  if (!meetings) return []
  const meetingList = forceArray(meetings.meeting ?? meetings)
  const seen = new Set<string>()
  const instructors: CISInstructor[] = []

  for (const meeting of meetingList) {
    if (!meeting?.instructors?.instructor) continue
    const instrList = forceArray(meeting.instructors.instructor)
    for (const instr of instrList) {
      const lastName = (instr.lastName ?? "").trim()
      const firstName = (instr.firstName ?? "").trim()
      if (!lastName) continue
      const key = `${lastName.toLowerCase()}|${firstName.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        instructors.push({ lastName, firstName })
      }
    }
  }

  return instructors
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url)
    if (response.status === 403 && attempt < retries) {
      const delay = 3000 * (attempt + 1)
      await new Promise((r) => setTimeout(r, delay))
      continue
    }
    return response
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchAllSubjects(): Promise<CISSubject[]> {
  return cachedFetch<CISSubject[]>("cis-subjects-2026-spring", ONE_WEEK, async () => {
    const url = `https://courses.illinois.edu/cisapp/explorer/schedule/${YEAR}/${TERM}.xml`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch subjects: ${response.status}`)
    const xml = await response.text()
    const parsed = parser.parse(xml)

    const subjects = forceArray(parsed["ns2:term"].subjects.subject)
    return subjects.map((s: any) => ({
      code: s.id,
      name: s.text ?? "",
    }))
  })
}

export async function fetchCourseNumbers(subject: string): Promise<string[]> {
  return cachedFetch<string[]>(`cis-courses-${subject}`, ONE_WEEK, async () => {
    await sleep(1000)
    const url = `https://courses.illinois.edu/cisapp/explorer/schedule/${YEAR}/${TERM}/${subject}.xml`
    const response = await fetchWithRetry(url)
    if (!response.ok) {
      if (response.status === 404) return []
      throw new Error(`Failed to fetch courses for ${subject}: ${response.status}`)
    }
    const xml = await response.text()
    const parsed = parser.parse(xml)
    try {
      return forceArray(parsed["ns2:subject"].courses.course).map(({ id }: { id: string }) => String(id))
    } catch {
      return []
    }
  })
}

export async function fetchCourseDetail(subject: string, number: string): Promise<CISCourse | null> {
  return cachedFetch<CISCourse | null>(`cis-enhanced-${subject}-${number}`, ONE_WEEK, async () => {
    await sleep(1000)
    const url = `https://courses.illinois.edu/cisapp/explorer/schedule/${YEAR}/${TERM}/${subject}/${number}.xml?mode=detail`
    const response = await fetchWithRetry(url)
    if (!response.ok) return null
    const xml = await response.text()
    const parsed = parser.parse(xml)
    const courseData = parsed["ns2:course"]
    if (!courseData) return null

    const label = courseData.label ?? ""
    const creditHours = courseData.creditHours ? parseCreditHours(String(courseData.creditHours)) : null

    const sections: CISSection[] = []
    const detailedSections = courseData.detailedSections?.detailedSection
    if (detailedSections) {
      for (const s of forceArray(detailedSections)) {
        const crn = parseInt(s.id)
        const sectionNumber = s.sectionNumber?.toString().trim() ?? ""

        let typeCode = ""
        let typeName = ""
        const meetings = s.meetings
        if (meetings?.meeting) {
          const firstMeeting = forceArray(meetings.meeting)[0]
          if (firstMeeting?.type) {
            typeCode = firstMeeting.type.code ?? ""
            typeName = firstMeeting.type.text ?? ""
          }
        }

        const instructors = extractInstructors(meetings)

        sections.push({ crn, sectionNumber, typeCode, typeName, instructors })
      }
    }

    return { subject, number, label, creditHours, sections }
  })
}

export async function fetchCoursesForSubject(subject: string): Promise<CISCourse[]> {
  const numbers = await fetchCourseNumbers(subject)
  const courses: CISCourse[] = []

  for (const number of numbers) {
    const course = await fetchCourseDetail(subject, number)
    if (course) courses.push(course)
  }

  return courses
}
