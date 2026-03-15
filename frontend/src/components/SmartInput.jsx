import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'

export default function SmartInput({ onSubmit, loading, onReset }) {
  const [url, setUrl] = useState('')

  const isValidUrl = (str) => {
    try {
      const trimmed = str.trim()
      if (!trimmed) return false
      const withProto = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
      new URL(withProto)
      return true
    } catch {
      return false
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!isValidUrl(url) || loading) return
    onSubmit(url.trim())
  }

  const handleChange = (e) => {
    setUrl(e.target.value)
    if (onReset) onReset()
  }

  const handlePaste = (e) => {
    setTimeout(() => {
      const pastedUrl = e.target.value
      if (isValidUrl(pastedUrl) && !loading) {
        onSubmit(pastedUrl.trim())
      }
    }, 100)
  }

  return (
    <form className="smart-input" onSubmit={handleSubmit}>
      <div className="smart-input__wrapper">
        <input
          className="smart-input__field"
          type="text"
          value={url}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder="วางลิงก์ที่นี่..."
          autoComplete="off"
          spellCheck="false"
          autoFocus
        />
        <button
          className="smart-input__btn"
          type="submit"
          disabled={!isValidUrl(url) || loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {loading ? (
            <><Loader2 size={16} className="lucide-spin" /> วิเคราะห์...</>
          ) : (
            <><Search size={16} /> ค้นหา</>
          )}
        </button>
      </div>
    </form>
  )
}
