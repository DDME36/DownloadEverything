import { useState, useCallback } from 'react'
import { analyzeUrl } from '../services/api'

/**
 * Hook สำหรับวิเคราะห์ลิงก์ พร้อม loading/error state
 * รองรับ cold start และ timeout ของ free tier
 */
export function useFetch() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const analyze = useCallback(async (url) => {
    setLoading(true)
    setError(null)
    setData(null)

    try {
      const result = await analyzeUrl(url)
      setData(result)
    } catch (err) {
      // แยก error message สำหรับ cold start
      let message = err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'
      let suggestion = err.suggestion || null
      
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        message = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้'
        suggestion = 'เซิร์ฟเวอร์อาจกำลัง cold start (รอ 30 วินาที) หรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'
      } else if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
        message = 'การเชื่อมต่อหมดเวลา'
        suggestion = 'ลองใหม่อีกครั้ง หรือเลือกวิดีโอที่สั้นกว่า'
      }

      setError({
        message,
        code: err.code || 'UNKNOWN',
        suggestion,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { data, loading, error, analyze, reset }
}
