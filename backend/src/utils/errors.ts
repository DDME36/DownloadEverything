export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly suggestion?: string

  constructor(code: string, message: string, statusCode = 400, suggestion?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.suggestion = suggestion
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('NOT_FOUND', message, 404, suggestion)
  }
}

export class PrivateContentError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('PRIVATE_CONTENT', message, 403, suggestion)
  }
}

export class UnsupportedError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('UNSUPPORTED', message, 400, suggestion)
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('EXTERNAL_SERVICE_ERROR', message, 502, suggestion)
  }
}

// ===== Error Classification System =====
export type YtDlpErrorType =
  | 'AUTH_REQUIRED'
  | 'CHALLENGE_REQUIRED'
  | 'RATE_LIMITED'
  | 'FORMAT_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export interface ClassifiedError {
  type: YtDlpErrorType
  rawMessage: string
  userMessage: string
  statusCode: number
  canRetryWithClient: boolean
  canRetryWithFormat: boolean
  canRetryNetwork: boolean
}

/**
 * แยกประเภทข้อผิดพลาดของ yt-dlp เพื่อกำหนดกลยุทธ์การ retry อย่างชาญฉลาด
 * ไม่สุ่ม retry หลาย client หากข้อผิดพลาดไม่เอื้ออำนวย
 */
export function classifyYtDlpError(errorOutput: string): ClassifiedError {
  const lower = errorOutput.toLowerCase()

  // 1. Auth errors (Private video, requires login) -> ห้าม retry client เพราะไม่มีประโยชน์
  if (
    lower.includes('private video') ||
    lower.includes('is private') ||
    lower.includes('this video is private') ||
    lower.includes('sign in to confirm your age') ||
    lower.includes('this video requires login') ||
    lower.includes('account has been terminated') ||
    lower.includes('members-only')
  ) {
    return {
      type: 'AUTH_REQUIRED',
      rawMessage: errorOutput,
      userMessage: 'วิดีโอนี้เป็นส่วนตัว มีการจำกัดอายุ หรือต้องเข้าสู่ระบบเพื่อรับชม',
      statusCode: 403,
      canRetryWithClient: false,
      canRetryWithFormat: false,
      canRetryNetwork: false,
    }
  }

  // 2. Challenge errors (Bot detection, n-sig, poToken challenge) -> ควรสลับไปใช้ android / ios client
  if (
    lower.includes('sign in to confirm you’re not a bot') ||
    lower.includes("sign in to confirm you're not a bot") ||
    lower.includes('solve the challenge') ||
    lower.includes('n-sig extraction failed') ||
    lower.includes('n challenge failed') ||
    lower.includes('confirm you are not a bot')
  ) {
    return {
      type: 'CHALLENGE_REQUIRED',
      rawMessage: errorOutput,
      userMessage: 'YouTube ตรวจพบการเรียกใช้งานถี่เกินไปและขอการยืนยันตัวตน',
      statusCode: 403,
      canRetryWithClient: true,
      canRetryWithFormat: false,
      canRetryNetwork: false,
    }
  }

  // 3. Rate limit errors (HTTP 429) -> ห้าม retry ซ้ำทันที
  if (
    lower.includes('429') ||
    lower.includes('too many requests') ||
    lower.includes('rate-limit') ||
    lower.includes('temporarily blocked')
  ) {
    return {
      type: 'RATE_LIMITED',
      rawMessage: errorOutput,
      userMessage: 'เซิร์ฟเวอร์ปลายทางแจ้งว่ามีการเรียกใช้งานมากเกินไป (Rate Limit) กรุณารอสักครู่แล้วลองใหม่',
      statusCode: 429,
      canRetryWithClient: false,
      canRetryWithFormat: false,
      canRetryNetwork: false,
    }
  }

  // 4. Unavailable format errors -> ควร retry ด้วย fallback format
  if (
    lower.includes('requested format is not available') ||
    lower.includes('no suitable format') ||
    lower.includes('format not available')
  ) {
    return {
      type: 'FORMAT_UNAVAILABLE',
      rawMessage: errorOutput,
      userMessage: 'ไม่พบความละเอียดหรือรูปแบบไฟล์ที่เลือกสำหรับวิดีโอนี้',
      statusCode: 400,
      canRetryWithClient: false,
      canRetryWithFormat: true,
      canRetryNetwork: false,
    }
  }

  // 5. Not found / deleted -> ห้าม retry
  if (
    lower.includes('video unavailable') ||
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('has been removed') ||
    lower.includes('deleted')
  ) {
    return {
      type: 'NOT_FOUND',
      rawMessage: errorOutput,
      userMessage: 'ไม่พบเนื้อหานี้ อาจถูกลบไปแล้วหรือไม่มีอยู่จริง',
      statusCode: 404,
      canRetryWithClient: false,
      canRetryWithFormat: false,
      canRetryNetwork: false,
    }
  }

  // 6. Network errors -> อนุญาตให้ retry ได้สั้นๆ
  if (
    lower.includes('timed out') ||
    lower.includes('connection refused') ||
    lower.includes('unable to download webpage') ||
    lower.includes('network is unreachable') ||
    lower.includes('remote host closed connection')
  ) {
    return {
      type: 'NETWORK_ERROR',
      rawMessage: errorOutput,
      userMessage: 'การเชื่อมต่อไปยังเซิร์ฟเวอร์ปลายทางขัดข้อง กรุณาลองใหม่อีกครั้ง',
      statusCode: 504,
      canRetryWithClient: false,
      canRetryWithFormat: false,
      canRetryNetwork: true,
    }
  }

  return {
    type: 'UNKNOWN',
    rawMessage: errorOutput,
    userMessage: 'เกิดข้อผิดพลาดในการดึงข้อมูลสื่อ',
    statusCode: 500,
    canRetryWithClient: false,
    canRetryWithFormat: false,
    canRetryNetwork: false,
  }
}
