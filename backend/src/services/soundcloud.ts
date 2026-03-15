import type { MediaInfo, DownloadResult } from '../types'
import { AppError } from '../utils/errors'
import { sanitizeFilename, ensureTempDir, log } from '../utils/helpers'

/**
 * ดึงข้อมูลเพลง SoundCloud (ใช้ yt-dlp ที่รองรับ SoundCloud อยู่แล้ว)
 */
export async function getSoundcloudInfo(url: string): Promise<MediaInfo> {
  const proc = Bun.spawn(['yt-dlp', '--dump-json', '--no-download', url], {
    stdout: 'pipe', stderr: 'pipe',
  })

  const [output, errorOutput] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    if (errorOutput.includes('not found') || errorOutput.includes('404')) {
      throw new AppError('NOT_FOUND', 'ไม่พบเพลงนี้บน SoundCloud ครับ', 404)
    }
    throw new AppError('SOUNDCLOUD_ERROR', `ดึงข้อมูล SoundCloud ไม่สำเร็จ: ${errorOutput.substring(0, 200)}`, 500)
  }

  const info = JSON.parse(output)

  return {
    platform: 'soundcloud',
    title: info.title || 'Unknown Track',
    thumbnail: info.thumbnail || '',
    description: info.uploader || info.description?.substring(0, 200) || '',
    options: [
      { id: 'audio_mp3', label: 'MP3', format: 'mp3', quality: 'best' },
      { id: 'audio_original', label: 'Original Quality', format: info.ext || 'mp3', quality: 'original' },
    ],
  }
}

/**
 * ดาวน์โหลดเพลง SoundCloud ไปยังไฟล์ชั่วคราว
 */
export async function downloadSoundcloud(url: string, optionId: string): Promise<DownloadResult> {
  const tempDir = await ensureTempDir()
  const sep = process.platform === 'win32' ? '\\' : '/'
  const tempFile = `${tempDir}${sep}sc_${Date.now()}`

  const isOriginal = optionId === 'audio_original'
  const args = isOriginal
    ? ['yt-dlp', '-o', `${tempFile}.%(ext)s`, url]
    : ['yt-dlp', '-x', '--audio-format', 'mp3', '-o', `${tempFile}.mp3`, url]

  log('info', `Downloading SoundCloud: ${url}`)

  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
  const errorOutput = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new AppError('DOWNLOAD_FAILED', `ดาวน์โหลด SoundCloud ไม่สำเร็จ: ${errorOutput.substring(0, 200)}`, 500)
  }

  const ext = 'mp3'
  const filePath = `${tempFile}.${ext}`

  // ดึงชื่อเพลงสำหรับ filename
  let filename = `soundcloud_track.${ext}`
  try {
    const tp = Bun.spawn(['yt-dlp', '--get-title', url], { stdout: 'pipe', stderr: 'pipe' })
    const title = (await new Response(tp.stdout).text()).trim()
    if (title) filename = `${sanitizeFilename(title)}.${ext}`
  } catch { /* ใช้ชื่อ default */ }

  return { filePath, filename, contentType: 'audio/mpeg' }
}
