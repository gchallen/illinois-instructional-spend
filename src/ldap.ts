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

async function checkReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const net = await import("net")
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs })
    socket.on("connect", () => { socket.destroy(); resolve(true) })
    socket.on("timeout", () => { socket.destroy(); resolve(false) })
    socket.on("error", () => { socket.destroy(); resolve(false) })
  })
}

export async function connectLDAP(username: string, password: string, timeoutMs = 3000): Promise<LDAPClient | null> {
  const reachable = await checkReachable("ad.uillinois.edu", 389, 1000)
  if (!reachable) throw new Error("LDAP server unreachable")

  const client = ldap.createClient({
    url: "ldap://ad.uillinois.edu/",
    idleTimeout: timeoutMs,
    reconnect: false,
    connectTimeout: timeoutMs,
    timeout: timeoutMs,
  })

  const starttls = promisify(client.starttls).bind(client)
  const bind = promisify(client.bind).bind(client)
  const search = promisify(client.search).bind(client)

  client.on("error", () => {})

  try {
    await Promise.race([
      (async () => {
        await starttls({}, [])
        await bind(username, password)
      })(),
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          client.destroy()
          reject(new Error("LDAP connection timed out"))
        }, timeoutMs)
        if (typeof t.unref === "function") t.unref()
      }),
    ])
  } catch (e: any) {
    client.destroy()
    throw e
  }

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
  client: LDAPClient | null,
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
    if (!client) throw new Error("LDAP unavailable")
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
