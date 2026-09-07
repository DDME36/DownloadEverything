import type { MediaInfo, DownloadResult, ContentType, DownloadStage } from '../types'
import { AppError } from '../utils/errors'
import { log, decodeAllHtmlEntities } from '../utils/helpers'
import { safeFetch } from '../utils/security'
import { getGenericInfo, downloadGeneric } from './generic'

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const UA_CRAWLER = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

export async function getFacebookInfo(
  url: string,
  identifier: string,
  contentType: ContentType = 'profile',
  signal?: AbortSignal
): Promise<MediaInfo> {
  const isVideo = contentType === 'watch' || contentType === 'reel' || contentType === 'video' ||
    url.includes('/video') || url.includes('/watch') || url.includes('fb.watch') || url.includes('/reel')

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

  try {
    const targetUrl = finalUrlType === 'photo' ? url : `https://www.facebook.com/${cleanId}`
    
    // ลองดึงด้วย Mobile Safari UA ก่อน (ได้ SSR HTML พร้อม og:image ชัดเจน)
    let resp = await safeFetch(targetUrl, {
      headers: {
        'User-Agent': UA_MOBILE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal,
    })

    // หากไม่สำเร็จ ลองใช้ Facebook Crawler UA
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

      // Extract general OpenGraph image (รูปโปรไฟล์จริงหรือรูปโพสต์ความละเอียดสูง)
      const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      if (ogMatch) {
        ogImageUrl = decodeAllHtmlEntities(ogMatch[1])
        // ปลดล็อกความละเอียดสูงโดยการตัดตัวจำกัดขนาด thumbnail (ctp=s40x40, ctp=s720x720) ออก
        ogImageUrl = ogImageUrl.replace(/&ctp=s\d+x\d+/g, '').replace(/ctp=s\d+x\d+&?/g, '')
      }

      // Extract Title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        displayName = decodeAllHtmlEntities(titleMatch[1])
          .replace(/\s*[|\-–—]\s*Facebook.*$/i, '')
          .trim()
      }

      // ตรวจจับกรณี Facebook redirect ไปยังหน้า Login
      if (displayName.includes('เข้าสู่ระบบ') || displayName.toLowerCase().includes('log in') || displayName.toLowerCase().includes('login')) {
        throw new AppError(
          'AUTH_REQUIRED',
          'Facebook ปิดกั้นการดูโปรไฟล์นี้สำหรับคำขอสาธารณะ (ต้องเข้าสู่ระบบ Facebook)',
          403,
          'Facebook ไม่อนุญาตให้ดึงข้อมูลโปรไฟล์แบบไม่ล็อกอิน ลองใช้ลิงก์วิดีโอหรือ Reels สาธารณะแทนครับ'
        )
      }

      // สำหรับ Photo Posts: ค้นหา CDN รูปภาพขนาดใหญ่ใน HTML
      if (finalUrlType === 'photo') {
        const cdnMatches = Array.from(html.matchAll(/"(https:\\?\/\\?\/[^"]+\.fna\.fbcdn\.net[^"]+)"/g))
          .map(m => m[1].replace(/\\/g, ''))
        
        if (cdnMatches.length > 0) {
           const validHdImages = cdnMatches.filter(u => 
              !u.includes('p100x100') && 
              !u.includes('p50x50') &&
              !u.includes('176159830277856')
           )
           if (validHdImages.length > 0) {
             mediaUrl = validHdImages[0].replace(/&ctp=s\d+x\d+/g, '')
           }
        }
      } 
      
      // ดึงรูปภาพจาก ogImageUrl เป็นลำดับแรกสุดสำหรับโปรไฟล์ (เพราะเป็นรูปจริงแน่นอน)
      if (!mediaUrl && ogImageUrl && (ogImageUrl.includes('fbcdn.net') || ogImageUrl.includes('fbsbx.com'))) {
        mediaUrl = ogImageUrl
      }

      // Try scraping profile picture from script tags if still missing
      if (!mediaUrl && finalUrlType === 'profile') {
        const profilePicRegexes = [
          /"profile_pic"\s*:\s*{\s*"uri"\s*:\s*"([^"]+)"/i,
          /"profile_picture"\s*:\s*{\s*"uri"\s*:\s*"([^"]+)"/i,
          /"profilePhoto"\s*:\s*{\s*"__typename"\s*:\s*"Photo"\s*,\s*"image"\s*:\s*{\s*"uri"\s*:\s*"([^"]+)"/i,
          /"accessibility_caption"\s*:\s*"Profile photo"[^}]+"uri"\s*:\s*"([^"]+)"/i
        ]
        
        for (const regex of profilePicRegexes) {
          const match = html.match(regex)
          if (match) {
            const rawUrl = match[1].replace(/\\/g, '')
            if (rawUrl.includes('fbcdn.net') && !rawUrl.includes('p100x100') && !rawUrl.includes('p50x50')) {
              mediaUrl = rawUrl.replace(/&ctp=s\d+x\d+/g, '')
              break
            }
          }
        }
      }
      
      // If it's a profile or if photo extraction failed, try Graph API
      if (!mediaUrl && finalUrlType === 'profile') {
        let userId = ''
        const idPatterns = [
          /"userID"\s*:\s*"(\d+)"/,
          /"entity_id"\s*:\s*"(\d+)"/,
          /"actorID"\s*:\s*"(\d+)"/,
          /"profileID"\s*:\s*"(\d+)"/,
          /content="fb:\/\/profile\/(\d+)"/,
        ]
        for (const p of idPatterns) {
          const m = html.match(p)
          if (m) { userId = m[1]; break }
        }

        const graphTarget = userId || cleanId
        const graphUrl = `https://graph.facebook.com/${graphTarget}/picture?width=2048&height=2048`
        const testResp = await safeFetch(graphUrl, {
          headers: { 'User-Agent': UA_MOBILE },
          signal,
        })
        
        if (testResp.ok) {
          const finalUrl = testResp.url
          const contentLength = parseInt(testResp.headers.get('content-length') || '0', 10)
          const isSilhouette = (contentLength > 0 && contentLength <= 5000) || contentLength === 19030
          
          if (!isSilhouette) {
            mediaUrl = finalUrl
          }
        }
      }
    }
  } catch (e) {
    log('warn', `Facebook task failed: ${(e as Error).message}`)
  }

  // Fallback to og:image
  if (!mediaUrl && ogImageUrl) {
    mediaUrl = ogImageUrl
  }

  if (!mediaUrl) {
    throw new AppError('AUTH_REQUIRED', `ไม่สามารถดึงรูปภาพหรือโปรไฟล์ Facebook นี้ได้`, 403, 'Facebook บล็อกการเข้าถึงโปรไฟล์แบบไม่ล็อกอิน ลองใช้ลิงก์วิดีโอหรือ Reels สาธารณะแทนครับ')
  }

  const option = { id: 'media_hd', label: 'ดาวน์โหลดรูปภาพ (HD)', format: 'jpg', quality: 'HD' }

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
        options: [option],
      }
    ],
    options: [option],
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
    headers: { 'User-Agent': UA_MOBILE }, 
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
