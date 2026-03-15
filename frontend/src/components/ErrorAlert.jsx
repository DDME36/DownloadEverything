import { AlertCircle, X } from 'lucide-react'

export default function ErrorAlert({ error, onClose }) {
  if (!error) return null

  return (
    <div className="error-alert" role="alert">
      <div className="error-alert__title">
        <AlertCircle size={18} />
        <span>เกิดข้อผิดพลาด</span>
        <button className="error-alert__close" onClick={onClose} aria-label="ปิด">
          <X size={18} />
        </button>
      </div>
      <p className="error-alert__message">{error.message}</p>
      {error.suggestion && (
        <p className="error-alert__suggestion">{error.suggestion}</p>
      )}
    </div>
  )
}
