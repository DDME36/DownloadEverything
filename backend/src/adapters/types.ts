import type { Platform, MediaInfo, DownloadResult, DownloadStage } from '../types'

export interface DownloaderAdapter {
  readonly name: string
  canHandle(url: string, platform: Platform): boolean
  getInfo(url: string, signal?: AbortSignal): Promise<MediaInfo>
  download(
    url: string,
    optionId: string,
    signal?: AbortSignal,
    onProgress?: (progress: number, stage: DownloadStage) => void,
    cachedMeta?: { title?: string; filename?: string }
  ): Promise<DownloadResult>
}
