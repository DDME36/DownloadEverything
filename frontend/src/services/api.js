const API_BASE = import.meta.env.VITE_API_URL || ''

// Timeout สำหรับ free tier (60 วินาที)
const ANALYZE_TIMEOUT = 60000
const HEALTH_CHECK_TIMEOUT = 5000

/**
 * วิเคราะห์ลิงก์ — บอกว่าเป็นแพลตฟอร์มไหน + ตัวเลือกดาวน์โหลด
 */
export async function analyzeUrl(url) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT)

  try {
    const resp = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!resp.ok && resp.status >= 500) {
      throw new Error('เซิร์ฟเวอร์มีปัญหา ลองใหม่อีกครั้งครับ')
    }

    const data = await resp.json()
    if (!data.success) {
      const err = new Error(data.error?.message || 'เกิดข้อผิดพลาด')
      err.code = data.error?.code
      err.suggestion = data.error?.suggestion
      throw err
    }

    return data.data
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('การเชื่อมต่อหมดเวลา')
      timeoutErr.code = 'TIMEOUT'
      timeoutErr.suggestion = 'เซิร์ฟเวอร์อาจกำลัง cold start หรือวิดีโอใหญ่เกินไป ลองใหม่อีกครั้ง'
      throw timeoutErr
    }
    throw err
  }
}

/**
 * สร้าง URL สำหรับดาวน์โหลด (เปิดในแท็บใหม่ หรือ redirect)
 */
export function getDownloadUrl(url, optionId) {
  const params = new URLSearchParams({ url, option: optionId })
  return `${API_BASE}/api/download?${params.toString()}`
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
