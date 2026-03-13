import ldap from "ldapjs"
import { promisify } from "util"
import { cachedFetch, ONE_DAY } from "./cache"

export interface LDAPClient {
  searchReturnAll: (
    base: string,
    options: { filter: string; scope: "sub" | "base" | "one" },
  ) => Promise<{ entries: any[] }>
  destroy: () => void
}

export async function connectLDAP(username: string, password: string): Promise<LDAPClient> {
  const client = ldap.createClient({
    url: "ldap://ad.uillinois.edu/",
    idleTimeout: 1024 * 1024 * 1024,
    reconnect: true,
  })

  const starttls = promisify(client.starttls).bind(client)
  const bind = promisify(client.bind).bind(client)
  const search = promisify(client.search).bind(client)

  client.on("error", () => {})

  await starttls({}, [])
  await bind(username, password)

  const searchReturnAll = async (
    base: string,
    options: { filter: string; scope: "sub" | "base" | "one" },
  ): Promise<{ entries: any[] }> => {
    const response: any = await search(base, options)
    const entries: any[] = []
    return new Promise((resolve, reject) => {
      response.on("searchEntry", (entry: any) => {
        entries.push(entry.object)
      })
      response.on("error", (error: any) => reject(error))
      response.on("end", (result: any) => {
        if (result?.status !== 0) {
          return reject(new Error(`LDAP search failed with status ${result?.status}`))
        }
        resolve({ entries })
      })
    })
  }

  return {
    searchReturnAll,
    destroy: () => client.destroy(),
  }
}

const forceArray = (o: unknown) => (Array.isArray(o) ? o : [o])

function enrollmentRecordToNetID(cn: string): string | undefined {
  const match = /^CN=(.+?),OU=(.+?),/.exec(cn)
  if (match) {
    const [, netID, group] = match
    return group === "People" ? netID : undefined
  }
  return undefined
}

export async function getEnrollmentForSection(
  client: LDAPClient,
  subject: string,
  number: string,
  sectionName: string,
  crn: number,
  year: number = 2026,
  term: string = "Spring",
): Promise<string[]> {
  const cn = `${subject} ${number} ${sectionName} ${year} ${term} CRN${crn}`
  const cacheKey = `ldap-enrollment-${cn.replace(/\s+/g, "_")}`

  return cachedFetch<string[]>(cacheKey, ONE_DAY, async () => {
    const results = (
      await client.searchReturnAll(
        "OU=Sections,OU=Class Rosters,OU=Register,OU=Urbana,DC=ad,DC=uillinois,DC=edu",
        { filter: `(cn=${cn})`, scope: "sub" },
      )
    ).entries

    if (results.length === 0) {
      return []
    }

    const result = results[0]
    return forceArray(result.member ?? [])
      .map((member: string) => enrollmentRecordToNetID(member))
      .filter((netID: string | undefined): netID is string => netID !== undefined)
  })
}
