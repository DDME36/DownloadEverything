import type { DownloaderAdapter } from './types'
import type { Platform, MediaInfo, DownloadResult, DownloadStage, MediaKind } from '../types'
import { AppError } from '../utils/errors'
import { ensureTempDir, sanitizeFilename } from '../utils/helpers'
import { parseAndValidateUrl, assertSafePublicDestination, safeFetch } from '../utils/security'
import { MAX_FILE_SIZE_MB } from '../utils/limits'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'

const DIRECT_EXT_MAP: Record<string, { kind: MediaKind; mime: string }> = {
  mp4: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  mkv: { kind: 'video', mime: 'video/x-matroska' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/opus' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' },
  webp: { kind: 'image', mime: 'image/webp' },
  gif: { kind: 'image', mime: 'image/gif' },
}

export class DirectMediaAdapter implements DownloaderAdapter {
  readonly name = 'direct-media'

  canHandle(url: string, platform: Platform): boolean {
    if (platform === 'direct') return true
    try {
      const parsed = new URL(url)
      const ext = parsed.pathname.split('.').pop()?.toLowerCase() || ''
      return !!DIRECT_EXT_MAP[ext]
    } catch {
      return false
    }
  }

  async getInfo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
    const parsed = parseAndValidateUrl(url)
    await assertSafePublicDestination(parsed.hostname)

    const ext = parsed.pathname.split('.').pop()?.toLowerCase() || 'mp4'
    const extInfo = DIRECT_EXT_MAP[ext] || { kind: 'video', mime: 'video/mp4' }

    let filename = parsed.pathname.split('/').filter(Boolean).pop() || `media.${ext}`
    filename = decodeURIComponent(filename)

    // ตรวจสอบ Content-Length ด้วย HEAD
    let fileSizeStr: string | undefined
    try {
      const headResp = await safeFetch(parsed.href, {
        method: 'HEAD',
        signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (headResp.ok) {
        const cl = parseInt(headResp.headers.get('content-length') || '0', 10)
        if (cl > 0) {
          fileSizeStr = `${(cl / 1024 / 1024).toFixed(1)} MB`
        }
      }
    } catch {}

    const title = filename.replace(/\.[^.]+$/, '')
    const option = {
      id: 'direct_original',
      label: `ดาวน์โหลดต้นฉบับ (${ext.toUpperCase()})`,
      format: ext,
      quality: 'Original',
      fileSize: fileSizeStr,
    }

    return {
      platform: 'direct',
      contentType: extInfo.kind,
      title,
      items: [
        {
          id: 'item_1',
          kind: extInfo.kind,
          title,
          options: [option],
        },
      ],
      options: [option],
    }
  }

  async download(
    url: string,
    _optionId: string,
    signal?: AbortSignal,
    onProgress?: (progress: number, stage: DownloadStage) => void,
    cachedMeta?: { title?: string; filename?: string }
  ): Promise<DownloadResult> {
    const parsed = parseAndValidateUrl(url)
    await assertSafePublicDestination(parsed.hostname)

    onProgress?.(0, 'downloading')

    const resp = await safeFetch(parsed.href, {
      signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!resp.ok) {
      throw new AppError('DOWNLOAD_FAILED', `ดาวน์โหลดไม่สำเร็จ HTTP ${resp.status}`, 502)
    }

    const contentType = resp.headers.get('content-type') || 'application/octet-stream'
    const contentLength = parseInt(resp.headers.get('content-length') || '0', 10)
    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024

    if (contentLength > maxBytes) {
      throw new AppError('FILE_TOO_LARGE', `ขนาดไฟล์เกินขีดจำกัดสูงสุด (${MAX_FILE_SIZE_MB}MB)`, 413)
    }

    let ext = parsed.pathname.split('.').pop()?.toLowerCase() || 'bin'
    if (ext.length > 5 || !DIRECT_EXT_MAP[ext]) {
      // ตรวจสอบจาก Content-Type
      if (contentType.includes('video/mp4')) ext = 'mp4'
      else if (contentType.includes('audio/mpeg')) ext = 'mp3'
      else if (contentType.includes('image/jpeg')) ext = 'jpg'
      else if (contentType.includes('image/png')) ext = 'png'
      else if (contentType.includes('image/webp')) ext = 'webp'
      else ext = 'mp4'
    }

    const tempDir = await ensureTempDir()
    const uniqueId = Math.random().toString(36).substring(7)
    const tempFilePath = join(tempDir, `direct_${uniqueId}.${ext}`)

    const filename = cachedMeta?.filename || `${sanitizeFilename(cachedMeta?.title || 'download')}.${ext}`

    if (!resp.body) {
      throw new AppError('EMPTY_RESPONSE', 'เซิร์ฟเวอร์ปลายทางไม่ส่งข้อมูลไฟล์', 502)
    }

    const reader = resp.body.getReader()
    let receivedBytes = 0
    const fileSink = Bun.file(tempFilePath).writer()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (value) {
          receivedBytes += value.length
          if (receivedBytes > maxBytes) {
            reader.cancel()
            await fileSink.end()
            try { await unlink(tempFilePath) } catch {}
            throw new AppError('FILE_TOO_LARGE', `ขนาดไฟล์เกินขีดจำกัดสูงสุด (${MAX_FILE_SIZE_MB}MB)`, 413)
          }
          fileSink.write(value)
        }

        if (contentLength > 0 && onProgress) {
          const pct = Math.min(Math.round((receivedBytes / contentLength) * 100), 99)
          onProgress(pct, 'downloading')
        }
      }
      await fileSink.end()
    } catch (err) {
      try { await unlink(tempFilePath) } catch {}
      throw err
    }

    if (receivedBytes === 0) {
      try { await unlink(tempFilePath) } catch {}
      throw new AppError('EMPTY_FILE', 'ไฟล์ที่ดาวน์โหลดว่างเปล่า (0 byte)', 502)
    }

    onProgress?.(100, 'ready')

    return {
      filePath: tempFilePath,
      filename,
      contentType,
      fileSize: receivedBytes,
    }
  }
}
