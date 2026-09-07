import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Play, Trash2, Clock, X } from 'lucide-react'
import SmartThumbnail from './SmartThumbnail'

export default function HistoryList({ history, onSelect, onRemove, onClearAll }) {
  const [removingUrl, setRemovingUrl] = useState(null)
  const [showConfirmClear, setShowConfirmClear] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showConfirmClear) setShowConfirmClear(false)
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
      <div className="history-section animate-fade-in">
        <h4 className="history-title">
          <Clock size={16} /> ลิงก์ล่าสุดของคุณ
        </h4>
        <div className="history-empty">
          ลิงก์ที่วิเคราะห์แล้วจะอยู่ตรงนี้ เพื่อให้กลับมาเลือกดาวน์โหลดได้อีกครั้ง
        </div>
      </div>
    )
  }

  return (
    <div className="history-section animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h4 className="history-title" style={{ margin: 0 }}>
          <Clock size={16} /> ลิงก์ล่าสุดของคุณ
        </h4>
        <button
          type="button"
          onClick={() => setShowConfirmClear(true)}
          className="history-clear-all-btn"
          title="ล้างประวัติลิงก์ทั้งหมด"
        >
          <Trash2 size={13} /> ล้างทั้งหมด
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
                className="confirm-btn-cancel"
                onClick={() => setShowConfirmClear(false)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="confirm-btn-danger"
                onClick={() => {
                  onClearAll()
                  setShowConfirmClear(false)
                }}
              >
                <Trash2 size={16} /> ล้างทั้งหมด
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
            <div
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
                <h5 className="history-card__title" title={item.title}>{item.title}</h5>
                <div className="history-card__meta">
                  <span className={`history-card__badge history-card__badge--${item.platform}`}>
                    {item.platform}
                  </span>
                  <span>{new Date(item.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="history-card__action"
                  onClick={() => onSelect(item.url)}
                  title="วิเคราะห์ลิงก์นี้อีกครั้ง"
                  aria-label={`วิเคราะห์ ${item.title || item.url} อีกครั้ง`}
                >
                  <Play size={12} /> เปิดอีกครั้ง
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.url)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  className="hover-error"
                  title="ลบรายการนี้"
                  aria-label={`ลบ ${item.title || item.url} ออกจากประวัติ`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
