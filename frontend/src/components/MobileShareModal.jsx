import React, { useEffect, useState } from 'react'
import { Share2, Download, Copy, Check, X, Smartphone, Info, FileUp, Loader2, ExternalLink } from 'lucide-react'
import { resolveBackendUrl } from '../services/api'
import { isIOS as detectIsIOS, isIOSPWA } from '../utils/device'

export default function MobileShareModal({ isOpen, onClose, downloadUrl, title = 'ดาวน์โหลดสื่อ', filename = '' }) {
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isPwa, setIsPwa] = useState(false)
  const [isSharingFile, setIsSharingFile] = useState(false)

  const resolvedUrl = resolveBackendUrl(downloadUrl)

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setCanShare(!!navigator.share)
      setIsIOS(detectIsIOS())
      setIsPwa(isIOSPWA())
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // แชร์ไฟล์ตัวจริง (เช่น บันทึกลง Photos หรือส่งใน LINE/แชท)
  const handleShareActualFile = async () => {
    if (!resolvedUrl) return
    setIsSharingFile(true)
    try {
      const resp = await fetch(resolvedUrl)
      const blob = await resp.blob()
      const ext = filename?.split('.').pop() || 'mp4'
      const mime = blob.type || (ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : 'image/jpeg')
      const file = new File([blob], filename || `media.${ext}`, { type: mime })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || 'Zenload Media',
        })
      } else {
        // Fallback เป็นแชร์ลิงก์หากอุปกรณ์ไม่รองรับการแชร์ไฟล์ก้อนใหญ่
        await handleShareLinkOnly()
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('File share failed, falling back to url:', err)
        await handleShareLinkOnly()
      }
    } finally {
      setIsSharingFile(false)
    }
  }

  // แชร์เฉพาะลิงก์ดาวน์โหลด
  const handleShareLinkOnly = async () => {
    if (navigator.share && resolvedUrl) {
      try {
        await navigator.share({
          title: title || 'Zenload Media',
          text: `ดาวน์โหลด ${filename || title} ผ่าน Zenload`,
          url: resolvedUrl,
        })
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Link share error:', err)
        }
      }
    }
  }

  const handleCopyLink = async () => {
    if (resolvedUrl) {
      try {
        await navigator.clipboard.writeText(resolvedUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch (err) {
        console.warn('Copy error:', err)
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <div className="modal-content__header">
          <div className="modal-content__title-group">
            <Smartphone size={20} className="text-purple" />
            <h3 id="share-modal-title" className="modal-content__title">
              บันทึกและแชร์ไฟล์ลงเครื่อง
            </h3>
          </div>
          <button
            type="button"
            className="modal-content__close-btn"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-content__body">
          {/* Quick Actions */}
          <div className="modal-actions-grid">
            {canShare && (
              <>
                <button
                  type="button"
                  className="modal-action-btn modal-action-btn--primary"
                  onClick={handleShareActualFile}
                  disabled={isSharingFile}
                >
                  {isSharingFile ? <Loader2 size={18} className="lucide-spin" /> : <FileUp size={18} />}
                  <span>{isSharingFile ? 'กำลังเตรียมไฟล์...' : 'แชร์ไฟล์ / บันทึกลงเครื่อง'}</span>
                </button>

                <button
                  type="button"
                  className="modal-action-btn modal-action-btn--secondary"
                  onClick={handleShareLinkOnly}
                >
                  <Share2 size={18} />
                  <span>แชร์ลิงก์ดาวน์โหลด</span>
                </button>
              </>
            )}

            <button
              type="button"
              className="modal-action-btn modal-action-btn--secondary"
              onClick={handleCopyLink}
            >
              {copied ? <Check size={18} className="text-success" /> : <Copy size={18} />}
              <span>{copied ? 'คัดลอกลิงก์แล้ว!' : 'คัดลอกลิงก์ตรง'}</span>
            </button>
          </div>

          {/* iOS Safari / PWA Specific Guide */}
          {isIOS && (
            <div className="ios-guide-box">
              <div className="ios-guide-box__title">
                <Info size={16} className="text-purple" />
                <span>{isPwa ? 'วิธีบันทึกลงแอปรูปภาพ (สำหรับแอป PWA)' : 'วิธีบันทึกลง Camera Roll / Files (สำหรับ iOS / Safari)'}</span>
              </div>
              <ol className="ios-guide-box__steps">
                {isPwa ? (
                  <>
                    <li>
                      แตะปุ่ม <strong>"แชร์ไฟล์ / บันทึกลงเครื่อง"</strong> ด้านบน
                    </li>
                    <li>
                      เมนูของระบบ iOS จะเปิดขึ้นมา ให้แตะ <strong>"บันทึกภาพ" (Save Image)</strong> หรือ <strong>"บันทึกวิดีโอ" (Save Video)</strong>
                    </li>
                    <li>
                      ไฟล์จะถูกบันทึกเข้าอัลบั้ม <em>รูปภาพ (Photos)</em> ทันทีโดยไม่ต้องออกจากแอป
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      เมื่อวิดีโอเปิดขึ้น ให้แตะปุ่ม <strong>แชร์ [ ⎋ ]</strong> ที่แถบล่างของเบราว์เซอร์ Safari
                    </li>
                    <li>
                      เลื่อนหน้าจอลงมาด้านล่าง เลือก <strong>"บันทึกวิดีโอ" (Save Video)</strong> หรือ <strong>"บันทึกไปยัง 'ไฟล์'" (Save to Files)</strong>
                    </li>
                    <li>
                      ไฟล์จะถูกเก็บไว้ในแอป <em>รูปภาพ (Photos)</em> หรือ <em>ไฟล์ (Files)</em> ทันที
                    </li>
                  </>
                )}
              </ol>
            </div>
          )}

          <div className="modal-content__direct-link">
            {isPwa ? (
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="modal-direct-download-link"
              >
                <ExternalLink size={16} /> เปิดไฟล์ในเบราว์เซอร์ Safari (ภายนอก)
              </a>
            ) : (
              <a
                href={resolvedUrl}
                download={filename || 'download'}
                className="modal-direct-download-link"
              >
                <Download size={16} /> แตะที่นี่หากการดาวน์โหลดไม่เริ่มอัตโนมัติ
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

