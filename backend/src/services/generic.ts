import { videoQualityOptions } from '../utils/mediaQuality'
import type { MediaInfo, DownloadResult, DownloadStage, MediaItem } from '../types'
import { AppError } from '../utils/errors'
import { sanitizeFilename, truncateDescription, log, getYtDlpArgs, ensureTempDir } from '../utils/helpers'
import { killProcessTree, cleanupPartialFiles } from '../utils/process'
import { MAX_FILE_SIZE_MB } from '../utils/limits'

/**
 * Generic service สำหรับ platform ที่ yt-dlp รองรับ
 * ใช้สำหรับ: TikTok, Twitter, Reddit, Vimeo, Dailymotion, Twitch
 */

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function getGenericInfo(url: string, platform: string, signal?: AbortSignal): Promise<MediaInfo> {
  log('info', `Fetching ${platform} info: ${url}`)

  if (signal?.aborted) {
    throw new AppError('ANALYZE_ABORTED', 'การวิเคราะห์ถูกยกเลิก', 499)
  }

  // สำหรับ TikTok/Twitter ใช้ user-agent ที่ดีกว่า
  const extraArgs: string[] = []
  if (platform === 'tiktok' || platform === 'twitter') {
    extraArgs.push('--user-agent', UA_DESKTOP)
  }

  const proc = Bun.spawn(getYtDlpArgs([
    'yt-dlp', 
    '--dump-json', 
    '--no-download',
    '--socket-timeout', '30',
    ...extraArgs,
    url
  ]), {
    stdout: 'pipe', 
    stderr: 'pipe',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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
    throwGenericError(errorOutput, platform)
  }

  const info = JSON.parse(output)
  const options: MediaInfo['options'] = []

  // Video options
  options.push(...videoQualityOptions(info.formats))

  // Fallback video option
  if (options.length === 0) {
    options.push({ 
      id: 'video_best', 
      label: 'วิดีโอ · สูงสุดที่มี', 
      format: 'mp4', 
      quality: 'best' 
    })
  }

  // Audio options
  options.push({ id: 'audio_mp3', label: 'MP3', format: 'mp3', quality: 'best' })
  options.push({ id: 'audio_m4a', label: 'M4A (AAC)', format: 'm4a', quality: 'best' })

  const items: MediaItem[] = [
    {
      id: 'item_main',
      kind: 'video',
      title: info.title || 'Unknown',
      thumbnail: info.thumbnail || '',
      duration: info.duration,
      options,
    }
  ]

  return {
    platform: platform as any,
    contentType: 'video',
    title: info.title || 'Unknown',
    thumbnail: info.thumbnail || '',
    description: truncateDescription(info.description, 200),
    items,
    options,
  }
}

export async function downloadGeneric(
  url: string,
  optionId: string,
  platform: string,
  signal?: AbortSignal,
  onProgress?: (progress: number, stage: DownloadStage) => void,
  cachedMeta?: { title?: string; filename?: string }
): Promise<DownloadResult> {
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
        `bestvideo[height=${height}]+bestaudio[ext=m4a]/bestvideo[height=${height}]+bestaudio/best[height=${height}]/bestvideo[height=${height}]`,
        '--merge-output-format', 'mp4',
        '--postprocessor-args', 'Merger:-c:v copy -c:a aac -b:a 192k'
      ]
    } else {
      formatArgs = [
        '-f',
        'bestvideo+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '--postprocessor-args', 'Merger:-c:v copy -c:a aac -b:a 192k'
      ]
    }
  }

  // ดึง title จาก cachedMeta ก่อน (เลี่ยง spawn --get-title ซ้ำซ้อน)
  let title = cachedMeta?.title || ''
  if (!title) {
    try {
      const titleProc = Bun.spawn(getYtDlpArgs(['yt-dlp', '--get-title', '--socket-timeout', '15', url]), {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })
      title = (await new Response(titleProc.stdout).text()).trim()
    } catch { /* ใช้ชื่อ default */ }
  }
  const filename = cachedMeta?.filename || `${sanitizeFilename(title || platform + '_download')}.${ext}`

  const tempDir = await ensureTempDir()
  const uniqueId = Math.random().toString(36).substring(7)
  const tempFilePath = `${tempDir}/${platform}_${uniqueId}.${ext}`

  log('info', `File-based generic download: ${url} → ${filename} (Temp: ${tempFilePath})`)

  // ใช้ retry strategy สำหรับ TikTok และแพลตฟอร์มที่มีปัญหาบ่อย
  const strategies = [
    {
      name: 'default',
      args: [
        'yt-dlp',
        '--newline',
        ...formatArgs,
        '-o', tempFilePath,
        '--no-playlist',
        '--socket-timeout', '30',
        '--retries', '3',
        '--extractor-retries', '3',
        '--force-overwrites',
        '--no-part',
        '--max-filesize', `${MAX_FILE_SIZE_MB}M`,
        '--user-agent', UA_DESKTOP,
        url
      ]
    },
    // Strategy 2: ใช้ referer สำหรับ TikTok/Twitter ที่ต้องการ origin header
    {
      name: 'with-referer',
      args: [
        'yt-dlp',
        '--newline',
        ...formatArgs,
        '-o', tempFilePath,
        '--no-playlist',
        '--socket-timeout', '30',
        '--retries', '3',
        '--force-overwrites',
        '--no-part',
        '--max-filesize', `${MAX_FILE_SIZE_MB}M`,
        '--user-agent', UA_DESKTOP,
        '--referer', url,
        '--add-header', `Origin:${new URL(url).origin}`,
        url
      ]
    },
    // Strategy 3: Fallback ง่ายสุด
    {
      name: 'simple',
      args: [
        'yt-dlp',
        '--newline',
        '-f', isAudio ? 'bestaudio/best' : 'best',
        ...(isAudio ? ['-x', '--audio-format', ext] : ['--merge-output-format', 'mp4']),
        '-o', tempFilePath,
        '--no-playlist',
        '--socket-timeout', '30',
        '--force-overwrites',
        '--no-part',
        '--max-filesize', `${MAX_FILE_SIZE_MB}M`,
        url
      ]
    }
  ]

  let lastError = ''

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i]
    try {
      log('info', `${platform}: trying strategy ${i + 1}/${strategies.length}: ${strategy.name}`)
      
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 800))
      }

      if (signal?.aborted) {
        cleanupPartialFiles(tempFilePath).catch(() => {})
        throw new AppError('DOWNLOAD_ABORTED', 'การดาวน์โหลดถูกยกเลิกโดยผู้ใช้งาน', 499)
      }

      onProgress?.(5, 'downloading')

      const proc = Bun.spawn(getYtDlpArgs(strategy.args), {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })

      const onAbort = () => {
        killProcessTree(proc)
        cleanupPartialFiles(tempFilePath).catch(() => {})
        log('info', `yt-dlp process killed and cleaned due to AbortSignal for ${platform}: ${url}`)
      }

      if (signal) {
        signal.addEventListener('abort', onAbort)
      }

      let stdoutText = ''
      let errorOutput = ''
      let exitCode = 0

      const stdoutReader = proc.stdout.getReader()
      const decoder = new TextDecoder()
      let stdoutBuffer = ''
      let maxProgress = 2

      const readStdout = async () => {
        while (true) {
          const { done, value } = await stdoutReader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          stdoutText += chunk
          stdoutBuffer += chunk

          // yt-dlp outputs progress updates with \r or \n
          const lines = stdoutBuffer.split(/[\r\n]+/)
          stdoutBuffer = lines.pop() || ''

          for (const line of lines) {
            // 1. Fragment progress
            const fragMatch = line.match(/\(frag\s+(\d+)\/(\d+)\)/i)
            if (fragMatch && onProgress) {
              const currentFrag = parseInt(fragMatch[1], 10)
              const totalFrags = parseInt(fragMatch[2], 10)
              if (totalFrags > 0) {
                const fragPct = Math.round((currentFrag / totalFrags) * 95)
                if (fragPct > maxProgress) {
                  maxProgress = fragPct
                  onProgress(Math.min(maxProgress, 98), 'downloading')
                }
                continue
              }
            }

            // 2. Regular progress
            const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/i)
            if (match && onProgress) {
              const pct = parseFloat(match[1])
              if (!isNaN(pct)) {
                const rounded = Math.round(pct)
                if (rounded > maxProgress) {
                  maxProgress = rounded
                  onProgress(Math.min(maxProgress, 98), 'downloading')
                }
              }
            } else if (line.includes('[Merger]') || line.includes('[ffmpeg] Merging')) {
              if (95 > maxProgress) maxProgress = 95
              onProgress?.(maxProgress, 'merging')
            } else if (line.includes('[ExtractAudio]') || line.includes('[FixupM3u8]')) {
              if (97 > maxProgress) maxProgress = 97
              onProgress?.(maxProgress, 'converting')
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

      // เช็คหลายรูปแบบไฟล์ (yt-dlp อาจเปลี่ยน extension)
      let actualFilePath = tempFilePath
      if (!(await Bun.file(tempFilePath).exists())) {
        const possibleExts = ['mp4', 'mkv', 'webm', 'mp3', 'wav', 'm4a', 'opus', 'ogg']
        const baseWithoutExt = tempFilePath.replace(/\.[^.]+$/, '')
        for (const tryExt of possibleExts) {
          const tryPath = `${baseWithoutExt}.${tryExt}`
          if (await Bun.file(tryPath).exists()) {
            actualFilePath = tryPath
            break
          }
        }
      }

      if (exitCode === 0 && (await Bun.file(actualFilePath).exists())) {
        const fileSize = Bun.file(actualFilePath).size
        if (fileSize > 0) {
          const detectedMime = Bun.file(actualFilePath).type || contentType
          onProgress?.(100, 'ready')
          log('info', `✅ ${platform} download success with strategy: ${strategy.name} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`)
          return {
            filePath: actualFilePath,
            filename,
            contentType: detectedMime,
            fileSize,
          }
        } else {
          log('warn', `⚠️ ${platform} strategy ${strategy.name} produced 0-byte file`)
          try { await import('node:fs/promises').then(fs => fs.unlink(actualFilePath)) } catch {}
        }
      }

      log('warn', `❌ ${platform} strategy ${strategy.name} failed: ${errorOutput.substring(0, 200)}`)
      lastError = errorOutput
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      continue
    }
  }

  log('error', `❌ ${platform} all strategies failed`, { error: lastError.substring(0, 300) })
  throwGenericError(lastError, platform)
}

function throwGenericError(msg: string, platform: string): never {
  if (msg.includes('Private') || msg.includes('is private')) {
    throw new AppError('PRIVATE_CONTENT', 'เนื้อหานี้เป็นส่วนตัว ดาวน์โหลดไม่ได้', 403)
  }
  if (msg.includes('unavailable') || msg.includes('removed') || msg.includes('not found') || msg.includes('does not exist')) {
    throw new AppError('NOT_FOUND', 'ไม่พบเนื้อหานี้ อาจถูกลบไปแล้ว', 404)
  }
  if (msg.includes('Sign in') || msg.includes('login') || msg.includes('age')) {
    throw new AppError('AUTH_REQUIRED', 'ต้องล็อกอินก่อนดาวน์โหลด', 403)
  }
  if (msg.includes('geo') || msg.includes('not available in your country')) {
    throw new AppError('GEO_BLOCKED', 'เนื้อหานี้ไม่สามารถเข้าถึงได้ในประเทศของคุณ', 403)
  }
  if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('rate limit')) {
    throw new AppError('RATE_LIMITED', `${platform} บล็อกชั่วคราว`, 429, 'ลองใหม่ใน 5-10 นาที')
  }

  log('error', `${platform} error`, { message: msg.substring(0, 300) })
  throw new AppError('DOWNLOAD_FAILED', `ไม่สามารถดาวน์โหลดจาก ${platform} ได้`, 500, 'ลองใหม่อีกครั้ง หรือลองลิงก์อื่น')
}

