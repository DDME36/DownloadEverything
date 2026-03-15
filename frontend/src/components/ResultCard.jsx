import { useState } from 'react'
import { getDownloadUrl } from '../services/api'
import { Download, Loader2, Video, Music, Youtube, Instagram, Facebook, Cloud, MessageCircle, Twitter, Radio, Film, Tv, Twitch } from 'lucide-react'

const PLATFORM_CONFIG = {
  youtube: { label: 'YouTube', icon: Youtube },
  instagram: { label: 'Instagram', icon: Instagram },
  facebook: { label: 'Facebook', icon: Facebook },
  soundcloud: { label: 'SoundCloud', icon: Cloud },
  tiktok: { label: 'TikTok', icon: Music },
  twitter: { label: 'Twitter/X', icon: Twitter },
  reddit: { label: 'Reddit', icon: MessageCircle },
  vimeo: { label: 'Vimeo', icon: Film },
  dailymotion: { label: 'Dailymotion', icon: Tv },
  twitch: { label: 'Twitch', icon: Twitch },
}

export default function ResultCard({ data, originalUrl }) {
  const [downloading, setDownloading] = useState(null)
  const isProfilePic = data.platform === 'instagram' || data.platform === 'facebook'
  const [isIOS, setIsIOS] = useState(false)

  // ตรวจจับ iOS
  useState(() => {
    const ua = navigator.userAgent
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !window.MSStream)
  }, [])

  const handleDownload = async (option) => {
    setDownloading(option.id)
    const url = getDownloadUrl(originalUrl, option.id)

    try {
      // iOS: ใช้ Web Share API ถ้ามี
      if (isIOS && navigator.share) {
        try {
          // Fetch file เพื่อ share
          const response = await fetch(url)
          const blob = await response.blob()
          const file = new File([blob], option.label + '.' + option.format, { type: blob.type })
          
          await navigator.share({
            files: [file],
            title: data.title,
          })
          
          setDownloading(null)
          return
        } catch (shareError) {
          // ถ้า share ไม่ได้ ใช้วิธีเปิดแท็บใหม่
          console.log('Share failed, opening in new tab')
        }
      }

      // Android หรือ iOS fallback: เปิดในแท็บใหม่
      if (isIOS) {
        // iOS: เปิดในแท็บใหม่
        window.open(url, '_blank')
        setDownloading(null)
        
        // แสดงคำแนะนำสำหรับ iOS
        setTimeout(() => {
          alert('📱 สำหรับ iOS:\n1. รอไฟล์โหลดเสร็จ\n2. กดค้างที่ไฟล์\n3. เลือก "บันทึกลงไฟล์" หรือ "Save to Files"')
        }, 500)
      } else {
        // Android/Desktop: download ปกติ
        const a = document.createElement('a')
        a.href = url
        a.setAttribute('download', '')
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        const onBlur = () => {
          setDownloading(null)
          window.removeEventListener('blur', onBlur)
        }
        window.addEventListener('blur', onBlur)

        setTimeout(() => {
          setDownloading((prev) => prev === option.id ? null : prev)
          window.removeEventListener('blur', onBlur)
        }, 45000)
      }
    } catch (err) {
      console.error('Download failed:', err)
      alert('ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง')
      setDownloading(null)
    }
  }

  const videoOptions = data.options.filter(opt => 
    opt.id.includes('video') || opt.format === 'mp4'
  )
  const audioOptions = data.options.filter(opt => 
    opt.id.includes('audio') || opt.format === 'mp3' || opt.format === 'm4a' || opt.format === 'wav'
  )
  const imageOptions = data.options.filter(opt => 
    opt.id.includes('profile') || opt.format === 'jpg' || opt.format === 'png' || opt.format === 'jpeg'
  )

  return (
    <div className="result-card">
      {downloading && (
        <div className="processing-overlay">
          <div className="processing-overlay__content">
            <div className="loading__spinner"></div>
            <h3 className="processing-overlay__title">กำลังดาวน์โหลด...</h3>
            <p className="processing-overlay__desc">
              {isIOS ? (
                <>
                  📱 iOS: รอไฟล์โหลดเสร็จ<br/>
                  แล้วกดค้างเพื่อบันทึก
                </>
              ) : (
                <>
                  รอหน้าต่างบันทึกไฟล์เด้งขึ้นมา<br/>
                  อาจใช้เวลา 5-30 วินาที
                </>
              )}
            </p>
            <button className="processing-overlay__close" onClick={() => setDownloading(null)}>
              ปิดหน้าต่างนี้
            </button>
          </div>
        </div>
      )}

      {data.thumbnail && (
        <div className={`result-card__preview ${isProfilePic ? 'result-card__preview--square' : ''}`}>
          <span className={`platform-badge platform-badge--floating platform-badge--${data.platform}`}>
            {(() => {
              const config = PLATFORM_CONFIG[data.platform]
              const Icon = config?.icon
              return (
                <>
                  {Icon && <Icon size={16} strokeWidth={2.5} />}
                  <span>{config?.label || data.platform}</span>
                </>
              )
            })()}
          </span>
          <img
            className={`result-card__img ${isProfilePic ? 'result-card__img--profile' : ''}`}
            src={data.thumbnail}
            alt={data.title}
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        </div>
      )}

      <div className="result-card__body">
        <h2 className="result-card__title">{data.title}</h2>
        {data.description && <p className="result-card__desc">{data.description}</p>}

        <div className="result-card__groups">
          {videoOptions.length > 0 && (
            <div className="result-card__group">
              <h3 className="result-card__group-title">
                <Video size={14} /> วิดีโอ
              </h3>
              <div className="result-card__actions">
                {videoOptions.map((option, i) => (
                  <button
                    key={option.id}
                    className={`dl-btn ${i === 0 ? 'dl-btn--primary' : ''} ${downloading === option.id ? 'dl-btn--loading' : ''}`}
                    onClick={() => handleDownload(option)}
                    disabled={!!downloading}
                  >
                    {downloading === option.id ? <Loader2 size={16} className="lucide-spin" /> : <Download size={16} />}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {audioOptions.length > 0 && (
            <div className="result-card__group">
              <h3 className="result-card__group-title">
                <Music size={14} /> เสียง
              </h3>
              <div className="result-card__actions">
                {audioOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`dl-btn ${downloading === option.id ? 'dl-btn--loading' : ''}`}
                    onClick={() => handleDownload(option)}
                    disabled={!!downloading}
                  >
                    {downloading === option.id ? <Loader2 size={16} className="lucide-spin" /> : <Download size={16} />}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {imageOptions.length > 0 && (
            <div className="result-card__group">
              <h3 className="result-card__group-title">
                <Download size={14} /> รูปภาพ
              </h3>
              <div className="result-card__actions">
                {imageOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`dl-btn dl-btn--primary ${downloading === option.id ? 'dl-btn--loading' : ''}`}
                    onClick={() => handleDownload(option)}
                    disabled={!!downloading}
                  >
                    {downloading === option.id ? <Loader2 size={16} className="lucide-spin" /> : <Download size={16} />}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
