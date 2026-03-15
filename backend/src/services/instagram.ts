import type { MediaInfo, DownloadResult } from '../types'
import { AppError } from '../utils/errors'
import { log, ensureTempDir, decodeAllHtmlEntities } from '../utils/helpers'

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_IG_APP = 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-S918B; dm3q; qcom; en_US; 458229258)'
const IG_APP_ID = '936619743392459'



export async function getInstagramInfo(url: string, username: string): Promise<MediaInfo> {
  const cleanUsername = username.replace(/[/?#].*$/, '')
  let profilePicUrl = ''
  let displayName = cleanUsername
  let resolution = '640px' // Instagram's current API limit (as of March 2026)

  log('info', `Instagram: processing @${cleanUsername}`)

  // ===== Method 1: Anonymous API (640px - Instagram's current limit) =====
  try {
    const apiResp = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${cleanUsername}`, {
      headers: {
        'User-Agent': UA_IG_APP,
        'X-IG-App-ID': IG_APP_ID,
        'Accept': 'application/json',
      },
    })

    if (apiResp.ok) {
      log('info', `Instagram: web_profile_info → HTTP 200`)
      const data = await apiResp.json() as any
      const user = data?.data?.user
      if (user) {
        displayName = user.full_name || displayName

        if (user.hd_profile_pic_url_info?.url) {
          profilePicUrl = user.hd_profile_pic_url_info.url
          log('info', `Instagram: got HD profile picture (${resolution})`)
        } else if (user.profile_pic_url_hd) {
          profilePicUrl = user.profile_pic_url_hd
          log('info', `Instagram: got profile_pic_url_hd (${resolution})`)
        } else if (user.profile_pic_url) {
          profilePicUrl = user.profile_pic_url
          log('info', `Instagram: got profile_pic_url`)
        }
      }
    }
  } catch (e) {
    log('warn', `Instagram: API failed -> ${(e as Error).message}`)
  }

  // ===== Method 2: HTML Scrape Fallback =====
  if (!profilePicUrl) {
    log('info', `Instagram: trying HTML scrape fallback...`)
    try {
      const resp = await fetch(`https://www.instagram.com/${cleanUsername}/`, {
        headers: {
          'User-Agent': UA_DESKTOP,
          'Accept': 'text/html',
        },
        redirect: 'follow',
      })
      if (resp.ok) {
        const html = await resp.text()
        const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
        if (ogMatch) {
          const pic = decodeAllHtmlEntities(ogMatch[1])
          if (!pic.includes('instagram-logo') && !pic.includes('static/images')) {
            profilePicUrl = pic
            log('info', `Instagram: got from og:image`)
          }
        }
      }
    } catch (e) {
      log('warn', `Instagram: HTML scrape failed -> ${(e as Error).message}`)
    }
  }

  if (!profilePicUrl) {
    throw new AppError('NO_IMAGE', `ไม่สามารถดึงรูปโปรไฟล์ @${cleanUsername} ได้`, 404)
  }

  log('info', `Instagram: final URL (${resolution}) → ${profilePicUrl.substring(0, 120)}...`)

  return {
    platform: 'instagram',
    title: displayName,
    thumbnail: profilePicUrl,
    description: `รูปโปรไฟล์ Instagram ของ @${cleanUsername}`,
    options: [{ 
      id: 'profile_hd', 
      label: `ดาวน์โหลดรูปโปรไฟล์ (${resolution})`, 
      format: 'jpg', 
      quality: 'HD' 
    }],
  }
}

export async function downloadInstagram(url: string, username: string): Promise<DownloadResult> {
  const info = await getInstagramInfo(url, username)
  const cleanUsername = username.replace(/[/?#].*$/, '')
  let imageUrl = info.thumbnail || ''

  if (!imageUrl) throw new AppError('DOWNLOAD_FAILED', 'ไม่พบ URL รูปโปรไฟล์')

  if (imageUrl.startsWith('/api/proxy-image')) {
    const parsed = new URL(imageUrl, 'http://localhost')
    imageUrl = parsed.searchParams.get('url') || imageUrl
  }

  log('info', `Instagram: downloading → ${imageUrl.substring(0, 120)}...`)

  const tempDir = await ensureTempDir()
  const filePath = `${tempDir}${process.platform === 'win32' ? '\\' : '/'}ig_${cleanUsername}_${Date.now()}.jpg`

  const imgResp = await fetch(imageUrl, { headers: { 'User-Agent': UA_DESKTOP }, redirect: 'follow' })
  if (!imgResp.ok) throw new AppError('DOWNLOAD_FAILED', `HTTP ${imgResp.status}`)

  await Bun.write(filePath, imgResp)

  const size = Bun.file(filePath).size
  log('info', `Instagram: ✅ saved (${(size / 1024).toFixed(1)} KB)`)

  return { filePath, filename: `${cleanUsername}_profile_HD.jpg`, contentType: 'image/jpeg' }
}
