import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { detectUrl, isValidUrl } from './services/urlDetector'
import { getYoutubeInfo, downloadYoutube } from './services/youtube'
import { getInstagramInfo, downloadInstagram } from './services/instagram'
import { getFacebookInfo, downloadFacebook } from './services/facebook'
import { getSoundcloudInfo, downloadSoundcloud } from './services/soundcloud'
import { getGenericInfo, downloadGeneric } from './services/generic'
import { AppError } from './utils/errors'
import { log } from './utils/helpers'
import { unlink } from 'node:fs/promises'
import type { ApiResponse, DownloadResult } from './types'

const PORT = parseInt(process.env.PORT || '3001')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const app = new Elysia()
  .use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition'],
  }))

  // ===== Favicon =====
  .get('/favicon.ico', ({ set }) => { set.status = 204; return '' })

  // ===== Health Check =====
  .get('/health', () => ({ status: 'ok', time: new Date().toISOString() }))

  // ===== Proxy รูปภาพ (แก้ CORS ของ Facebook/Instagram CDN) =====
  .get('/api/proxy-image', async ({ query, set }) => {
    const imageUrl = query.url as string
    if (!imageUrl) {
      set.status = 400
      return 'Missing url parameter'
    }

    try {
      const resp = await fetch(imageUrl, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
      })

      if (!resp.ok) {
        set.status = resp.status
        return 'Failed to fetch image'
      }

      const contentType = resp.headers.get('content-type') || 'image/jpeg'
      set.headers['content-type'] = contentType
      set.headers['cache-control'] = 'public, max-age=3600'
      set.headers['access-control-allow-origin'] = '*'

      return new Response(resp.body, {
        headers: { 'Content-Type': contentType },
      })
    } catch (error) {
      log('error', 'Image proxy failed', { url: imageUrl, error: (error as Error).message })
      set.status = 502
      return 'Image proxy failed'
    }
  })

  // ===== วิเคราะห์ลิงก์ =====
  .post('/api/analyze', async ({ body, set }): Promise<ApiResponse> => {
    const { url } = body as { url: string }

    if (!url || !isValidUrl(url)) {
      set.status = 400
      return { success: false, error: { code: 'INVALID_URL', message: 'กรุณาใส่ลิงก์ที่ถูกต้องครับ' } }
    }

    const detected = detectUrl(url)
    log('info', `Analyzing: ${detected.platform} → ${url}`)

    try {
      let data
      switch (detected.platform) {
        case 'youtube':
          data = await getYoutubeInfo(detected.originalUrl)
          break
        case 'instagram':
          data = await getInstagramInfo(detected.originalUrl, detected.identifier)
          break
        case 'facebook':
          data = await getFacebookInfo(detected.originalUrl, detected.identifier)
          break
        case 'soundcloud':
          data = await getSoundcloudInfo(detected.originalUrl)
          break
        case 'tiktok':
        case 'twitter':
        case 'reddit':
        case 'vimeo':
        case 'dailymotion':
        case 'twitch':
          data = await getGenericInfo(detected.originalUrl, detected.platform)
          break
        default:
          try {
            data = await getYoutubeInfo(detected.originalUrl)
          } catch {
            set.status = 400
            return {
              success: false,
              error: {
                code: 'UNSUPPORTED',
                message: 'ยังไม่รองรับลิงก์นี้ครับ',
                suggestion: 'ลองใช้ลิงก์จาก YouTube, Instagram, Facebook, TikTok, Twitter, Reddit, Vimeo, Dailymotion, Twitch หรือ SoundCloud',
              },
            }
          }
      }

      // สำหรับ Facebook/Instagram: เปลี่ยน thumbnail ให้ผ่าน proxy ของเรา
      if (data && data.thumbnail && (data.platform === 'facebook' || data.platform === 'instagram')) {
        data.thumbnail = `/api/proxy-image?url=${encodeURIComponent(data.thumbnail)}`
      }

      return { success: true, data }
    } catch (error) {
      return handleError(error, set)
    }
  })

  // ===== ดาวน์โหลดไฟล์ =====
  .get('/api/download', async ({ query, set }) => {
    const url = query.url as string
    const option = query.option as string

    if (!url || !option) {
      set.status = 400
      return { success: false, error: { code: 'MISSING_PARAMS', message: 'กรุณาระบุ url และ option' } }
    }

    const detected = detectUrl(url)
    log('info', `Downloading: ${detected.platform} → ${option}`)

    try {
      let result: DownloadResult
      switch (detected.platform) {
        case 'youtube':
          result = await downloadYoutube(detected.originalUrl, option)
          break
        case 'instagram':
          result = await downloadInstagram(detected.originalUrl, detected.identifier)
          break
        case 'facebook':
          result = await downloadFacebook(detected.originalUrl, detected.identifier)
          break
        case 'soundcloud':
          result = await downloadSoundcloud(detected.originalUrl, option)
          break
        case 'tiktok':
        case 'twitter':
        case 'reddit':
        case 'vimeo':
        case 'dailymotion':
        case 'twitch':
          result = await downloadGeneric(detected.originalUrl, option, detected.platform)
          break
        default:
          result = await downloadYoutube(detected.originalUrl, option)
      }

      // สำหรับ stream → ส่งตรงไปเลย (เร็ว!)
      if (result.stream) {
        set.headers['content-type'] = result.contentType
        const encodedFilename = encodeURIComponent(result.filename)
        set.headers['content-disposition'] = `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        
        // Cleanup เมื่อ stream เสร็จ
        if (result.cleanup) {
          setTimeout(() => result.cleanup?.(), 5000)
        }

        return new Response(result.stream)
      }

      // สำหรับไฟล์ → stream กลับ (fallback สำหรับ Instagram/Facebook)
      if (result.filePath) {
        const file = Bun.file(result.filePath)
        if (!(await file.exists())) {
          set.status = 500
          return { success: false, error: { code: 'FILE_NOT_FOUND', message: 'ไม่พบไฟล์ดาวน์โหลด ลองใหม่อีกครั้งครับ' } }
        }

        set.headers['content-type'] = result.contentType
        const encodedFilename = encodeURIComponent(result.filename)
        set.headers['content-disposition'] = `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`

        // ลบไฟล์ชั่วคราวหลัง 60 วินาที
        setTimeout(async () => {
          try { await unlink(result.filePath!) } catch { /* ok */ }
        }, 60_000)

        return file
      }

      set.status = 500
      return { success: false, error: { code: 'DOWNLOAD_FAILED', message: 'เกิดข้อผิดพลาดในการดาวน์โหลดครับ' } }
    } catch (error) {
      return handleError(error, set)
    }
  })

  // ===== Global Error Handler =====
  .onError(({ error, set }) => {
    log('error', 'Unhandled error', { message: (error as Error).message })
    set.status = 500
    return { success: false, error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่ครับ' } }
  })

// ===== Serve Frontend (Production Only) =====
if (process.env.NODE_ENV === 'production') {
  const frontendPath = '../frontend/dist'
  
  app
    // Serve static assets (JS, CSS, images) - ต้อง serve ทั้ง root
    .use(staticPlugin({
      assets: frontendPath,
      prefix: '/',
    }))
}

app.listen(PORT)

log('info', `🦊 Download Everything Backend running at http://localhost:${PORT}`)
if (process.env.NODE_ENV === 'production') {
  log('info', `📦 Serving frontend from ../frontend/dist`)
}

// ===== Helper =====
function handleError(error: unknown, set: { status?: number }): ApiResponse {
  if (error instanceof AppError) {
    set.status = error.statusCode
    return { success: false, error: { code: error.code, message: error.message, suggestion: error.suggestion } }
  }
  log('error', 'Unexpected error', { message: (error as Error).message })
  set.status = 500
  return { success: false, error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่ครับ' } }
}
