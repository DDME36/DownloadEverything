import type { MediaInfo, DownloadResult } from '../types'
import { AppError } from '../utils/errors'
import { log, ensureTempDir, decodeAllHtmlEntities } from '../utils/helpers'

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'



export async function getFacebookInfo(url: string, identifier: string): Promise<MediaInfo> {
  const cleanId = identifier.replace(/[/?#].*$/, '')
  let displayName = cleanId
  let mediaUrl = ''
  let ogImageUrl = ''
  let finalUrlType = 'profile' // default

  // Determine URL type
  const isPhoto = url.includes('/photo') || url.includes('/photos/');
  const isVideo = url.includes('/video') || url.includes('/watch') || url.includes('fb.watch') || url.includes('/reel');
  const isPost = url.includes('/posts/') || url.includes('/permalink');

  if (isPhoto || isPost) finalUrlType = 'photo';
  if (isVideo) finalUrlType = 'video';

  log('info', `Facebook: processing "${cleanId}" as ${finalUrlType}`)

  try {
    // 1. Fetch the exact URL provided by the user, not just the ID, because Facebook routing can be strict for posts/photos
    const targetUrl = (isPhoto || isVideo || isPost) ? url : `https://www.facebook.com/${cleanId}`;
    
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Mode': 'navigate',
      },
      redirect: 'follow',
    })

    if (resp.ok) {
      const html = await resp.text()

      // Extract general OpenGraph image as fallback
      const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      if (ogMatch) {
        ogImageUrl = decodeAllHtmlEntities(ogMatch[1])
      }

      // Extract Title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        displayName = decodeAllHtmlEntities(titleMatch[1])
          .replace(/\s*[|\-–—]\s*Facebook.*$/i, '')
          .trim()
      }

      if (finalUrlType === 'photo' || finalUrlType === 'post') {
        // Scrape for high-res photo in Relay JSON
        // Often found near "image_crop_points" or "image":{"uri": "..."}
        // or `"url":"https://scontent..."`
        
        let foundHdUrl = '';
        
        // Search for HD images in the JSON graph
        const cdnMatches = Array.from(html.matchAll(/"(https:\\?\/\\?\/[^"]+\.fna\.fbcdn\.net[^"]+)"/g))
          .map(m => m[1].replace(/\\/g, ''));
        
        if (cdnMatches.length > 0) {
           // We filter out tiny images/icons by checking URL parameters like 'p100x100' or silhouette
           const validHdImages = cdnMatches.filter(u => 
              !u.includes('p100x100') && 
              !u.includes('p50x50') &&
              !u.includes('176159830277856') // Default silhouette ID
           );
           
           if (validHdImages.length > 0) {
             foundHdUrl = validHdImages[0]; // Usually the primary media is among the first few valid ones
           }
        }

        if (foundHdUrl) {
           mediaUrl = foundHdUrl;
           log('info', 'Facebook: found HD image from Relay/JSON payload');
        }
      } 
      
      // If it's a profile or if photo extraction failed, try Graph API
      if (!mediaUrl && finalUrlType === 'profile') {
        let userId = '';
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

        const graphTarget = userId || cleanId;
        const graphUrl = `https://graph.facebook.com/${graphTarget}/picture?width=2048&height=2048`;
        const testResp = await fetch(graphUrl, {
          headers: { 'User-Agent': UA_DESKTOP },
          redirect: 'follow', 
        });
        
        if (testResp.ok) {
          const finalUrl = testResp.url;
          const contentLength = parseInt(testResp.headers.get('content-length') || '0');
          const isSilhouette = (contentLength > 0 && contentLength <= 5000) || contentLength === 19030;
          
          if (!isSilhouette) {
            mediaUrl = finalUrl;
            log('info', 'Facebook: Graph API Native Signed HD URL profile picture found');
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
    log('info', `Facebook: using og:image fallback`)
  }

  // If literally nothing found, and it's a profile, try graph as last resort
  if (!mediaUrl && finalUrlType === 'profile') {
    mediaUrl = `https://graph.facebook.com/${cleanId}/picture?width=2048&height=2048`
  }

  return {
    platform: 'facebook',
    title: displayName || cleanId,
    thumbnail: mediaUrl,
    description: `รูปภาพจาก Facebook: ${displayName || cleanId}`,
    options: [{ id: 'media_hd', label: 'ดาวน์โหลด (HD)', format: 'jpg', quality: 'HD' }],
  }
}

export async function downloadFacebook(url: string, identifier: string): Promise<DownloadResult> {
  const info = await getFacebookInfo(url, identifier)
  const cleanId = identifier.replace(/[/?#].*$/, '')
  let imageUrl = info.thumbnail || ''

  if (!imageUrl) throw new AppError('DOWNLOAD_FAILED', 'ไม่พบ URL รูปภาพ')

  if (imageUrl.startsWith('/api/proxy-image')) {
    const parsed = new URL(imageUrl, 'http://localhost')
    imageUrl = parsed.searchParams.get('url') || imageUrl
  }

  log('info', `Facebook: downloading → ${imageUrl.substring(0, 120)}...`)

  const tempDir = await ensureTempDir()
  const filePath = `${tempDir}${process.platform === 'win32' ? '\\' : '/'}fb_${cleanId}_${Date.now()}.jpg`

  const imgResp = await fetch(imageUrl, { headers: { 'User-Agent': UA_DESKTOP }, redirect: 'follow' })
  if (!imgResp.ok) throw new AppError('DOWNLOAD_FAILED', `HTTP ${imgResp.status}`)

  await Bun.write(filePath, imgResp)

  const size = Bun.file(filePath).size
  log('info', `Facebook: ✅ saved (${(size / 1024).toFixed(1)} KB)`)

  const isProfile = url.includes('profile.php') || !url.includes('/photo') && !url.includes('/posts/');
  const filenameType = isProfile ? 'profile' : 'photo';
  return { filePath, filename: `${cleanId}_${filenameType}_HD.jpg`, contentType: 'image/jpeg' }
}
