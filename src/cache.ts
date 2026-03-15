import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const CACHE_DIR = join(import.meta.dir, "..", ".cache")

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

function cacheFilePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_")
  return join(CACHE_DIR, `${safe}.json`)
}

interface CacheEntry<T> {
  timestamp: number
  data: T
}

export async function cachedFetch<T>(key: string, ttlMs: number, fetchFn: () => Promise<T>): Promise<T> {
  ensureCacheDir()
  const path = cacheFilePath(key)

  let staleData: T | undefined
  if (existsSync(path)) {
    try {
      const entry: CacheEntry<T> = JSON.parse(readFileSync(path, "utf-8"))
      if (Date.now() - entry.timestamp < ttlMs) {
        return entry.data
      }
      staleData = entry.data
    } catch {
      // Corrupted cache, re-fetch
    }
  }

  try {
    const data = await fetchFn()
    const entry: CacheEntry<T> = { timestamp: Date.now(), data }
    writeFileSync(path, JSON.stringify(entry))
    return data
  } catch (e) {
    if (staleData !== undefined) return staleData
    throw e
  }
}

export const ONE_WEEK = 7 * 24 * 60 * 60 * 1000
export const ONE_DAY = 24 * 60 * 60 * 1000
