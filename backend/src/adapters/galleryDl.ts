import type { DownloaderAdapter } from './types'
import type { Platform, MediaInfo, DownloadResult, DownloadStage, MediaItem } from '../types'
import { AppError } from '../utils/errors'
import { ensureTempDir, getCookiesPath } from '../utils/helpers'
import { killProcessTree, cleanupPartialFiles } from '../utils/process'
import { join } from 'node:path'
import { readdir, rm } from 'node:fs/promises'

let galleryDlInstalled = false
let galleryDlCommand: string[] | null = null

export async function getGalleryDlCommand(): Promise<string[] | null> {
  if (galleryDlCommand) return galleryDlCommand

  // 1. ลองหา standalone binary 'gallery-dl'
  try {
    const proc = Bun.spawn(['gallery-dl', '--version'], { stdout: 'ignore', stderr: 'ignore' })
    if ((await proc.exited) === 0) {
      galleryDlCommand = ['gallery-dl']
      galleryDlInstalled = true
      return galleryDlCommand
    }
  } catch {}

  // 2. ลองหาผ่าน python module 'python -m gallery_dl'
  try {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    const proc = Bun.spawn([pythonCmd, '-m', 'gallery_dl', '--version'], { stdout: 'ignore', stderr: 'ignore' })
    if ((await proc.exited) === 0) {
      galleryDlCommand = [pythonCmd, '-m', 'gallery_dl']
      galleryDlInstalled = true
      return galleryDlCommand
    }
  } catch {}

  galleryDlInstalled = false
  return null
}

export async function checkGalleryDl(): Promise<boolean> {
  const cmd = await getGalleryDlCommand()
  return !!cmd
}

async function collectFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      if (entry.isFile()) {
        const parent = entry.parentPath || (entry as any).path || dir
        files.push(join(parent, entry.name))
      }
    }
    return files
  } catch {
    return []
  }
}

async function createZipArchive(sourceDir: string, destZipPath: string): Promise<void> {
  const pythonScript = `
import zipfile, os, sys
src = sys.argv[1]
dst = sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, src)
            zf.write(full_path, rel_path)
`
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  const proc = Bun.spawn([pythonCmd, '-c', pythonScript, sourceDir, destZipPath], {
    stdout: 'ignore',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text()
    throw new AppError('ZIP_FAILED', `สร้างไฟล์ ZIP ไม่สำเร็จ: ${err}`, 500)
  }
}

export class GalleryDlAdapter implements DownloaderAdapter {
  readonly name = 'gallery-dl'

  canHandle(_url: string, platform: Platform): boolean {
    if (!galleryDlInstalled) return false
    return ['instagram', 'twitter', 'reddit'].includes(platform)
  }

  async getInfo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
    const cmd = await getGalleryDlCommand()
    if (!cmd) {
      throw new AppError('GALLERY_DL_NOT_INSTALLED', 'เครื่องมือ gallery-dl ไม่ได้ถูกติดตั้งบนระบบ', 501)
    }

    const cookiesPath = getCookiesPath()
    const cookieArgs = cookiesPath && (await Bun.file(cookiesPath).exists()) ? ['--cookies', cookiesPath] : []

    const proc = Bun.spawn([...cmd, ...cookieArgs, '-j', '--no-download', url], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const onAbort = () => { killProcessTree(proc).catch(() => {}) }
    if (signal) signal.addEventListener('abort', onAbort)

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
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    if (exitCode !== 0 || !output.trim()) {
      throw new AppError('GALLERY_EXTRACT_FAILED', `ไม่สามารถดึงข้อมูลอัลบั้มได้: ${errorOutput.substring(0, 200)}`, 500)
    }

    const items: MediaItem[] = []
    let rawObjects: any[] = []

    // 1. ตรวจสอบว่า gallery-dl ส่ง output มาเป็น JSON Array ก้อนเดียว หรือแยกทีละบรรทัด
    try {
      const parsedAll = JSON.parse(output.trim())
      if (Array.isArray(parsedAll)) {
        rawObjects = parsedAll
      } else if (typeof parsedAll === 'object' && parsedAll !== null) {
        rawObjects = [parsedAll]
      }
    } catch {
      const lines = output.trim().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          rawObjects.push(JSON.parse(line))
        } catch {}
      }
    }

    let index = 1
    for (const itemData of rawObjects) {
      // โครงสร้างของ gallery-dl -j:
      // Category 2: [2, url, metadata] -> ไฟล์สื่อ (รูปภาพ/วิดีโอ)
      // Category 3: [3, metadata] -> ไดเรกทอรี / ข้อมูลอัลบั้ม (ต้องข้าม เพื่อไม่ให้ url กลายเป็น [object Object])
      // หรือ Object ธรรมดา: { url: ... }
      let mediaUrl = ''
      if (Array.isArray(itemData)) {
        if (itemData[0] === 2 && typeof itemData[1] === 'string') {
          mediaUrl = itemData[1]
        } else if (typeof itemData[1] === 'string' && itemData[1].startsWith('http')) {
          mediaUrl = itemData[1]
        }
      } else if (typeof itemData === 'object' && itemData !== null) {
        mediaUrl = itemData.url || (Array.isArray(itemData.urls) ? itemData.urls[0] : '')
      }

      if (!mediaUrl || typeof mediaUrl !== 'string' || !mediaUrl.startsWith('http')) {
        continue
      }

      const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('.webm') || mediaUrl.includes('.m4v')

      items.push({
        id: `item_${index}`,
        kind: isVideo ? 'video' : 'image',
        title: `Item #${index}`,
        url: mediaUrl,
        thumbnail: mediaUrl,
        options: [
          {
            id: `item_${index}_download`,
            label: `ดาวน์โหลด ${isVideo ? 'วิดีโอ' : 'รูปภาพ'} #${index}`,
            format: isVideo ? 'mp4' : 'jpg',
            quality: 'HD',
          },
        ],
      })
      index++
    }

    if (items.length === 0) {
      throw new AppError('GALLERY_EXTRACT_FAILED', 'ไม่พบไฟล์รูปภาพหรือวิดีโอที่สามารถดาวน์โหลดได้ในโพสต์หรืออัลบั้มนี้ (อาจเป็นบัญชีส่วนตัว หรือต้องการ Cookies ใน cookies.txt)', 404)
    }

    const albumZipOption = {
      id: 'album_zip',
      label: `ดาวน์โหลดทั้งอัลบั้ม (${items.length} รายการเป็น ZIP)`,
      format: 'zip',
      quality: 'Original',
    }

    return {
      platform: 'instagram',
      contentType: 'album',
      title: `Gallery (${items.length} items)`,
      items,
      options: [albumZipOption, ...items.flatMap(i => i.options)],
    }
  }

  async download(
    url: string,
    optionId: string,
    signal?: AbortSignal,
    onProgress?: (progress: number, stage: DownloadStage) => void,
    cachedMeta?: { title?: string; filename?: string }
  ): Promise<DownloadResult> {
    const cmd = await getGalleryDlCommand()
    if (!cmd) {
      throw new AppError('GALLERY_DL_NOT_INSTALLED', 'เครื่องมือ gallery-dl ไม่ได้ถูกติดตั้งบนระบบ', 501)
    }

    const tempDir = await ensureTempDir()
    const uniqueId = Math.random().toString(36).substring(7)
    const outDir = join(tempDir, `gdl_${uniqueId}`)

    // รองรับการเลือกดาวน์โหลดชิ้นเดียว (item_N_download)
    const itemMatch = optionId.match(/^item_(\d+)_download$/)
    const extraArgs = itemMatch ? ['--range', itemMatch[1]] : []

    const cookiesPath = getCookiesPath()
    const cookieArgs = cookiesPath && (await Bun.file(cookiesPath).exists()) ? ['--cookies', cookiesPath] : []

    onProgress?.(10, 'downloading')

    const proc = Bun.spawn([
      ...cmd,
      ...cookieArgs,
      '--destination', outDir,
      ...extraArgs,
      url
    ], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const onAbort = () => {
      killProcessTree(proc).catch(() => {})
      cleanupPartialFiles(outDir).catch(() => {})
    }
    if (signal) signal.addEventListener('abort', onAbort)

    try {
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new AppError('DOWNLOAD_FAILED', 'การดาวน์โหลดผ่าน gallery-dl ล้มเหลว', 500)
      }
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const files = await collectFiles(outDir)
    if (files.length === 0) {
      throw new AppError('DOWNLOAD_FAILED', 'ไม่พบไฟล์ผลลัพธ์จากการดาวน์โหลดของ gallery-dl', 500)
    }

    // กรณีเลือกชิ้นเดียว ให้ส่งไฟล์นั้นตรงๆ
    if (itemMatch && files.length > 0) {
      const singleFile = files[0]
      const ext = singleFile.split('.').pop()?.toLowerCase() || 'jpg'
      const isVideo = ext === 'mp4' || ext === 'webm'
      onProgress?.(100, 'ready')
      return {
        filePath: singleFile,
        filename: cachedMeta?.filename || `item_${itemMatch[1]}.${ext}`,
        contentType: isVideo ? 'video/mp4' : 'image/jpeg',
      }
    }

    // กรณีดาวน์โหลดทั้งอัลบั้ม บีบอัดเป็นไฟล์ ZIP จริง
    onProgress?.(80, 'merging')
    const zipPath = join(tempDir, `album_${uniqueId}.zip`)
    await createZipArchive(outDir, zipPath)
    await rm(outDir, { recursive: true, force: true }).catch(() => {})

    onProgress?.(100, 'ready')
    return {
      filePath: zipPath,
      filename: cachedMeta?.filename || 'album.zip',
      contentType: 'application/zip',
    }
  }
}
