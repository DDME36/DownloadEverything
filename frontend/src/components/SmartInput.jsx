import React, { useState, useEffect, useRef, memo } from 'react'
import { ArrowRight, Loader2, Clipboard, X, Link2, Sparkles } from 'lucide-react'

function SmartInput({ onSubmit, loading, onReset, externalValue }) {
  const [url, setUrl] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    setUrl(externalValue || '')
  }, [externalValue])

  const valid = (() => {
    try {
      const trimmed = url.trim()
      if (!trimmed) return false
      const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.')
    } catch {
      return false
    }
  })()

  const clear = () => {
    setUrl('')
    setNotice('')
    onReset?.()
    inputRef.current?.focus()
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text.trim())
      setNotice('')
      inputRef.current?.focus()
    } catch {
      setNotice('อ่านคลิปบอร์ดไม่ได้ แตะช่องลิงก์ค้างไว้แล้วเลือก “วาง” หรือกด Ctrl / ⌘ + V')
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (valid && !loading) {
      onSubmit(url.trim())
    }
  }

  return (
    <form className="smart-input fetch-input" role="search" onSubmit={handleSubmit}>
      <label htmlFor="media-url" className="fetch-input-label">
        <span>วางลิงก์ที่ต้องการดาวน์โหลด</span>
        <span className="fetch-input-hint">รองรับ YouTube, TikTok, IG, FB, SoundCloud ฯลฯ</span>
      </label>

      <div className="smart-input__wrapper">
        <Link2 size={20} className="fetch-link-icon" aria-hidden="true" />
        
        <input
          ref={inputRef}
          id="media-url"
          className="smart-input__field"
          type="text"
          inputMode="url"
          value={url}
          disabled={loading}
          onChange={(e) => {
            setUrl(e.target.value)
            setNotice('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !loading) clear()
          }}
          placeholder="https://… วางลิงก์สื่อที่นี่"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="link-help"
        />

        {url && !loading && (
          <button
            type="button"
            className="smart-input__clear-btn"
            onClick={clear}
            aria-label="ล้างข้อความในช่องลิงก์"
            title="ล้างข้อความ"
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}

        <button
          type="submit"
          className="smart-input__btn"
          disabled={!valid || loading}
          aria-label={loading ? 'กำลังวิเคราะห์ลิงก์...' : 'เริ่มวิเคราะห์ลิงก์'}
        >
          {loading ? (
            <>
              <Loader2 size={17} className="lucide-spin" aria-hidden="true" />
              <span>กำลังวิเคราะห์</span>
            </>
          ) : (
            <>
              <span>วิเคราะห์ลิงก์</span>
              <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      <div className="fetch-input-bottom">
        <button
          type="button"
          onClick={paste}
          disabled={loading}
          className="fetch-paste"
          title="วางลิงก์จากคลิปบอร์ดของคุณ"
        >
          <Clipboard size={14} aria-hidden="true" />
          <span>วางจากคลิปบอร์ด</span>
        </button>
        <span id="link-help">
          เลือกความละเอียดและแยกไฟล์เสียง/รูปภาพได้ในขั้นตอนถัดไป
        </span>
      </div>

      {notice && (
        <p className="fetch-notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}
    </form>
  )
}

export default memo(SmartInput)

