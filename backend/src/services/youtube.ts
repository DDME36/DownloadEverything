import type { MediaInfo, DownloadResult } from '../types'
import { AppError } from '../utils/errors'
import { sanitizeFilename, ensureTempDir, log } from '../utils/helpers'

/**
 * ดึงข้อมูลวิดีโอ YouTube (ชื่อ, ปก, ตัวเลือกความละเอียด)
 */
export async function getYoutubeInfo(url: string): Promise<MediaInfo> {
  // ลบ --flat-playlist เพื่อให้ได้ข้อมูล formats ครบ
  const proc = Bun.spawn([
    'yt-dlp', 
    '--dump-json', 
    '--no-download', 
    '--no-playlist',
    '--socket-timeout', '30',
    url
  ], {
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
    throwYtDlpError(errorOutput)
  }

  const info = JSON.parse(output)
  const options: MediaInfo['options'] = []

  // รวบรวมความละเอียดที่มีอยู่
  if (info.formats && Array.isArray(info.formats)) {
    const heights = [2160, 1440, 1080, 720, 480, 360]
    const seen = new Set<number>()

    for (const h of heights) {
      if (seen.has(h)) continue
      // เช็คทั้ง video+audio combined และ video-only formats
      const exists = info.formats.some((f: any) => 
        f.height === h && f.vcodec !== 'none'
      )
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

  // เพิ่ม fallback options
  if (options.length === 0) {
    options.push({ id: 'video_best', label: 'Video (Best)', format: 'mp4', quality: 'best' })
  }

  // Audio options - เพิ่มหลายรูปแบบ
  options.push({ id: 'audio_mp3', label: 'MP3 (320kbps)', format: 'mp3', quality: 'best' })
  options.push({ id: 'audio_wav', label: 'WAV (Lossless)', format: 'wav', quality: 'best' })
  options.push({ id: 'audio_m4a', label: 'M4A (AAC)', format: 'm4a', quality: 'best' })

  return {
    platform: 'youtube',
    title: info.title || 'Unknown',
    thumbnail: info.thumbnail || `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`,
    description: info.description?.substring(0, 200) || '',
    options,
  }
}

/**
 * ดาวน์โหลดวิดีโอ/เสียง YouTube แบบ streaming (optimized for free tier)
 */
export async function downloadYoutube(url: string, optionId: string): Promise<DownloadResult> {
  const isAudio = optionId.startsWith('audio_')

  let formatArgs: string[]
  let ext: string
  let contentType: string

  if (isAudio) {
    // แยก audio format ตาม option
    if (optionId === 'audio_wav') {
      ext = 'wav'
      contentType = 'audio/wav'
      // WAV ต้องใช้ bestaudio แล้วค่อย convert
      formatArgs = [
        '-f', 'bestaudio/best',
        '-x', 
        '--audio-format', 'wav',
        '--audio-quality', '0'
      ]
    } else if (optionId === 'audio_m4a') {
      ext = 'm4a'
      contentType = 'audio/mp4'
      formatArgs = [
        '-f', 'bestaudio/best',
        '-x', 
        '--audio-format', 'm4a',
        '--audio-quality', '0'
      ]
    } else {
      // default: mp3
      ext = 'mp3'
      contentType = 'audio/mpeg'
      formatArgs = [
        '-f', 'bestaudio/best',
        '-x', 
        '--audio-format', 'mp3',
        '--audio-quality', '0'
      ]
    }
  } else {
    ext = 'mp4'
    contentType = 'video/mp4'
    const qMatch = optionId.match(/(\d+)p$/)
    if (qMatch) {
      const height = qMatch[1]
      formatArgs = [
        '-f', 
        `bestvideo[height<=${height}][filesize<500M][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}][filesize<500M]+bestaudio/best[height<=${height}]/best`,
        '--merge-output-format', 'mp4'
      ]
    } else {
      formatArgs = ['-f', 'bestvideo[filesize<500M][ext=mp4]+bestaudio[ext=m4a]/bestvideo[filesize<500M]+bestaudio/best', '--merge-output-format', 'mp4']
    }
  }

  // ดึง title ก่อน (เร็ว)
  let filename = `download.${ext}`
  try {
    const titleProc = Bun.spawn(['yt-dlp', '--get-title', '--no-playlist', url], { 
      stdout: 'pipe', 
      stderr: 'pipe',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    const title = (await new Response(titleProc.stdout).text()).trim()
    if (title) filename = `${sanitizeFilename(title)}.${ext}`
  } catch { /* ใช้ชื่อ default */ }

  log('info', `Streaming download: ${url} → ${filename}`)

  // Stream ตรงไปที่ stdout
  const proc = Bun.spawn([
    'yt-dlp', 
    ...formatArgs, 
    '-o', '-',  // output to stdout
    '--no-playlist',
    '--quiet',
    '--no-warnings',
    '--socket-timeout', '30',
    '--retries', '3',
    '--extractor-retries', '3',
    '--sleep-requests', '1',
    url
  ], {
    stdout: 'pipe', 
    stderr: 'pipe',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })

  // เช็ค error ใน background
  const errorCheck = (async () => {
    const errorOutput = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    if (exitCode !== 0 && errorOutput) {
      throwYtDlpError(errorOutput)
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

function throwYtDlpError(msg: string): never {
  if (msg.includes('Private') || msg.includes('is private')) {
    throw new AppError('PRIVATE_CONTENT', 'วิดีโอนี้เป็นส่วนตัว ดาวน์โหลดไม่ได้ครับ', 403, 'ลองใช้ลิงก์วิดีโอสาธารณะ')
  }
  if (msg.includes('unavailable') || msg.includes('removed') || msg.includes('Video unavailable')) {
    throw new AppError('NOT_FOUND', 'ไม่พบวิดีโอนี้ อาจถูกลบไปแล้วครับ', 404)
  }
  if (msg.includes('Sign in') || msg.includes('age') || msg.includes('age-restricted')) {
    throw new AppError('AUTH_REQUIRED', 'วิดีโอนี้ต้องล็อกอินหรือมีข้อจำกัดอายุ ดาวน์โหลดไม่ได้ครับ', 403)
  }
  if (msg.includes('not available in your country') || msg.includes('geo')) {
    throw new AppError('GEO_BLOCKED', 'วิดีโอนี้ไม่สามารถเข้าถึงได้ในประเทศของคุณ', 403, 'ลองใช้ VPN หรือเลือกวิดีโออื่น')
  }
  if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('rate limit') || msg.includes('HTTP Error 429')) {
    throw new AppError('RATE_LIMITED', 'YouTube จำกัดจำนวนครั้งการดาวน์โหลด', 429, 'รอ 5-10 นาที แล้วลองใหม่ หรือลองวิดีโออื่นก่อน')
  }
  if (msg.includes('Requested format is not available')) {
    throw new AppError('FORMAT_UNAVAILABLE', 'ความละเอียดที่เลือกไม่มีให้ดาวน์โหลด', 400, 'ลองเลือกความละเอียดอื่น')
  }
  
  // Log full error for debugging
  log('error', 'yt-dlp error', { message: msg })
  throw new AppError('DOWNLOAD_FAILED', 'เกิดข้อผิดพลาดในการดาวน์โหลด', 500, 'ลองใหม่อีกครั้ง หรือตรวจสอบลิงก์')
}
