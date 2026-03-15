// ===== Platform Types =====
export type Platform = 'youtube' | 'instagram' | 'facebook' | 'soundcloud' | 'tiktok' | 'twitter' | 'reddit' | 'vimeo' | 'dailymotion' | 'twitch' | 'unknown'

export interface DetectedUrl {
  platform: Platform
  originalUrl: string
  identifier: string
}

// ===== Media Info (returned by /api/analyze) =====
export interface MediaInfo {
  platform: Platform
  title: string
  thumbnail?: string
  description?: string
  options: DownloadOption[]
}

export interface DownloadOption {
  id: string
  label: string
  format: string
  quality?: string
  fileSize?: string
}

// ===== Download Result (internal) =====
export interface DownloadResult {
  redirectUrl?: string
  filePath?: string
  stream?: ReadableStream
  filename: string
  contentType: string
  cleanup?: () => Promise<void>
}

// ===== API Response =====
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    suggestion?: string
  }
}
