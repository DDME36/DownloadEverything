import type { MediaInfo, DownloadResult, ContentType, DownloadStage } from '../types'
import { AppError } from '../utils/errors'
import { log, decodeAllHtmlEntities } from '../utils/helpers'
import { safeFetch } from '../utils/security'
import { getGenericInfo, downloadGeneric } from './generic'

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_CRAWLER = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

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
    
    // 1. ดึงด้วย Desktop Chrome User-Agent ก่อนเสมอ (ได้ SSR HTML ตัวเต็มพร้อมรูปโปรไฟล์และหน้าปก)
    let resp = await safeFetch(targetUrl, {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      signal,
    })

    // หากไม่สำเร็จ ค่อย fallback ไปใช้ Facebook Crawler UA
    if (!resp.ok) {
      resp = await safeFetch(targetUrl, {
        headers: {
          'User-Agent': UA_CRAWLER,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal,
      })
    }

    if (resp.ok) {
      const html = await resp.text()
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
          // เลือกลิงก์ที่มีขนาดสูงสุด (mx1200x1200 หรือ s960x960) และตัด crop parameters ออก
          const hdCandidate = profileMatches.find(u => u.includes('mx1200x1200') || u.includes('s960x960') || u.includes('s720x720')) || profileMatches[0]
          mediaUrl = hdCandidate.replace(/&ctp=s\d+x\d+/g, '').replace(/ctp=s\d+x\d+&?/g, '')
        }

        // ดึงรูปหน้าปก (Cover Photo) หมวด /t39.30808-6/
        const coverMatches = Array.from(normalizedHtml.matchAll(/https:\/\/scontent[^"'<>]+\.fbcdn\.net[^"'<>]*\/t39\.30808-6\/[^"'<>]+/g))
          .map(m => decodeAllHtmlEntities(m[0].replace(/\\/g, '')))

        if (coverMatches.length > 0) {
          const hdCover = coverMatches.find(u => u.includes('s960x960') || u.includes('mx750')) || coverMatches[0]
          coverImageUrl = hdCover.replace(/&ctp=s\d+x\d+/g, '').replace(/ctp=s\d+x\d+&?/g, '')
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
            mediaUrl = validHdImages[0].replace(/&ctp=s\d+x\d+/g, '').replace(/ctp=s\d+x\d+&?/g, '')
          }
        }
      }

      // Extract general OpenGraph image
      const ogMatch = normalizedHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      if (ogMatch) {
        ogImageUrl = decodeAllHtmlEntities(ogMatch[1])
        ogImageUrl = ogImageUrl.replace(/&ctp=s\d+x\d+/g, '').replace(/ctp=s\d+x\d+&?/g, '')
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
    throw new AppError('AUTH_REQUIRED', `ไม่สามารถดึงรูปภาพหรือโปรไฟล์ Facebook นี้ได้`, 403, 'Facebook ปิดกั้นการดูเนื้อหานี้สำหรับคำขอสาธารณะ หรือเนื้อหานี้ตั้งค่าเป็นส่วนตัว')
  }

  const options = [
    { id: 'profile_hd', label: 'ดาวน์โหลดรูปโปรไฟล์ (HD)', format: 'jpg', quality: 'HD' }
  ]
  if (coverImageUrl && coverImageUrl !== mediaUrl) {
    options.push({ id: 'cover_hd', label: 'ดาวน์โหลดรูปหน้าปก (Cover HD)', format: 'jpg', quality: 'HD' })
  }

  return {
    platform: 'facebook',
    contentType: finalUrlType === 'photo' ? 'image' : 'profile',
    title: displayName || cleanId,
    thumbnail: mediaUrl,
    description: `รูปภาพจาก Facebook: ${displayName || cleanId}`,
    items: [
      {
        id: 'item_1',
        kind: 'image',
        title: displayName || cleanId,
        thumbnail: mediaUrl,
        options,
      }
    ],
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
  cachedMeta?: { title?: string; filename?: string }
): Promise<DownloadResult> {
  const isVideo = contentType === 'watch' || contentType === 'reel' || contentType === 'video' ||
    url.includes('/video') || url.includes('/watch') || url.includes('fb.watch') || url.includes('/reel')

  if (isVideo && optionId !== 'media_hd') {
    return downloadGeneric(url, optionId || 'video_best', 'facebook', signal, onProgress, cachedMeta)
  }

  let cleanId = (identifier || '').replace(/[/?#].*$/, '')
  if (!cleanId || cleanId === 'media_hd') {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean)
      cleanId = parts[parts.length - 1] || 'facebook_media'
    } catch {
      cleanId = 'facebook_media'
    }
  }

  onProgress?.(10, 'downloading')
  const info = await getFacebookInfo(url, cleanId, contentType, signal)
  let imageUrl = info.thumbnail || ''

  if (!imageUrl) throw new AppError('DOWNLOAD_FAILED', 'ไม่พบ URL รูปภาพ')

  if (imageUrl.startsWith('/api/proxy-image')) {
    const parsed = new URL(imageUrl, 'http://localhost')
    imageUrl = parsed.searchParams.get('url') || imageUrl
  }

  log('info', `Facebook: streaming → ${imageUrl.substring(0, 120)}...`)

  const imgResp = await safeFetch(imageUrl, { 
    headers: { 'User-Agent': UA_DESKTOP }, 
    signal 
  })
  if (!imgResp.ok) throw new AppError('DOWNLOAD_FAILED', `HTTP ${imgResp.status}`)
  if (!imgResp.body) throw new AppError('DOWNLOAD_FAILED', 'ไม่สามารถอ่านข้อมูลรูปภาพได้')

  onProgress?.(100, 'ready')
  const isProfile = contentType === 'profile' || url.includes('profile.php') || (!url.includes('/photo') && !url.includes('/posts/'))
  const filenameType = isProfile ? 'profile' : 'photo'
  return {
    stream: imgResp.body,
    filename: `${cleanId}_${filenameType}_HD.jpg`,
    contentType: 'image/jpeg'
  }
}
