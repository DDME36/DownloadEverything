export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
}

export function getTempDir(): string {
  const isWin = process.platform === 'win32'
  return isWin
    ? `${process.env.TEMP || 'C:\\Temp'}\\download-everything`
    : '/tmp/download-everything'
}

export async function ensureTempDir(): Promise<string> {
  const dir = getTempDir()
  const isWin = process.platform === 'win32'

  try {
    if (isWin) {
      await Bun.spawn(['cmd', '/c', `if not exist "${dir}" mkdir "${dir}"`], { stdout: 'ignore', stderr: 'ignore' }).exited
    } else {
      await Bun.spawn(['mkdir', '-p', dir], { stdout: 'ignore', stderr: 'ignore' }).exited
    }
  } catch { /* dir may already exist */ }

  return dir
}

export function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const prefix = { info: '✅', warn: '⚠️', error: '❌' }[level]
  console.log(`${prefix} [${timestamp}] ${message}`, meta ? JSON.stringify(meta) : '')
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
