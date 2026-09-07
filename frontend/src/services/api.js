const API_BASE = import.meta.env.VITE_API_URL || ''

// Timeout สำหรับ free tier (60 วินาที)
const ANALYZE_TIMEOUT = 60000
const HEALTH_CHECK_TIMEOUT = 5000

/**
 * วิเคราะห์ลิงก์ — บอกว่าเป็นแพลตฟอร์มไหน + ตัวเลือกดาวน์โหลด
 */
export async function analyzeUrl(url, signal) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const resp = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })

    let data
    try {
      data = await resp.json()
    } catch {
      if (!resp.ok) {
        throw new Error('เซิร์ฟเวอร์มีปัญหา ลองใหม่อีกครั้งครับ')
      }
    }

    if (data && !data.success) {
      const err = new Error(data.error?.message || 'เกิดข้อผิดพลาด')
      err.code = data.error?.code
      err.suggestion = data.error?.suggestion
      throw err
    }

    return data.data
  } catch (err) {
    clearTimeout(timeoutId)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('การเชื่อมต่อหมดเวลา')
      timeoutErr.code = 'TIMEOUT'
      timeoutErr.suggestion = 'เซิร์ฟเวอร์อาจกำลัง cold start หรือวิดีโอใหญ่เกินไป ลองใหม่อีกครั้ง'
      throw timeoutErr
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * แปลง URL ให้ชี้ไปยัง Backend อย่างถูกต้อง (รองรับสถาปัตยกรรม Vercel Frontend + Oracle Backend)
 */
export function resolveBackendUrl(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalizedPath}`
}

/**
 * สร้าง URL สำหรับดาวน์โหลดผ่าน Job ID และ Access Token
 */
export function getDirectDownloadUrl(jobId, token) {
  const params = new URLSearchParams({ jobId })
  if (token) params.set('token', token)
  return `${API_BASE}/api/download?${params.toString()}`
}

/**
 * @deprecated ใช้ startDownload + getDirectDownloadUrl แทน
 */
export function getDownloadUrl(url, optionId) {
  const params = new URLSearchParams({ url, option: optionId })
  return `${API_BASE}/api/download?${params.toString()}`
}

/**
 * เริ่มต้นการดาวน์โหลดแบบ Asynchronous (POST: จองคิวและรับ Access Token)
 */
export async function startDownload(url, optionId, signal) {
  const resp = await fetch(`${API_BASE}/api/download/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, option: optionId }),
    signal,
  })
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => null)
    throw new Error(errorData?.error?.message || `เซิร์ฟเวอร์ตอบกลับ HTTP ${resp.status}`)
  }
  return resp.json()
}

/**
 * ดึงสถานะและความก้าวหน้าของการดาวน์โหลดบนเซิร์ฟเวอร์ (พร้อม Access Token)
 */
export async function getDownloadStatus(jobId, token, signal) {
  const params = new URLSearchParams({ jobId })
  if (token) params.set('token', token)
  const resp = await fetch(`${API_BASE}/api/download/status?${params.toString()}`, { signal })
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => null)
    throw new Error(errorData?.error?.message || `เซิร์ฟเวอร์ตอบกลับ HTTP ${resp.status}`)
  }
  return resp.json()
}

/**
 * ส่งสัญญาณยกเลิกการดาวน์โหลดและล้างไฟล์บนเซิร์ฟเวอร์ (POST)
 */
export async function cancelDownload(jobId, token) {
  try {
    await fetch(`${API_BASE}/api/download/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, token }),
    })
  } catch (err) {
    console.warn('Failed to cancel download on server:', err)
  }
}


/**
 * ตรวจสอบว่า backend ทำงานอยู่หรือไม่
 */
export async function checkHealth() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT)
    
    const resp = await fetch(`${API_BASE}/health`, { signal: controller.signal })
    clearTimeout(timeoutId)
    return resp.ok
  } catch {
    return false
  }
}
