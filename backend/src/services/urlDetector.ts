import type { Platform, DetectedUrl } from '../types'

const URL_PATTERNS: Record<Exclude<Platform, 'unknown'>, RegExp[]> = {
  youtube: [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/,
    /youtube\.com\/(?:embed|v)\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
  ],
  instagram: [
    /instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
    /instagram\.com\/reel\/([a-zA-Z0-9_-]+)/,
    /instagram\.com\/stories\/([a-zA-Z0-9._]+)/,
    /instagram\.com\/([a-zA-Z0-9._]+)/,
  ],
  facebook: [
    /facebook\.com\/profile\.php\?id=(\d+)/,
    /facebook\.com\/(?:photo|video|watch|reel)[\/?].*?(?:v=|\/)?(\d+)/,
    /facebook\.com\/([a-zA-Z0-9._-]+)/,
    /fb\.com\/([a-zA-Z0-9._-]+)/,
    /fb\.watch\/([a-zA-Z0-9_-]+)/,
  ],
  soundcloud: [
    /soundcloud\.com\/([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?)/,
  ],
  tiktok: [
    /tiktok\.com\/@([a-zA-Z0-9._-]+)\/video\/(\d+)/,
    /tiktok\.com\/.*?\/video\/(\d+)/,
    /vm\.tiktok\.com\/([a-zA-Z0-9]+)/,
    /vt\.tiktok\.com\/([a-zA-Z0-9]+)/,
  ],
  twitter: [
    /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/,
    /(?:twitter\.com|x\.com)\/i\/spaces\/([a-zA-Z0-9]+)/,
  ],
  reddit: [
    /reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9]+)/,
    /redd\.it\/([a-zA-Z0-9]+)/,
  ],
  vimeo: [
    /vimeo\.com\/(\d+)/,
    /vimeo\.com\/channels\/[^\/]+\/(\d+)/,
  ],
  dailymotion: [
    /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
    /dai\.ly\/([a-zA-Z0-9]+)/,
  ],
  twitch: [
    /twitch\.tv\/videos\/(\d+)/,
    /twitch\.tv\/([a-zA-Z0-9_]+)\/clip\/([a-zA-Z0-9_-]+)/,
  ],
}

/**
 * ลบ fragment (#...) และ trailing slash ออกจาก URL ก่อนวิเคราะห์
 */
function cleanUrl(url: string): string {
  return url
    .replace(/#.*$/, '')     // ลบ #hash
    .replace(/\/+$/, '')     // ลบ trailing /
    .replace(/\?+$/, '')     // ลบ trailing ?
    .trim()
}

/**
 * วิเคราะห์ URL แล้วบอกว่าเป็นแพลตฟอร์มไหน + ดึง identifier ออกมา
 */
export function detectUrl(url: string): DetectedUrl {
  let normalizedUrl = url.trim()
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl
  }

  // ลบ fragment และ noise ก่อน match
  const cleanedForMatch = cleanUrl(normalizedUrl)

  for (const [platform, patterns] of Object.entries(URL_PATTERNS)) {
    for (const pattern of patterns) {
      const match = cleanedForMatch.match(pattern)
      if (match) {
        let identifier = match[1] || ''
        // ลบ junk ออกจาก identifier
        identifier = identifier.replace(/[/?#].*$/, '').trim()

        return {
          platform: platform as Platform,
          originalUrl: normalizedUrl,
          identifier,
        }
      }
    }
  }

  return { platform: 'unknown', originalUrl: normalizedUrl, identifier: '' }
}

/**
 * ตรวจสอบว่าเป็น URL ที่ถูกต้องหรือไม่
 */
export function isValidUrl(url: string): boolean {
  try {
    const trimmed = url.trim()
    const withProtocol = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    new URL(withProtocol)
    return true
  } catch {
    return false
  }
}
