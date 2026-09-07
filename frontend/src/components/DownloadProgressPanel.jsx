import React, { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Share2, RotateCcw, Clock, X, Loader2, Download } from 'lucide-react'

export default function DownloadProgressPanel({
  downloadStatus = '', // '', 'running', 'done', 'error'
  downloadProgress = 0,
  elapsedTime = 0,
  downloadError = '',
  activeOption = null,
  lastDownloadedFilename = '',
  lastDownloadedUrl = '',
  onCancel,
  onRetry,
  onShare,
  onReset,
}) {
  const [visualProgress, setVisualProgress] = useState(0)

  // รีเซ็ตความคืบหน้าให้เริ่มจาก 0 เสมอเมื่อเริ่มงานใหม่
  useEffect(() => {
    if (downloadStatus === 'running' && (downloadProgress === 0 || !downloadProgress)) {
      setVisualProgress(0)
    }
  }, [activeOption?.id, downloadStatus])

  useEffect(() => {
    if (downloadStatus !== 'running') {
      setVisualProgress(downloadProgress || 0)
      return
    }

    // สะท้อนเปอร์เซ็นต์จริงจากเซิร์ฟเวอร์ และรับประกันว่าไม่มีการลดระดับถอยหลัง
    setVisualProgress((prev) => Math.max(prev, downloadProgress || 0))
  }, [downloadProgress, downloadStatus])

  const formatTime = (sec = 0) => {
    if (sec < 60) return `${sec} วิ`
    return `${Math.floor(sec / 60)} น. ${sec % 60} วิ`
  }

  // 1. Success Completed State
  if (downloadStatus === 'done') {
    return (
      <div className="download-result-panel download-result-panel--success animate-scale-in" role="region" aria-label="ดาวน์โหลดเสร็จสมบูรณ์">
        <div className="download-result-panel__header">
          <div className="download-result-panel__badge download-result-panel__badge--success">
            <CheckCircle2 size={16} className="text-success" />
            <span>ดาวน์โหลดสำเร็จแล้ว</span>
          </div>
          <span className="download-result-panel__timer">ใช้เวลา {formatTime(elapsedTime)}</span>
        </div>

        <div className="download-result-panel__body">
          <h3 className="download-result-panel__title">ไฟล์พร้อมส่งมอบแล้ว!</h3>
          <p className="download-result-panel__desc">
            เบราว์เซอร์เริ่มดาวน์โหลดไฟล์แล้ว ตรวจสอบรายการดาวน์โหลดของอุปกรณ์คุณ หรือกดบันทึก/ส่งแชร์ด้านล่าง
          </p>
          {lastDownloadedFilename && (
            <div className="download-result-panel__file-chip" title={lastDownloadedFilename}>
              <span className="download-result-panel__file-icon">📄</span>
              <span className="download-result-panel__file-name">{lastDownloadedFilename}</span>
            </div>
          )}
        </div>

        <div className="download-result-panel__actions">
          {lastDownloadedUrl && (
            <a
              href={lastDownloadedUrl}
              download={lastDownloadedFilename || 'download'}
              className="dl-btn dl-btn--primary"
            >
              <Download size={15} /> กดดาวน์โหลดไฟล์
            </a>
          )}
          {onShare && (
            <button
              type="button"
              className={`dl-btn ${lastDownloadedUrl ? 'dl-btn--secondary' : 'dl-btn--primary'}`}
              onClick={onShare}
            >
              <Share2 size={15} /> บันทึกลงเครื่อง / แชร์ (มือถือ)
            </button>
          )}
          {onReset && (
            <button
              type="button"
              className="back-home-btn"
              onClick={onReset}
            >
              <RotateCcw size={14} /> เลือกดาวน์โหลดรูปแบบอื่น
            </button>
          )}
        </div>
      </div>
    )
  }

  // 2. Error State
  if (downloadStatus === 'error') {
    return (
      <div className="download-result-panel download-result-panel--error animate-scale-in" role="alert">
        <div className="download-result-panel__header">
          <div className="download-result-panel__badge download-result-panel__badge--error">
            <AlertTriangle size={16} className="text-error" />
            <span>เกิดข้อผิดพลาดในการดาวน์โหลด</span>
          </div>
        </div>

        <div className="download-result-panel__body">
          <p className="download-result-panel__error-msg">
            {downloadError || 'ไม่สามารถดาวน์โหลดไฟล์ได้จากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง'}
          </p>
        </div>

        <div className="download-result-panel__actions">
          <button
            type="button"
            className="dl-btn dl-btn--primary"
            onClick={onRetry || onCancel}
          >
            <RotateCcw size={15} /> ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    )
  }

  // 3. Active Downloading State: Sleek, Alive & Continuous Progress
  const displayProgress = Math.max(0, Math.min(100, Math.round(visualProgress || 0)))

  return (
    <div className="download-result-panel download-result-panel--active animate-scale-in" role="region" aria-label="สถานะการดาวน์โหลด">
      {/* Target & Timer / Cancel Row */}
      <div className="download-active-header">
        <div className="download-active-target">
          <span className="download-active-pulse-dot" />
          <span className="download-active-label">
            {displayProgress >= 100 ? 'จัดเตรียมเสร็จสิ้น: ' : 'กำลังดาวน์โหลด: '}
            <strong>{activeOption?.label || activeOption?.id || 'สื่อต้นฉบับ'}</strong>
          </span>
          {activeOption?.fileSize && (
            <span className="download-active-size-tag">({activeOption.fileSize})</span>
          )}
        </div>

        <div className="download-active-meta">
          <span className="download-active-timer">
            <Clock size={13} /> {formatTime(elapsedTime)}
          </span>
          {onCancel && (
            <button
              type="button"
              className="download-active-cancel-btn"
              onClick={onCancel}
              title="ยกเลิกการดาวน์โหลด"
            >
              <X size={13} />
              <span>ยกเลิก</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Track & Percentage */}
      <div className="download-active-track-row">
        <div
          className="download-active-track"
          role="progressbar"
          aria-valuenow={displayProgress}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            className="download-active-fill"
            style={{ width: `${displayProgress}%` }}
          >
            <div className="download-active-shimmer" />
          </div>
        </div>

        <div className="download-active-percent">
          {displayProgress >= 100 ? (
            <span className="text-success font-bold">100%</span>
          ) : displayProgress > 0 ? (
            <span>{displayProgress}%</span>
          ) : (
            <span className="download-active-connecting">
              <Loader2 size={12} className="lucide-spin" /> เตรียมไฟล์...
            </span>
          )}
        </div>
      </div>

      {/* Reassuring Live Status Indicator */}
      <div className="download-active-footer">
        <span className="download-active-alive-badge">
          <span className="download-active-radar" />
          <span>กำลังส่งต่อข้อมูลลงเครื่อง...</span>
        </span>
      </div>
    </div>
  )
}
