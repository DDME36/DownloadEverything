import React, { useState, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { Play, Trash2, Clock, X } from 'lucide-react'
import SmartThumbnail from './SmartThumbnail'

function HistoryList({ history, onSelect, onRemove, onClearAll }) {
  const [removingUrl, setRemovingUrl] = useState(null)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const clearBtnRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showConfirmClear) {
        setShowConfirmClear(false)
        clearBtnRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showConfirmClear])

  const handleRemove = (url) => {
    setRemovingUrl(url)
    setTimeout(() => {
      onRemove(url)
      setRemovingUrl(null)
    }, 250)
  }

  if (!history || history.length === 0) {
    return (
      <section className="history-section animate-fade-in" aria-labelledby="history-heading">
        <h2 id="history-heading" className="history-title">
          <Clock size={16} aria-hidden="true" />
          <span>ลิงก์ล่าสุดของคุณ</span>
        </h2>
        <div className="history-empty">
          ลิงก์ที่วิเคราะห์แล้วจะอยู่ตรงนี้ เพื่อให้กลับมาเลือกดาวน์โหลดได้อีกครั้ง
        </div>
      </section>
    )
  }

  return (
    <section className="history-section animate-fade-in" aria-labelledby="history-heading">
      <div className="history-header-row">
        <h2 id="history-heading" className="history-title" style={{ margin: 0 }}>
          <Clock size={16} aria-hidden="true" />
          <span>ลิงก์ล่าสุดของคุณ</span>
        </h2>
        <button
          ref={clearBtnRef}
          type="button"
          onClick={() => setShowConfirmClear(true)}
          className="history-clear-all-btn"
          title="ล้างประวัติลิงก์ทั้งหมด"
          aria-label="ล้างประวัติลิงก์ทั้งหมด"
        >
          <Trash2 size={13} aria-hidden="true" /> ล้างทั้งหมด
        </button>
      </div>

      {showConfirmClear && typeof document !== 'undefined' && createPortal(
        <div className="confirm-modal-backdrop" onClick={() => setShowConfirmClear(false)} role="presentation">
          <div
            className="confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-clear-title"
          >
            <button
              type="button"
              className="confirm-modal-close"
              onClick={() => setShowConfirmClear(false)}
              aria-label="ปิด"
            >
              <X size={18} />
            </button>

            <div className="confirm-modal-icon">
              <Trash2 size={24} />
            </div>

            <h3 id="confirm-clear-title" className="confirm-modal-title">
              ยืนยันล้างประวัติ
            </h3>

            <p className="confirm-modal-desc">
              คุณต้องการลบประวัติลิงก์ล่าสุดทั้งหมด <strong>({history.length} รายการ)</strong> ใช่หรือไม่?
            </p>
            <p className="confirm-modal-sub">
              * ข้อมูลที่เก็บในเครื่องจะถูกล้างทั้งหมด และไม่สามารถกู้คืนได้
            </p>

            <div className="confirm-modal-actions">
              <button
                type="button"
                autoFocus
                className="confirm-btn-cancel"
                onClick={() => {
                  setShowConfirmClear(false)
                  clearBtnRef.current?.focus()
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="confirm-btn-danger"
                onClick={() => {
                  onClearAll()
                  setShowConfirmClear(false)
                  clearBtnRef.current?.focus()
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> ล้างทั้งหมด
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="history-grid">
        {history.map((item, index) => {
          const isProfilePic = item.platform === 'instagram' || item.platform === 'facebook'
          const isRemoving = removingUrl === item.url
          return (
            <article
              key={item.url}
              className={`history-card animate-card-in ${isRemoving ? 'history-card--removing' : ''}`}
              style={{ animationDelay: `${index * 0.04}s` }}
            >
              <SmartThumbnail
                src={item.thumbnail}
                alt={item.title}
                title={item.title}
                platform={item.platform}
                circle={isProfilePic}
                size={50}
                className="history-card__thumb"
              />

              <div className="history-card__content">
                <h3 className="history-card__title" title={item.title}>{item.title}</h3>
                <div className="history-card__meta">
                  <span className={`history-card__badge history-card__badge--${item.platform}`}>
                    {item.platform}
                  </span>
                  <span>{new Date(item.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              
              <div className="history-card__actions-group">
                <button
                  type="button"
                  className="history-card__action"
                  onClick={() => onSelect(item.url)}
                  title="วิเคราะห์ลิงก์นี้อีกครั้ง"
                  aria-label={`วิเคราะห์ ${item.title || item.url} อีกครั้ง`}
                >
                  <Play size={12} aria-hidden="true" /> เปิดอีกครั้ง
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.url)}
                  className="history-card__delete-btn hover-error"
                  title="ลบรายการนี้"
                  aria-label={`ลบ ${item.title || item.url} ออกจากประวัติ`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default memo(HistoryList)
