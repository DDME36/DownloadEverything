import type { MediaInfo, DownloadResult, DownloadStage, MediaItem } from '../types'
import { AppError } from '../utils/errors'
import { sanitizeFilename, truncateDescription, ensureTempDir, log, getYtDlpArgs } from '../utils/helpers'
import { killProcessTree, cleanupPartialFiles } from '../utils/process'

/**
 * ดึงข้อมูลเพลง SoundCloud (ใช้ yt-dlp ที่รองรับ SoundCloud อยู่แล้ว)
 */
export async function getSoundcloudInfo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const proc = Bun.spawn(getYtDlpArgs(['yt-dlp', '--dump-json', '--no-download', url]), {
    stdout: 'pipe', stderr: 'pipe',
  })

  const onAbort = () => {
    killProcessTree(proc)
  }
  if (signal) {
    signal.addEventListener('abort', onAbort)
  }

  let output = ''
  let errorOutput = ''
  let exitCode = 0

  try {
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    output = out
    errorOutput = err
    exitCode = await proc.exited
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }

  if (exitCode !== 0) {
    if (errorOutput.includes('not found') || errorOutput.includes('404')) {
      throw new AppError('NOT_FOUND', 'ไม่พบเพลงนี้บน SoundCloud ครับ', 404)
    }
    throw new AppError('SOUNDCLOUD_ERROR', `ดึงข้อมูล SoundCloud ไม่สำเร็จ: ${errorOutput.substring(0, 200)}`, 500)
  }

  const info = JSON.parse(output)
  const options = [
    { id: 'audio_mp3', label: 'MP3 (320kbps)', format: 'mp3', quality: 'best' },
    { id: 'audio_original', label: 'Original Quality', format: info.ext || 'mp3', quality: 'original' },
  ]

  const items: MediaItem[] = [
    {
      id: 'item_sc_1',
      kind: 'audio',
      title: info.title || 'Unknown Track',
      thumbnail: info.thumbnail || '',
      duration: info.duration,
      options,
    }
  ]

  return {
    platform: 'soundcloud',
    contentType: 'audio',
    title: info.title || 'Unknown Track',
    thumbnail: info.thumbnail || '',
    description: info.uploader || truncateDescription(info.description, 200),
    items,
    options,
  }
}

/**
 * ดาวน์โหลดเพลง SoundCloud ไปยังไฟล์ชั่วคราว
 */
export async function downloadSoundcloud(
  url: string,
  optionId: string,
  signal?: AbortSignal,
  onProgress?: (progress: number, stage: DownloadStage) => void,
  cachedMeta?: { title?: string; filename?: string }
): Promise<DownloadResult> {
  const tempDir = await ensureTempDir()
  const sep = process.platform === 'win32' ? '\\' : '/'
  const tempFile = `${tempDir}${sep}sc_${Date.now()}`

  const isOriginal = optionId === 'audio_original'
  const args = isOriginal
    ? ['yt-dlp', '-o', `${tempFile}.%(ext)s`, url]
    : ['yt-dlp', '-x', '--audio-format', 'mp3', '-o', `${tempFile}.mp3`, url]

  log('info', `Downloading SoundCloud: ${url}`)

  if (signal?.aborted) {
    throw new AppError('DOWNLOAD_ABORTED', 'การดาวน์โหลดถูกยกเลิกโดยผู้ใช้งาน', 499)
  }

  onProgress?.(5, 'downloading')

  const proc = Bun.spawn(getYtDlpArgs(args), { stdout: 'pipe', stderr: 'pipe' })

  const onAbort = () => {
    killProcessTree(proc)
    cleanupPartialFiles(tempFile).catch(() => {})
    log('info', `yt-dlp process killed due to AbortSignal for SoundCloud: ${url}`)
  }

  if (signal) {
    signal.addEventListener('abort', onAbort)
  }

  let errorOutput = ''
  let exitCode = 0

  const stdoutReader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let stdoutBuffer = ''

  const readStdout = async () => {
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      stdoutBuffer += chunk

      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
        if (match && onProgress) {
          const pct = parseFloat(match[1])
          onProgress(Math.min(Math.round(pct * 0.9), 90), 'downloading')
        } else if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
          onProgress?.(95, 'converting')
        }
      }
    }
  }

  try {
    const [_, err] = await Promise.all([
      readStdout(),
      new Response(proc.stderr).text(),
    ])
    errorOutput = err
    exitCode = await proc.exited
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }

  if (exitCode !== 0) {
    throw new AppError('DOWNLOAD_FAILED', `ดาวน์โหลด SoundCloud ไม่สำเร็จ: ${errorOutput.substring(0, 200)}`, 500)
  }

  let filePath = `${tempFile}.mp3`
  let actualExt = 'mp3'
  let contentType = 'audio/mpeg'

  const possibleExts = ['mp3', 'm4a', 'ogg', 'wav', 'aac', 'opus']
  for (const e of possibleExts) {
    if (await Bun.file(`${tempFile}.${e}`).exists()) {
      filePath = `${tempFile}.${e}`
      actualExt = e
      if (e === 'm4a') contentType = 'audio/mp4'
      else if (e === 'wav') contentType = 'audio/wav'
      else if (e === 'ogg') contentType = 'audio/ogg'
      break
    }
  }

  // ดึงชื่อเพลงสำหรับ filename จาก cachedMeta ก่อน
  let title = cachedMeta?.title || ''
  if (!title) {
    try {
      const tp = Bun.spawn(getYtDlpArgs(['yt-dlp', '--get-title', url]), { stdout: 'pipe', stderr: 'pipe' })
      title = (await new Response(tp.stdout).text()).trim()
    } catch { /* ใช้ชื่อ default */ }
  }

  const filename = cachedMeta?.filename || `${sanitizeFilename(title || 'soundcloud_track')}.${actualExt}`
  const fileStat = await Bun.file(filePath).stat()
  onProgress?.(100, 'ready')

  return {
    filePath,
    filename,
    contentType,
    fileSize: fileStat.size,
  }
}
