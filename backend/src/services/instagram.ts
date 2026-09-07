import type { MediaInfo, DownloadResult, ContentType, DownloadStage } from '../types'
import { AppError } from '../utils/errors'
import { log, decodeAllHtmlEntities, getCookiesPath, getDataDir } from '../utils/helpers'
import { safeFetch } from '../utils/security'
import { profileImageFromHtml } from '../utils/mediaQuality'
import { getGenericInfo, downloadGeneric } from './generic'
import { join } from 'node:path'

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_IG_APP = 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-S918B; dm3q; qcom; en_US; 458229258)'
const IG_APP_ID = '936619743392459'

/**
 * ดึง Cookie ของ Instagram จาก cookies.txt หรือ Environment Variable
 */
export async function getInstagramCookieHeader(): Promise<string | null> {
  if (process.env.INSTAGRAM_COOKIE) {
    return process.env.INSTAGRAM_COOKIE.trim()
  }

  const cookiesPath = getCookiesPath() || join(getDataDir(), 'cookies', 'cookies.txt')
  try {
    const file = Bun.file(cookiesPath)
    if (await file.exists()) {
      const text = await file.text()
      const cookies: string[] = []
      for (const line of text.split('\n')) {
        const trimmed = line.trim().replace(/^#HttpOnly_/, '')
        if (!trimmed || trimmed.startsWith('#')) continue
        const parts = trimmed.split('\t')
        if (parts.length >= 7) {
          const domain = parts[0]
          const name = parts[5]
          const value = parts[6]
          const host = domain.replace(/^\./, '').toLowerCase()
          const expires = Number(parts[4])
          if ((host === 'instagram.com' || host.endsWith('.instagram.com')) && (expires === 0 || expires > Date.now() / 1000)) {
            cookies.push(`${name}=${value}`)
          }
        }
      }
      if (cookies.length > 0) {
        return cookies.join('; ')
      }
    }
  } catch {}

  return null
}

export async function getInstagramInfo(
  url: string,
  identifier: string,
  contentType: ContentType = 'profile',
  signal?: AbortSignal
): Promise<MediaInfo> {
  // 1. Stories require authentication / are temporary
  if (contentType === 'story') {
    throw new AppError(
      'AUTH_REQUIRED',
      'Instagram Stories เป็นเนื้อหาชั่วคราวและต้องเข้าสู่ระบบ จึงไม่สามารถดาวน์โหลดแบบสาธารณะได้ครับ',
      403,
      'กรุณาใช้ลิงก์ Instagram โพสต์ (Post), Reels หรือ Profile แทนครับ'
    )
  }

  // 2. Reels & Posts -> Delegate to yt-dlp extractor
  if (contentType === 'reel' || contentType === 'post') {
    try {
      const genericInfo = await getGenericInfo(url, 'instagram', signal)
      genericInfo.contentType = contentType
      return genericInfo
    } catch (err) {
      log('warn', `Instagram generic extractor failed for ${contentType}: ${(err as Error).message}`)
      // Fall through to profile extraction only if it might be a profile URL mistagged
      throw err
    }
  }

  // 3. Profile Avatar
  const cleanUsername = (identifier || '').replace(/[/?#].*$/, '')
  let profilePicUrl = ''
  let displayName = cleanUsername
  let resolution = 'ความละเอียดจากต้นทาง'

  log('info', `Instagram: processing profile @${cleanUsername}`)

  // Method 1: Anonymous / Authenticated API
  try {
    const igCookie = await getInstagramCookieHeader()
    const headers: Record<string, string> = {
      'User-Agent': UA_IG_APP,
      'X-IG-App-ID': IG_APP_ID,
      'Accept': 'application/json',
    }
    if (igCookie) {
      headers['Cookie'] = igCookie
    }

    const apiResp = await safeFetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${cleanUsername}`, {
      headers,
      signal,
    })

    if (apiResp.ok) {
      log('info', `Instagram: web_profile_info → HTTP 200 (HD profile available)`)
      const data = await apiResp.json() as any
      const user = data?.data?.user
      if (user) {
        const fullName = (user.full_name || '').trim()
        displayName = fullName ? `${fullName} (@${cleanUsername})` : `@${cleanUsername}`

        if (user.hd_profile_pic_versions && Array.isArray(user.hd_profile_pic_versions) && user.hd_profile_pic_versions.length > 0) {
          const sorted = [...user.hd_profile_pic_versions].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))
          profilePicUrl = sorted[0].url
          resolution = `${sorted[0].width}x${sorted[0].height}px (Full HD)`
        } else if (user.hd_profile_pic_url_info?.url) {
          profilePicUrl = user.hd_profile_pic_url_info.url
          resolution = '1080x1080px (Full HD)'
        } else if (user.profile_pic_url_hd) {
          profilePicUrl = user.profile_pic_url_hd
          resolution = '1080x1080px (Full HD)'
        } else if (user.profile_pic_url) {
          profilePicUrl = user.profile_pic_url
          resolution = 'ความละเอียดจาก Instagram'
        }
      }
    }
  } catch (e) {
    log('warn', `Instagram: API failed -> ${(e as Error).message}`)
  }

  // Method 2: HTML Scrape Fallback
  if (!profilePicUrl) {
    log('info', `Instagram: trying HTML scrape fallback...`)
    try {
      const resp = await safeFetch(`https://www.instagram.com/${cleanUsername}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        signal,
      })
      if (resp.ok) {
        const html = await resp.text()
        profilePicUrl = profileImageFromHtml(html) || ''
        if (profilePicUrl) resolution = 'รูปใหญ่จากข้อมูลต้นทาง'
        const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
        if (!profilePicUrl && ogMatch) {
          const pic = decodeAllHtmlEntities(ogMatch[1])
          if (
            !pic.includes('instagram-logo') && 
            !pic.includes('static/images') && 
            !pic.includes('rsrc.php') &&
            !pic.includes('static.cdninstagram.com')
          ) {
            profilePicUrl = pic
            resolution = '150px (Instagram จำกัดสิทธิ์สาธารณะ)'
          }
        }
      }
    } catch (e) {
      log('warn', `Instagram: HTML scrape failed -> ${(e as Error).message}`)
    }
  }

  if (!profilePicUrl) {
    throw new AppError(
      'AUTH_REQUIRED',
      `Instagram ปิดกั้นการดูโปรไฟล์ @${cleanUsername} สำหรับคำขอสาธารณะ`,
      403,
      'Instagram จำกัดการเข้าถึงโปรไฟล์แบบไม่ล็อกอิน ลองใช้ลิงก์โพสต์หรือ Reels สาธารณะ หรือใส่ Instagram Cookie ในระบบเพื่อปลดล็อกได้ครับ'
    )
  }

  if (!displayName || !displayName.trim()) {
    displayName = `@${cleanUsername}`
  }

  const option = { 
    id: 'profile_hd', 
    label: `ดาวน์โหลดรูปโปรไฟล์ (${resolution})`, 
    format: 'jpg', 
    quality: resolution 
  }

  return {
    platform: 'instagram',
    contentType: 'profile',
    title: displayName,
    thumbnail: profilePicUrl,
    description: resolution.includes('150px')
      ? 'Instagram ส่งมาเฉพาะรูปตัวอย่าง 150px สำหรับคำขอสาธารณะที่ไม่ได้ล็อกอิน คุณสามารถใส่ Instagram Cookie ในระบบเพื่อปลดล็อกภาพ Full HD 1080p ได้ครับ'
      : `รูปโปรไฟล์ Instagram ของ @${cleanUsername}`,
    items: [
      {
        id: 'item_profile',
        kind: 'image',
        title: displayName,
        thumbnail: profilePicUrl,
        options: [option],
      }
    ],
    options: [option],
  }
}

export async function downloadInstagram(
  url: string,
  identifier: string,
  contentType: ContentType = 'profile',
  optionId?: string,
  signal?: AbortSignal,
  onProgress?: (progress: number, stage: DownloadStage) => void,
  cachedMeta?: { title?: string; filename?: string }
): Promise<DownloadResult> {
  // If it's a reel or post video, use generic downloader
  if ((contentType === 'reel' || contentType === 'post') && optionId !== 'profile_hd') {
    return downloadGeneric(url, optionId || 'video_best', 'instagram', signal, onProgress, cachedMeta)
  }

  let cleanUsername = (identifier || '').replace(/[/?#].*$/, '').trim()
  if (!cleanUsername) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean)
      cleanUsername = parts[0] || 'instagram_user'
    } catch {
      cleanUsername = 'instagram_user'
    }
  }

  onProgress?.(10, 'downloading')
  const info = await getInstagramInfo(url, cleanUsername, 'profile', signal)
  let imageUrl = info.thumbnail || ''

  if (!imageUrl) throw new AppError('DOWNLOAD_FAILED', 'ไม่พบ URL รูปโปรไฟล์')

  if (imageUrl.startsWith('/api/proxy-image')) {
    const parsed = new URL(imageUrl, 'http://localhost')
    imageUrl = parsed.searchParams.get('url') || imageUrl
  }

  log('info', `Instagram: streaming → ${imageUrl.substring(0, 120)}...`)

  const imgResp = await safeFetch(imageUrl, { 
    headers: { 'User-Agent': UA_DESKTOP }, 
    signal 
  })
  if (!imgResp.ok) throw new AppError('DOWNLOAD_FAILED', `HTTP ${imgResp.status}`)
  if (!imgResp.body) throw new AppError('DOWNLOAD_FAILED', 'ไม่สามารถอ่านข้อมูลรูปภาพได้')

  onProgress?.(100, 'ready')
  return {
    stream: imgResp.body,
    filename: `${cleanUsername}_profile_HD.jpg`,
    contentType: 'image/jpeg'
  }
}

