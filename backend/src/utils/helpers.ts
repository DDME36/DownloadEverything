import { mkdir, appendFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

let logsDirReady = false
const backendRoot = resolve(import.meta.dir, '../../')
const logsDir = join(backendRoot, 'logs')
const logFilePath = join(logsDir, 'backend.log')

export async function ensureLogsDir(): Promise<string> {
  if (!logsDirReady) {
    try {
      await mkdir(logsDir, { recursive: true })
      logsDirReady = true
    } catch {}
  }
  return logsDir
}

export function getLogFilePath(): string {
  return logFilePath
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
  return sanitized || 'download'
}

export function truncateDescription(desc?: string, maxLen = 200): string {
  if (!desc) return ''
  const trimmed = desc.trim()
  if (trimmed.length <= maxLen) return trimmed
  const sliced = trimmed.substring(0, maxLen).replace(/\s+\S*$/, '').trim()
  return `${sliced || trimmed.substring(0, maxLen).trim()}...`
}

export function getTempDir(): string {
  const isWin = process.platform === 'win32'
  return isWin
    ? `${process.env.TEMP || 'C:\\Temp'}\\download-everything`
    : '/tmp/download-everything'
}

export async function ensureTempDir(): Promise<string> {
  const dir = getTempDir()
  try {
    await mkdir(dir, { recursive: true })
  } catch { /* dir may already exist */ }

  return dir
}

export function getDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR
  const isWin = process.platform === 'win32'
  return isWin
    ? join(process.cwd(), 'data')
    : '/data'
}

export async function ensureDataDir(): Promise<string> {
  const dir = getDataDir()
  try {
    await mkdir(dir, { recursive: true })
  } catch { /* dir may already exist */ }

  return dir
}

export function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const prefix = { info: '✅', warn: '⚠️', error: '❌' }[level]
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : ''
  const logLine = `${prefix} [${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`

  console.log(`${prefix} [${timestamp}] ${message}`, meta ? JSON.stringify(meta) : '')

  // บันทึก Log ถาวรลงไฟล์ backend/logs/backend.log
  ensureLogsDir().then(() => {
    appendFile(logFilePath, logLine, 'utf-8').catch(() => {})
  }).catch(() => {})
}

/**
 * ปิดการดัดแปลง Facebook CDN URL ชั่วคราว 
 * เพราะการเปลี่ยน path/query จะทำให้ signature (oh=...) พัง ส่งผลให้โหลดรูปไม่ได้ (403 Forbidden)
 */
export function upscaleFacebookCdnUrl(url: string): string {
  // ไม่ดัดแปลง URL ที่ถูก signed แล้ว
  return url
}

/**
 * ปิดการดัดแปลง Instagram CDN URL ชั่วคราว
 */
export function upscaleInstagramCdnUrl(url: string): string {
  // ไม่ดัดแปลง URL ที่ถูก signed แล้ว
  return url
}

/**
 * ถอดรหัส HTML entities ทั้งหมด รวมถึง &#xNNNN; (ภาษาไทย) และ &#NNN;
 */
export function decodeAllHtmlEntities(str: string): string {
  return str
    // Named entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, '/')
    // Hex entities: &#xE42; &#xe42; etc. (ภาษาไทย อยู่ในช่วง U+0E00-U+0E7F)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    // Decimal entities: &#3585; etc.
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

let cachedCookiesPath: string | null = null

/**
 * โหลดคุกกี้ของ YouTube จาก Environment Variable หรือไฟล์เครื่อง
 */
export async function initCookies(): Promise<void> {
  const cookiesText = process.env.YT_DLP_COOKIES_TEXT
  const dataDir = await ensureDataDir()
  const cookiesDir = join(dataDir, 'cookies')
  try {
    await mkdir(cookiesDir, { recursive: true })
  } catch {}

  const persistentCookiesPath = join(cookiesDir, 'cookies.txt')

  if (cookiesText) {
    try {
      await Bun.write(persistentCookiesPath, cookiesText.trim())
      cachedCookiesPath = persistentCookiesPath
      log('info', `✅ YouTube Cookies initialized at persistent location: ${persistentCookiesPath}`)
    } catch (err) {
      log('error', `Failed to initialize YouTube Cookies: ${(err as Error).message}`)
    }
  } else {
    // เช็คกรณีใส่ไฟล์คุกกี้ไว้ตรงๆ
    const localBackendPath = './cookies.txt'
    const localRootPath = '../cookies.txt'
    
    if (await Bun.file(persistentCookiesPath).exists()) {
      cachedCookiesPath = persistentCookiesPath
      log('info', `✅ Persistent cookies.txt found at: ${persistentCookiesPath}`)
    } else if (await Bun.file(localBackendPath).exists()) {
      cachedCookiesPath = localBackendPath
      log('info', `✅ Local cookies.txt found in backend directory`)
    } else if (await Bun.file(localRootPath).exists()) {
      cachedCookiesPath = localRootPath
      log('info', `✅ Local cookies.txt found in root directory`)
    }
  }
}

export function getCookiesPath(): string | null {
  return cachedCookiesPath
}

/**
 * เติมแฟล็ก Proxy และ Cookies ในคำสั่ง yt-dlp โดยอัตโนมัติ
 */
export function getYtDlpArgs(baseArgs: string[]): string[] {
  // ดึงคำสั่งแรกสุดออก (ปกติคือ 'yt-dlp') และเก็บอาร์กิวเมนต์ที่เหลือ
  const binary = baseArgs[0]
  const args = baseArgs.slice(1)
  
  // แทรก Proxy
  if (process.env.YT_DLP_PROXY) {
    args.push('--proxy', process.env.YT_DLP_PROXY)
  }
  
  // แทรก Cookies
  const cookiesPath = getCookiesPath()
  if (cookiesPath) {
    args.push('--cookies', cookiesPath)
  }
  
  return [binary, ...args]
}
