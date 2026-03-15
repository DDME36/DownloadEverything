import type { MediaInfo, DownloadResult } from '../types'
import { AppError } from '../utils/errors'
import { sanitizeFilename, log } from '../utils/helpers'

/**
 * Generic service สำหรับ platform ที่ yt-dlp รองรับ
 * ใช้สำหรับ: TikTok, Twitter, Reddit, Vimeo, Dailymotion, Twitch
 */

export async function getGenericInfo(url: string, platform: string): Promise<MediaInfo> {
  log('info', `Fetching ${platform} info: ${url}`)

  const proc = Bun.spawn(['yt-dlp', '--dump-json', '--no-download', url], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })

  const [output, errorOutput] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throwGenericError(errorOutput, platform)
  }

  const info = JSON.parse(output)
  const options: MediaInfo['options'] = []

  // Video options
  if (info.formats) {
    const heights = [1080, 720, 480, 360]
    const seen = new Set<number>()

    for (const h of heights) {
      if (seen.has(h)) continue
      const exists = info.formats.some((f: any) => f.height === h && f.vcodec !== 'none')
      if (exists) {
        seen.add(h)
        options.push({ 
          id: `video_${h}p`, 
          label: `Video ${h}p`, 
          format: 'mp4', 
          quality: `${h}p` 
        })
      }
    }
  }

  // Fallback video option
  if (options.length === 0) {
    options.push({ 
      id: 'video_best', 
      label: 'Video (Best)', 
      format: 'mp4', 
      quality: 'best' 
    })
  }

  // Audio options
  options.push({ id: 'audio_mp3', label: 'MP3 (320kbps)', format: 'mp3', quality: 'best' })
  options.push({ id: 'audio_m4a', label: 'M4A (AAC)', format: 'm4a', quality: 'best' })

  return {
    platform: platform as any,
    title: info.title || 'Unknown',
    thumbnail: info.thumbnail || '',
    description: info.description?.substring(0, 200) || '',
    options,
  }
}

export async function downloadGeneric(url: string, optionId: string, platform: string): Promise<DownloadResult> {
  const isAudio = optionId.startsWith('audio_')

  let formatArgs: string[]
  let ext: string
  let contentType: string

  if (isAudio) {
    if (optionId === 'audio_m4a') {
      ext = 'm4a'
      contentType = 'audio/mp4'
      formatArgs = ['-x', '--audio-format', 'm4a', '--audio-quality', '0']
    } else {
      ext = 'mp3'
      contentType = 'audio/mpeg'
      formatArgs = ['-x', '--audio-format', 'mp3', '--audio-quality', '0']
    }
  } else {
    ext = 'mp4'
    contentType = 'video/mp4'
    const qMatch = optionId.match(/(\d+)p$/)
    if (qMatch) {
      const height = qMatch[1]
      formatArgs = [
        '-f',
        `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
        '--merge-output-format', 'mp4'
      ]
    } else {
      formatArgs = ['-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4']
    }
  }

  // ดึง title
  let filename = `download.${ext}`
  try {
    const titleProc = Bun.spawn(['yt-dlp', '--get-title', url], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    const title = (await new Response(titleProc.stdout).text()).trim()
    if (title) filename = `${sanitizeFilename(title)}.${ext}`
  } catch { /* ใช้ชื่อ default */ }

  log('info', `Streaming ${platform} download: ${url} → ${filename}`)

  // Stream download
  const proc = Bun.spawn([
    'yt-dlp',
    ...formatArgs,
    '-o', '-',
    '--quiet',
    '--no-warnings',
    url
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })

  const errorCheck = (async () => {
    const errorOutput = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    if (exitCode !== 0 && errorOutput) {
      throwGenericError(errorOutput, platform)
    }
  })()

  return {
    stream: proc.stdout,
    filename,
    contentType,
    cleanup: async () => {
      try {
        proc.kill()
        await errorCheck
      } catch { /* ok */ }
    }
  }
}

function throwGenericError(msg: string, platform: string): never {
  if (msg.includes('Private') || msg.includes('is private')) {
    throw new AppError('PRIVATE_CONTENT', 'เนื้อหานี้เป็นส่วนตัว ดาวน์โหลดไม่ได้', 403)
  }
  if (msg.includes('unavailable') || msg.includes('removed') || msg.includes('not found')) {
    throw new AppError('NOT_FOUND', 'ไม่พบเนื้อหานี้ อาจถูกลบไปแล้ว', 404)
  }
  if (msg.includes('Sign in') || msg.includes('login') || msg.includes('age')) {
    throw new AppError('AUTH_REQUIRED', 'ต้องล็อกอินก่อนดาวน์โหลด', 403)
  }
  if (msg.includes('geo') || msg.includes('not available in your country')) {
    throw new AppError('GEO_BLOCKED', 'เนื้อหานี้ไม่สามารถเข้าถึงได้ในประเทศของคุณ', 403)
  }

  log('error', `${platform} error`, { message: msg })
  throw new AppError('DOWNLOAD_FAILED', `ไม่สามารถดาวน์โหลดจาก ${platform} ได้`, 500, 'ลองใหม่อีกครั้ง')
}
