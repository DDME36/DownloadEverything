import type { MediaInfo, DownloadResult, ContentType, DownloadStage } from '../types'
import { AppError } from '../utils/errors'
import { log, decodeAllHtmlEntities, getCookiesPath, getDataDir } from '../utils/helpers'
import { safeFetch } from '../utils/security'
import { profileImageFromHtml } from '../utils/mediaQuality'
import { getGenericInfo, downloadGeneric } from './generic'
import { join } from 'node:path'
import sharp from 'sharp'

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
          let value = parts[6]?.trim()
          const host = domain.replace(/^\./, '').toLowerCase()
          const expires = Number(parts[4])
          if ((host === 'instagram.com' || host.endsWith('.instagram.com')) && (expires === 0 || expires > Date.now() / 1000) && name && value) {
            try {
              if (value.includes('%3A') || value.includes('%20')) {
                value = decodeURIComponent(value)
              }
            } catch {}
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
  let resolution = '1080x1080px (Full HD)'
  let upstreamError: AppError | null = null

  log('info', `Instagram: processing profile @${cleanUsername}`)

  // Method 1: Anonymous / Authenticated API
  try {
    const igCookie = await getInstagramCookieHeader()
    if (igCookie) {
      // ตรวจสอบว่าเป็นบัญชีของตัวเองใน Cookie หรือไม่ (API current_user มักตอบกลับ 200 OK ได้เสถียร)
      try {
        const cuResp = await safeFetch('https://www.instagram.com/api/v1/accounts/current_user/?edit=true', {
          headers: {
            'User-Agent': UA_IG_APP,
            'X-IG-App-ID': IG_APP_ID,
            'Accept': 'application/json',
            'Cookie': igCookie,
          },
          signal,
        })
        if (cuResp.ok) {
          const cuData = await cuResp.json() as any
          const cuUser = cuData?.user
          if (cuUser && cuUser.username?.toLowerCase() === cleanUsername.toLowerCase()) {
            displayName = (cuUser.full_name || '').trim() ? `${cuUser.full_name} (@${cleanUsername})` : `@${cleanUsername}`
            profilePicUrl = cuUser.hd_profile_pic_url_info?.url || cuUser.profile_pic_url || ''
            resolution = '1080x1080px (Full HD จากบัญชีของคุณ)'
          }
        }
      } catch {}
    }

    if (!profilePicUrl) {
      const headers: Record<string, string> = {
        'User-Agent': UA_DESKTOP,
        'X-IG-App-ID': IG_APP_ID,
        'Accept': 'application/json',
        'X-ASBD-ID': '129477',
        'X-IG-WWW-Claim': '0',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://www.instagram.com/${cleanUsername}/`,
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
      }
      if (igCookie) {
        headers['Cookie'] = igCookie
      }

      const apiResp = await safeFetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${cleanUsername}`, {
        headers,
        signal,
      })

      log('info', 'Instagram: profile API response', { status: apiResp.status, cookiePresent: !!igCookie })

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
            resolution = '1080x1080px (Full HD)'
          }
        }
      } else {
        const errText = await apiResp.text().catch(() => '')
        if (apiResp.status === 429 || /please wait a few minutes|too many requests/i.test(errText)) {
          upstreamError = new AppError('RATE_LIMITED', 'Instagram จำกัดคำขอจาก IP หรือ session ของเซิร์ฟเวอร์', 429,
            'หยุดลองซ้ำชั่วคราว แล้วตรวจ session และเส้นทางเครือข่ายบนเซิร์ฟเวอร์ ข้อความนี้ไม่ได้หมายความว่าบัญชีเป็น Private')
        } else if (errText.includes('challenge_required') || errText.includes('checkpoint_required')) {
          upstreamError = new AppError(
            'AUTH_REQUIRED',
            `Instagram บล็อกการดึงข้อมูลและติดสถานะ Checkpoint (challenge_required)`,
            403,
            'กรุณาเปิดแอป Instagram บนมือถือเพื่อกดยืนยันตัวตน ("This was me") เพื่อปลดล็อกบัญชี หรือใช้ลิงก์วิดีโอ/Reels สาธารณะแทนครับ'
          )
        }
        log('warn', `Instagram: web_profile_info returned ${apiResp.status}, falling back to HTML scrape...`)
      }
    }
  } catch (e) {
    if (e instanceof AppError) upstreamError = e
    else log('warn', `Instagram: API failed -> ${(e as Error).message}`)
  }

  // Method 2: HTML Scrape Fallback
  if (!profilePicUrl) {
    log('info', `Instagram: trying HTML scrape fallback...`)
    try {
      const igCookie = await getInstagramCookieHeader()
      const reqHeaders: Record<string, string> = {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
      }
      if (igCookie) {
        reqHeaders['Cookie'] = igCookie
      }
      const resp = await safeFetch(`https://www.instagram.com/${cleanUsername}/`, {
        headers: reqHeaders,
        signal,
      })
      log('info', 'Instagram: profile HTML response', { status: resp.status, cookiePresent: !!igCookie })
      if (resp.ok) {
        const html = await resp.text()

        // 1. ดึงรูปโปรไฟล์โดยเจาะจงเฉพาะเป้าหมาย cleanUsername (ป้องกันการได้รูปของ viewer / เจ้าของคุกกี้)
        profilePicUrl = profileImageFromHtml(html, cleanUsername) || ''
        if (profilePicUrl) resolution = '1080x1080px (Full HD)'

        // 2. ตรวจสอบ og:image
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
            resolution = '1080x1080px (Full HD)'
          }
        }

        // 3. ถ้าไม่พบรูปและเป็น Error Page ให้โยน NOT_FOUND
        if (!profilePicUrl && (html.includes('PolarisErrorRoot') || html.includes('httpErrorPage'))) {
          log('warn', `Instagram: profile @${cleanUsername} returned error page (may be private or not found)`)
          throw new AppError(
            'NOT_FOUND',
            `ไม่พบรูปโปรไฟล์ @${cleanUsername} (บัญชีนี้ถูกตั้งเป็นส่วนตัว Private หรือไม่มีผู้ใช้นี้)`,
            404,
            'หากเป็นบัญชีส่วนตัว บัญชี Instagram ในคุกกี้ต้องได้รับอนุมัติให้ติดตามก่อนจึงจะเข้าถึงได้ครับ'
          )
        }
      }
    } catch (e) {
      if (e instanceof AppError) {
        if (e.code === 'TOO_MANY_REDIRECTS' || e.code === 'REDIRECT_LOOP') {
          throw new AppError(
            'AUTH_REQUIRED',
            'คุกกี้ Instagram หมดอายุหรือติดการตรวจสอบความปลอดภัย (Checkpoint) จากระบบ กรุณาอัปเดต Cookie ใหม่ใน cookies.txt',
            403,
            'เปิดแอป Instagram บนมือถือเพื่อตรวจสอบและกดยืนยันตัวตน ("This was me") หรือคัดลอกคุกกี้ใหม่อีกครั้งครับ'
          )
        }
        throw e
      }
      log('warn', `Instagram: HTML scrape failed -> ${(e as Error).message}`)
    }
  }

  if (!profilePicUrl) {
    if (upstreamError) throw upstreamError
    throw new AppError(
      'AUTH_REQUIRED',
      `Instagram ปิดกั้นการดูโปรไฟล์ @${cleanUsername}`,
      403,
      'บัญชีนี้อาจเป็นบัญชีส่วนตัว (Private) หรือ Instagram บล็อกคำขอจากเซิร์ฟเวอร์ภายนอก ลองใช้ลิงก์โพสต์หรือ Reels สาธารณะแทนครับ'
    )
  }

  if (!displayName || !displayName.trim()) {
    displayName = `@${cleanUsername}`
  }

  const option = { 
    id: 'profile_hd', 
    label: `ดาวน์โหลดรูปโปรไฟล์ Full HD (1080x1080px)`, 
    format: 'jpg', 
    quality: '1080x1080px (Full HD)' 
  }

  return {
    platform: 'instagram',
    contentType: 'profile',
    title: displayName,
    thumbnail: profilePicUrl,
    description: `รูปโปรไฟล์ Instagram ของ @${cleanUsername} คุณภาพ Full HD 1080p`,
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
  cachedMeta?: MediaInfo
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

  // 1. ดึงจาก cachedMeta ก่อนเสมอ เพื่อป้องกันการยิง Instagram ซ้ำ ซึ่งอาจติด Rate limit หรือ Session challenge
  let imageUrl = ''
  if (cachedMeta) {
    imageUrl = cachedMeta.thumbnail || cachedMeta.items?.[0]?.url || cachedMeta.items?.[0]?.thumbnail || ''
  }

  // 2. หากไม่มีในแคช ค่อยดึงข้อมูลใหม่
  if (!imageUrl) {
    const info = await getInstagramInfo(url, cleanUsername, 'profile', signal)
    imageUrl = info.thumbnail || ''
  }

  if (!imageUrl) throw new AppError('DOWNLOAD_FAILED', 'ไม่พบ URL รูปโปรไฟล์')

  if (imageUrl.startsWith('/api/proxy-image') || imageUrl.includes('/api/proxy-image?url=')) {
    try {
      const parsed = new URL(imageUrl, 'http://localhost')
      imageUrl = parsed.searchParams.get('url') || imageUrl
    } catch {}
  }

  log('info', 'Instagram: downloading image', { host: new URL(imageUrl).hostname, cached: !!cachedMeta })

  const imgResp = await safeFetch(imageUrl, { 
    headers: { 'User-Agent': UA_DESKTOP }, 
    signal 
  })
  if (!imgResp.ok) throw new AppError('DOWNLOAD_FAILED', `HTTP ${imgResp.status}`)
  if (!imgResp.headers.get('content-type')?.startsWith('image/')) {
    await imgResp.body?.cancel()
    throw new AppError('DOWNLOAD_FAILED', 'Instagram CDN ไม่ได้ส่งไฟล์รูปภาพกลับมา', 502)
  }

  const arrayBuf = await imgResp.arrayBuffer()
  let imageBuffer = Buffer.from(arrayBuf)

  try {
    const meta = await sharp(imageBuffer).metadata()
    const width = meta.width || 0
    const height = meta.height || 0

    // หากภาพมีขนาดเล็กกว่า 1080px (เช่น 150x150 จากบัญชีส่วนตัว) ให้ทำการ Upscale ด้วย Sharp สู่ 1080x1080 Full HD
    if (width < 1080 || height < 1080) {
      log('info', `Instagram: upscaling profile picture from ${width}x${height} to 1080x1080 Full HD using Lanczos3`)
      imageBuffer = await sharp(imageBuffer)
        .resize(1080, 1080, {
          kernel: sharp.kernel.lanczos3,
          fit: 'cover',
          position: 'center',
        })
        .sharpen({ sigma: 1.0, m1: 1.0, m2: 2.0 })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer()
    }
  } catch (err) {
    log('warn', `Instagram: Sharp image processing skipped: ${(err as Error).message}`)
  }

  onProgress?.(100, 'ready')
  return {
    stream: new Response(imageBuffer).body as ReadableStream,
    filename: `${cleanUsername}_profile_1080p_HD.jpg`,
    contentType: 'image/jpeg',
    fileSize: imageBuffer.length,
  }
}

