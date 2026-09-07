import React from 'react'
import { AlertCircle, Lock, Clock, SearchX, Link2Off, X, Lightbulb } from 'lucide-react'

export default function ErrorAlert({ error, onClose }) {
  if (!error) return null

  const getErrorIcon = (code) => {
    switch (code) {
      case 'AUTH_REQUIRED':
      case 'PRIVATE_CONTENT':
        return <Lock size={18} className="text-warning" />
      case 'RATE_LIMITED':
        return <Clock size={18} className="text-warning" />
      case 'NOT_FOUND':
        return <SearchX size={18} className="text-error" />
      case 'INVALID_URL':
      case 'UNSUPPORTED':
        return <Link2Off size={18} className="text-warning" />
      default:
        return <AlertCircle size={18} className="text-error" />
    }
  }

  const title =
    error.code === 'AUTH_REQUIRED'
      ? 'เนื้อหานี้ต้องเข้าสู่ระบบหรือเป็นส่วนตัว'
      : error.code === 'RATE_LIMITED'
      ? 'คำขอถี่เกินไปชั่วคราว'
      : error.code === 'NOT_FOUND'
      ? 'ไม่พบเนื้อหาที่ระบุ'
      : error.code === 'INVALID_URL'
      ? 'รูปแบบลิงก์ไม่ถูกต้อง'
      : 'เกิดข้อผิดพลาดในการประมวลผล'

  return (
    <div className="error-alert" role="alert" aria-live="assertive">
      <button
        type="button"
        className="error-alert__close"
        onClick={onClose}
        aria-label="ปิดการแจ้งเตือน"
      >
        <X size={18} />
      </button>

      <div className="error-alert__content">
        <div className="error-alert__title-row">
          <span className="error-alert__icon">{getErrorIcon(error.code)}</span>
          <h4 className="error-alert__title">{title}</h4>
        </div>
        <p className="error-alert__message">{error.message}</p>
      </div>

      {error.suggestion && (
        <div className="error-alert__suggestion-box">
          <Lightbulb size={15} className="text-purple flex-shrink-0" />
          <span><strong>คำแนะนำ:</strong> {error.suggestion}</span>
        </div>
      )}
    </div>
  )
}
