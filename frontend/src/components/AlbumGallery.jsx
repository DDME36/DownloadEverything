import React, { useState } from 'react'
import { Archive, Download, Image as ImageIcon, Video, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { resolveBackendUrl } from '../services/api'
import DownloadProgressPanel from './DownloadProgressPanel'

export default function AlbumGallery({
  items = [],
  title = '',
  onDownloadItem,
  onDownloadAllZip,
  downloadingId = null,
  downloadStatus = '',
  downloadStage = 'downloading',
  downloadProgress = 0,
  elapsedTime = 0,
  downloadError = '',
  activeOption = null,
  lastDownloadedFilename = '',
  platform = '',
  onCancel,
  onShare,
  onReset,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (!items || items.length === 0) return null

  const selectedItem = items[selectedIndex] || items[0]
  const isSelectedVideo = selectedItem.kind === 'video'

  const handlePrev = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1))
  }

  const handleNext = () => {
    setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0))
  }

  return (
    <div className="album-gallery" role="region" aria-label="แกลเลอรีอัลบั้ม">
      {/* Header with Total Items and ZIP All Button */}
      <div className="album-gallery__header">
        <div className="album-gallery__title-group">
          <span className="album-gallery__count-badge">
            {items.length} รายการ
          </span>
          <span className="album-gallery__current-indicator">
            รายการที่ {selectedIndex + 1} จาก {items.length}
          </span>
        </div>

        {onDownloadAllZip && (
          <button
            type="button"
            className={`dl-btn dl-btn--zip ${downloadingId === 'album_zip' ? 'dl-btn--loading' : ''}`}
            onClick={onDownloadAllZip}
            disabled={!!downloadingId}
          >
            {downloadingId === 'album_zip' ? (
              <Loader2 size={16} className="lucide-spin" />
            ) : (
              <Archive size={16} />
            )}
            <span>{downloadingId === 'album_zip' ? 'กำลังเตรียมไฟล์ ZIP...' : 'ดาวน์โหลดทั้งอัลบั้ม (ZIP)'}</span>
          </button>
        )}
      </div>

      {/* Main Preview Carousel */}
      <div className="album-gallery__viewer">
        <button
          type="button"
          className="album-gallery__nav-btn album-gallery__nav-btn--prev"
          onClick={handlePrev}
          aria-label="รายการก่อนหน้า"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="album-gallery__preview-box">
          {selectedItem.thumbnail || selectedItem.url ? (
            <img
              src={resolveBackendUrl(selectedItem.thumbnail || selectedItem.url)}
              alt={selectedItem.title || `Item #${selectedIndex + 1}`}
              className="album-gallery__main-img"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="album-gallery__placeholder">
              {isSelectedVideo ? <Video size={48} /> : <ImageIcon size={48} />}
            </div>
          )}

          <span className="album-gallery__type-tag">
            {isSelectedVideo ? (
              <><Video size={13} /> วิดีโอ</>
            ) : (
              <><ImageIcon size={13} /> รูปภาพ</>
            )}
          </span>
        </div>

        <button
          type="button"
          className="album-gallery__nav-btn album-gallery__nav-btn--next"
          onClick={handleNext}
          aria-label="รายการถัดไป"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Item Action / In-Place Progress Panel */}
      <div className="album-gallery__actions">
        {downloadingId ? (
          <DownloadProgressPanel
            downloadStatus={downloadStatus}
            downloadStage={downloadStage}
            downloadProgress={downloadProgress}
            elapsedTime={elapsedTime}
            downloadError={downloadError}
            activeOption={activeOption}
            lastDownloadedFilename={lastDownloadedFilename}
            platform={platform}
            onCancel={onCancel}
            onRetry={onCancel}
            onShare={onShare}
            onReset={onReset}
          />
        ) : (
          selectedItem.options && selectedItem.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="dl-btn dl-btn--primary"
              onClick={() => onDownloadItem(opt, selectedItem)}
            >
              <Download size={16} />
              <span>{opt.label || `ดาวน์โหลดรายการที่ #${selectedIndex + 1}`}</span>
            </button>
          ))
        )}
      </div>

      {/* Thumbnails Navigation Row */}
      <div className="album-gallery__thumbnails" role="tablist">
        {items.map((item, idx) => (
          <button
            key={item.id || idx}
            type="button"
            role="tab"
            aria-selected={idx === selectedIndex}
            className={`album-thumbnail-btn ${idx === selectedIndex ? 'album-thumbnail-btn--active' : ''}`}
            onClick={() => setSelectedIndex(idx)}
          >
            {item.thumbnail || item.url ? (
              <img src={item.thumbnail || item.url} alt="" className="album-thumbnail-img" referrerPolicy="no-referrer" loading="lazy" />
            ) : (
              <div className="album-thumbnail-fallback">{idx + 1}</div>
            )}
            <span className="album-thumbnail-index">{idx + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
