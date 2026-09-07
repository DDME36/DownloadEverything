import type { MediaInfo, DownloadResult, ContentType, DownloadStage, DownloadOption, MediaItem } from '../types'
import { AppError } from '../utils/errors'
import { log, decodeAllHtmlEntities, getCookiesPath, getDataDir } from '../utils/helpers'
import { safeFetch } from '../utils/security'
import { getGenericInfo, downloadGeneric } from './generic'
import { join } from 'path'

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_CRAWLER = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

function isFacebookLoginWall(html: string): boolean {
  const title = html.match(/<title[^>]*>([^<]*)/i)?.[1] || ''
  return /log in to facebook|เข้าสู่ระบบ facebook/i.test(title) ||
    /<form\b[^>]*\bid\s*=\s*["']login_form["']/i.test(html)
}

/**
 * ดึง Cookie ของ Facebook จาก cookies.txt หรือ Environment Variable
 */
async function getFacebookCookie(): Promise<string> {
  const envCookie = process.env.FACEBOOK_COOKIE
  if (envCookie?.trim()) return envCookie.trim()

  const cookiesPath = getCookiesPath() || join(getDataDir(), 'cookies', 'cookies.txt')
  try {
    const file = Bun.file(cookiesPath)
    if (await file.exists()) {
      const text = await file.text()
      const lines = text.split('\n')
      const cookies: string[] = []
      for (const line of lines) {
        const trimmed = line.trim().replace(/^#HttpOnly_/, '')
        if (trimmed.startsWith('#') || !trimmed) continue
        const parts = trimmed.split('\t')
        if (parts.length >= 7) {
          const domain = parts[0]
          const name = parts[5]
          const value = parts[6]?.trim()
          const host = domain.replace(/^\./, '').toLowerCase()
          const expires = Number(parts[4])
          if ((host === 'facebook.com' || host.endsWith('.facebook.com')) &&
              (expires === 0 || expires > Date.now() / 1000) && name && value) {
            cookies.push(`${name}=${value}`)
          }
        }
      }
      if (cookies.length > 0) {
        return cookies.join('; ')
      }
    }
  } catch (err) {
    log('warn', `Failed to parse cookies.txt for Facebook: ${(err as Error).message}`)
  }

  return ''
}

export async function getFacebookInfo(
  url: string,
  identifier: string,
  contentType: ContentType = 'profile',
  signal?: AbortSignal
): Promise<MediaInfo> {
  const isVideo = contentType === 'watch' || contentType === 'reel' || contentType === 'video' ||
    url.includes('/video') || url.includes('/watch') || url.includes('fb.watch') || url.includes('/reel') ||
    url.includes('/share/v/') || url.includes('/share/r/') || url.includes('/share/')

  // 1. Videos & Reels -> Delegate to yt-dlp extractor
  if (isVideo) {
    try {
      const genericInfo = await getGenericInfo(url, 'facebook', signal)
      genericInfo.contentType = contentType === 'profile' ? 'video' : contentType
      return genericInfo
    } catch (err) {
      log('warn', `Facebook generic video extractor failed: ${(err as Error).message}`)
      // If it's explicitly a video or watch URL, don't fallback to scraping profile picture
      if (contentType === 'watch' || contentType === 'reel' || url.includes('fb.watch')) {
        throw err
      }
    }
  }

  // 2. Profile or Photo
  const cleanId = identifier.replace(/[/?#].*$/, '')
  let displayName = cleanId
  let mediaUrl = ''
  let ogImageUrl = ''
  const finalUrlType = (contentType === 'image' || url.includes('/photo') || url.includes('/posts/')) ? 'photo' : 'profile'

  log('info', `Facebook: processing "${cleanId}" as ${finalUrlType}`)

  let coverImageUrl = ''

  try {
    const targetUrl = finalUrlType === 'photo' ? url : `https://www.facebook.com/${cleanId}`
    const fbCookie = await getFacebookCookie()
    
    const headers: Record<string, string> = {
      'User-Agent': UA_DESKTOP,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    }
    if (fbCookie) {
      headers['Cookie'] = fbCookie
    }

    // 1. ดึงด้วย Desktop Chrome User-Agent ก่อนเสมอ (ได้ SSR HTML ตัวเต็มพร้อมรูปโปรไฟล์และหน้าปก)
    let resp = await safeFetch(targetUrl, {
      headers,
      signal,
    })

    let html = ''
    let isLoginWall = false
    log('info', 'Facebook: desktop response', { status: resp.status, cookiePresent: !!fbCookie })

    if (resp.ok) {
      html = await resp.text()
      // Public profiles can contain login links. A login link alone is not a wall.
      if (isFacebookLoginWall(html)) {
        isLoginWall = true
        log('warn', `Facebook: Desktop request encountered login wall for "${cleanId}"`)
      }
    }

    // หากไม่สำเร็จ หรือเจอ Login wall ให้ fallback ไปใช้ Facebook Crawler UA
    if (!resp.ok || isLoginWall) {
      log('info', `Facebook: fallback to Crawler UA for "${cleanId}"`)
      const crawlerHeaders: Record<string, string> = {
        'User-Agent': UA_CRAWLER,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
      if (fbCookie) {
        crawlerHeaders['Cookie'] = fbCookie
      }
      const crawlerResp = await safeFetch(targetUrl, {
        headers: crawlerHeaders,
        signal,
      })
      log('info', 'Facebook: crawler response', { status: crawlerResp.status, cookiePresent: !!fbCookie })
      if (crawlerResp.ok) {
        const crawlerHtml = await crawlerResp.text()
        if (!isFacebookLoginWall(crawlerHtml)) {
          html = crawlerHtml
          resp = crawlerResp
          isLoginWall = false
        }
      }
    }

    if (resp.ok && !isLoginWall) {
      const normalizedHtml = html.replace(/\\\//g, '/')

      // Extract Title
      const titleMatch = normalizedHtml.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        const rawTitle = decodeAllHtmlEntities(titleMatch[1])
        if (!rawTitle.includes('เข้าสู่ระบบ Facebook') && !rawTitle.toLowerCase().includes('log in to facebook')) {
          displayName = rawTitle
            .replace(/(\s*[|\-–—]\s*Facebook.*$|\s*•\s*Facebook.*$)/i, '')
            .trim()
        }
      }

      // 1. ดึงรูปโปรไฟล์โดยตรงจาก CDN URL หมวด /t39.30808-1/ (รหัสเฉพาะของรูปโปรไฟล์ Facebook)
      if (finalUrlType === 'profile') {
        const profileMatches = Array.from(normalizedHtml.matchAll(/https:\/\/scontent[^"'<>]+\.fbcdn\.net[^"'<>]*\/t39\.30808-1\/[^"'<>]+/g))
          .map(m => decodeAllHtmlEntities(m[0].replace(/\\/g, '')))

        if (profileMatches.length > 0) {
          // Select a published size; never modify a signed CDN URL.
          const hdCandidate = profileMatches.find(u => u.includes('mx1200x1200') || u.includes('s960x960') || u.includes('s720x720')) || profileMatches[0]
          mediaUrl = hdCandidate
        }

        // ดึงรูปหน้าปก (Cover Photo) หมวด /t39.30808-6/
        const coverMatches = Array.from(normalizedHtml.matchAll(/https:\/\/scontent[^"'<>]+\.fbcdn\.net[^"'<>]*\/t39\.30808-6\/[^"'<>]+/g))
          .map(m => decodeAllHtmlEntities(m[0].replace(/\\/g, '')))

        if (coverMatches.length > 0) {
          const hdCover = coverMatches.find(u => u.includes('s960x960') || u.includes('mx750')) || coverMatches[0]
          coverImageUrl = hdCover
        }
      }

      // 2. สำหรับ Photo Posts หรือกรณีทั่วไป: ค้นหา CDN รูปภาพขนาดใหญ่ใน HTML
      if (finalUrlType === 'photo' || !mediaUrl) {
        const cdnMatches = Array.from(normalizedHtml.matchAll(/https:\/\/scontent[^"'<>]+\.fbcdn\.net[^"'<>]*\/t39\.30808-6\/[^"'<>]+/g))
          .map(m => decodeAllHtmlEntities(m[0].replace(/\\/g, '')))
        
        if (cdnMatches.length > 0) {
          const validHdImages = cdnMatches.filter(u => 
            !u.includes('p100x100') && 
            !u.includes('p50x50') &&
            !u.includes('176159830277856')
          )
          if (validHdImages.length > 0) {
            const chosen = validHdImages[0]
            mediaUrl = chosen
          }
        }
      }

      // Extract general OpenGraph image
      const ogMatch = normalizedHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      if (ogMatch) {
        ogImageUrl = decodeAllHtmlEntities(ogMatch[1])
      }
    }
  } catch (e) {
    log('warn', `Facebook task failed: ${(e as Error).message}`)
  }

  // Fallback to og:image if mediaUrl is still missing
  if (!mediaUrl && ogImageUrl && (ogImageUrl.includes('fbcdn.net') || ogImageUrl.includes('fbsbx.com'))) {
    mediaUrl = ogImageUrl
  }

  if (!mediaUrl) {
    throw new AppError('AUTH_REQUIRED', `ไม่สามารถดึงรูปภาพหรือโปรไฟล์ Facebook นี้ได้`, 403, 'Facebook ปิดกั้นการดูเนื้อหานี้สำหรับคำขอสาธารณะ หรือเนื้อหานี้ตั้งค่าเป็นส่วนตัว แนะนำเพิ่ม Cookies Facebook ใน cookies.txt')
  }

  const options: DownloadOption[] = [
    { id: 'profile_hd', label: 'ดาวน์โหลดรูปโปรไฟล์ (HD)', format: 'jpg', quality: 'HD' }
  ]

  const items: MediaItem[] = [
    {
      id: 'item_1',
      kind: 'image',
      title: `${displayName || cleanId} (Profile)`,
      thumbnail: mediaUrl,
      url: mediaUrl,
      options: [
        { id: 'profile_hd', label: 'ดาวน์โหลดรูปโปรไฟล์ (HD)', format: 'jpg', quality: 'HD' }
      ],
    }
  ]

  if (coverImageUrl && coverImageUrl !== mediaUrl) {
    options.push({ id: 'cover_hd', label: 'ดาวน์โหลดรูปหน้าปก (Cover HD)', format: 'jpg', quality: 'HD' })
    items.push({
      id: 'item_2',
      kind: 'image',
      title: `${displayName || cleanId} (Cover)`,
      thumbnail: coverImageUrl,
      url: coverImageUrl,
      options: [
        { id: 'cover_hd', label: 'ดาวน์โหลดรูปหน้าปก (Cover HD)', format: 'jpg', quality: 'HD' }
      ],
    })
  }

  return {
    platform: 'facebook',
    contentType: finalUrlType === 'photo' ? 'image' : 'profile',
    title: displayName || cleanId,
    thumbnail: mediaUrl,
    description: `รูปภาพจาก Facebook: ${displayName || cleanId}`,
    items,
    options,
  }
}

export async function downloadFacebook(
  url: string,
  identifier: string,
  contentType: ContentType = 'profile',
  optionId?: string,
  signal?: AbortSignal,
  onProgress?: (progress: number, stage: DownloadStage) => void,
  cachedMeta?: MediaInfo
): Promise<DownloadResult> {
  const isVideo = contentType === 'watch' || contentType === 'reel' || contentType === 'video' ||
    url.includes('/video') || url.includes('/watch') || url.includes('fb.watch') || url.includes('/reel')

  if (isVideo && optionId !== 'media_hd' && optionId !== 'profile_hd' && optionId !== 'cover_hd') {
    return downloadGeneric(url, optionId || 'video_best', 'facebook', signal, onProgress, cachedMeta)
  }

  let cleanId = (identifier || '').replace(/[/?#].*$/, '')
  if (!cleanId || cleanId === 'media_hd' || cleanId === 'profile_hd' || cleanId === 'cover_hd') {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean)
      cleanId = parts[parts.length - 1] || 'facebook_media'
    } catch {
      cleanId = 'facebook_media'
    }
  }

  onProgress?.(10, 'downloading')

  // 1. ดึง URL รูปภาพจาก cachedMeta ก่อนเสมอ เพื่อป้องกันการขูดหน้าเว็บซ้ำรอบสอง ซึ่งทำให้ Facebook rate-limit/login wall
  let imageUrl = ''
  if (cachedMeta) {
    if (optionId === 'cover_hd') {
      const coverItem = cachedMeta.items?.find(i => i.options.some(o => o.id === 'cover_hd'))
      imageUrl = coverItem?.url || coverItem?.thumbnail || ''
    }
    if (!imageUrl && optionId !== 'cover_hd') {
      imageUrl = cachedMeta.thumbnail || cachedMeta.items?.[0]?.url || cachedMeta.items?.[0]?.thumbnail || ''
    }
  }

  // 2. หากไม่มีใน cache จึงค่อยเรียก getFacebookInfo
  if (!imageUrl) {
    const info = await getFacebookInfo(url, cleanId, contentType, signal)
    if (optionId === 'cover_hd') {
      const coverItem = info.items?.find(i => i.options.some(o => o.id === 'cover_hd'))
      imageUrl = coverItem?.url || coverItem?.thumbnail || ''
    } else {
      imageUrl = info.thumbnail || info.items?.[0]?.thumbnail || ''
    }
  }

  if (!imageUrl) throw new AppError('DOWNLOAD_FAILED', 'ไม่พบ URL รูปภาพ')

  // แกะ Proxy URL ออกเพื่อดาวน์โหลดตรงจาก CDN
  if (imageUrl.startsWith('/api/proxy-image') || imageUrl.includes('/api/proxy-image?url=')) {
    try {
      const parsed = new URL(imageUrl, 'http://localhost')
      imageUrl = parsed.searchParams.get('url') || imageUrl
    } catch {}
  }

  log('info', 'Facebook: downloading image', { host: new URL(imageUrl).hostname, cached: !!cachedMeta, option: optionId })

  const imgResp = await safeFetch(imageUrl, { 
    headers: { 'User-Agent': UA_DESKTOP }, 
    signal 
  })
  if (!imgResp.ok) throw new AppError('DOWNLOAD_FAILED', `ดาวน์โหลดรูปภาพไม่สำเร็จ (HTTP ${imgResp.status})`)
  if (!imgResp.headers.get('content-type')?.startsWith('image/')) {
    await imgResp.body?.cancel()
    throw new AppError('DOWNLOAD_FAILED', 'Facebook CDN ไม่ได้ส่งไฟล์รูปภาพกลับมา', 502)
  }
  if (!imgResp.body) throw new AppError('DOWNLOAD_FAILED', 'ไม่สามารถอ่านข้อมูลรูปภาพได้')

  onProgress?.(100, 'ready')
  const isCover = optionId === 'cover_hd'
  const isProfile = contentType === 'profile' || url.includes('profile.php') || (!url.includes('/photo') && !url.includes('/posts/'))
  const filenameType = isCover ? 'cover' : (isProfile ? 'profile' : 'photo')
  return {
    stream: imgResp.body,
    filename: `${cleanId}_${filenameType}_HD.jpg`,
    contentType: 'image/jpeg'
  }
}
