import { useState, useEffect, useRef } from 'react'
import { ArrowRight, Loader2, Clipboard, X, Link2 } from 'lucide-react'
export default function SmartInput({ onSubmit, loading, onReset, externalValue }) {
  const [url, setUrl] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { setUrl(externalValue || '') }, [externalValue])
  const valid = (() => { try { const parsed = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`); return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.') } catch { return false } })()
  const clear = () => { setUrl(''); setNotice(''); onReset?.(); inputRef.current?.focus() }
  const paste = async () => {
    try { setUrl((await navigator.clipboard.readText()).trim()); setNotice(''); inputRef.current?.focus() }
    catch { setNotice('อ่านคลิปบอร์ดไม่ได้ แตะช่องลิงก์ค้างไว้แล้วเลือก “วาง” หรือกด Ctrl / ⌘ + V'); inputRef.current?.focus() }
  }
  return <form className="smart-input fetch-input" role="search" onSubmit={e => { e.preventDefault(); if (valid && !loading) onSubmit(url.trim()) }}>
    <label htmlFor="media-url" className="fetch-input-label">วางลิงก์ที่ต้องการดาวน์โหลด</label>
    <div className="smart-input__wrapper"><Link2 size={20} className="fetch-link-icon" />
      <input ref={inputRef} id="media-url" className="smart-input__field" type="text" inputMode="url" value={url} disabled={loading} onChange={e => { setUrl(e.target.value); setNotice('') }} onKeyDown={e => { if (e.key === 'Escape' && !loading) clear() }} placeholder="https://… วางลิงก์สื่อที่นี่" autoComplete="off" spellCheck={false} aria-describedby="link-help" />
      {url && !loading && <button type="button" className="smart-input__clear-btn" onClick={clear} aria-label="ล้างลิงก์"><X size={17} /></button>}
      <button className="smart-input__btn" disabled={!valid || loading}>{loading ? <><Loader2 size={17} className="lucide-spin" /> กำลังวิเคราะห์</> : <>วิเคราะห์ลิงก์ <ArrowRight size={17} /></>}</button>
    </div>
    <div className="fetch-input-bottom"><button type="button" onClick={paste} disabled={loading} className="fetch-paste"><Clipboard size={14} /> วางจากคลิปบอร์ด</button><span id="link-help">เลือกคุณภาพและรูปแบบได้ในขั้นตอนถัดไป</span></div>
    {notice && <p className="fetch-notice" role="status">{notice}</p>}
  </form>
}
