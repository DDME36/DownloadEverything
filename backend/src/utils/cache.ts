import type { MediaInfo } from '../types'
import { log } from './helpers'

interface CacheEntry {
  data: MediaInfo
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry>()
  private cleanupInterval: Timer | null = null

  constructor() {
    // ล้างข้อมูลที่หมดอายุทุก 1 นาที
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000)
  }

  /**
   * บันทึกข้อมูลเข้า Cache
   * @param key คีย์ที่ต้องการเก็บ (เช่น URL)
   * @param data ข้อมูลที่จะเก็บ (MediaInfo)
   * @param ttlMs อายุของแคชในหน่วยมิลลิวินาที (ค่าเริ่มต้นคือ 10 นาที)
   */
  public set(key: string, data: MediaInfo, ttlMs = 10 * 60 * 1000): void {
    const expiresAt = Date.now() + ttlMs
    this.cache.set(key, { data, expiresAt })
    log('info', `Cache set for: ${key.substring(0, 50)}... (TTL: ${ttlMs / 1000}s)`)
  }

  /**
   * ดึงข้อมูลจาก Cache
   * @param key คีย์ที่ต้องการค้นหา
   */
  public get(key: string): MediaInfo | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      log('info', `Cache expired and deleted for: ${key.substring(0, 50)}...`)
      return null
    }

    log('info', `Cache HIT for: ${key.substring(0, 50)}...`)
    return entry.data
  }

  /**
   * ล้างข้อมูลทั้งหมดใน Cache
   */
  public clear(): void {
    this.cache.clear()
    log('info', 'Cache cleared')
  }

  /**
   * ล้างข้อมูลที่หมดอายุแล้วใน Map
   */
  private cleanup(): void {
    const now = Date.now()
    let deletedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      log('info', `Cache cleanup: deleted ${deletedCount} expired items`)
    }
  }

  /**
   * ปิดการทำงาน (สำหรับทดสอบหรือปิดเซิร์ฟเวอร์)
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

export const mediaCache = new MemoryCache()
