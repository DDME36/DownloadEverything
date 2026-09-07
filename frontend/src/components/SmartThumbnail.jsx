import React, { useState, useEffect } from 'react'
import { resolveBackendUrl } from '../services/api'
import {
  Youtube,
  Instagram,
  Facebook,
  Music,
  Twitter,
  Cloud,
  Image as ImageIcon,
  Film,
  MessageCircle,
  Tv,
  Twitch,
} from 'lucide-react'

const PLATFORM_ICONS = {
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
  soundcloud: Cloud,
  tiktok: Music,
  twitter: Twitter,
  reddit: MessageCircle,
  vimeo: Film,
  dailymotion: Tv,
  twitch: Twitch,
  direct: Film,
}

const PLATFORM_COLORS = {
  youtube: 'linear-gradient(135deg, #ef4444, #991b1b)',
  instagram: 'linear-gradient(135deg, #ec4899, #f43f5e, #f97316)',
  facebook: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  soundcloud: 'linear-gradient(135deg, #f97316, #c2410c)',
  tiktok: 'linear-gradient(135deg, #06b6d4, #0891b2)',
  twitter: 'linear-gradient(135deg, #38bdf8, #0284c7)',
  reddit: 'linear-gradient(135deg, #ff4500, #c83200)',
  default: 'linear-gradient(135deg, #9333ea, #6b21a8)',
}

/**
 * SmartThumbnail: ป้องกันรูปพัง 100% (Anti-Broken Image & Smooth Fade-in)
 * 1. โหลดตรงก่อนด้วย referrerPolicy="no-referrer"
 * 2. หากติด AdBlocker หรือ CORS/Referrer ให้สลับมาใช้ /api/proxy-image อัตโนมัติ
 * 3. หาก URL หมดอายุหรือ 404 ให้เรนเดอร์ Branded Avatar พร้อมไอคอนแพลตฟอร์มและตัวอักษรย่อสวยงาม
 * 4. มี Skeleton Shimmer ขณะกำลังโหลด ไม่กระพริบขาวหรือวูบวาบ
 */
export default function SmartThumbnail({
  src,
  alt = '',
  title = '',
  platform = 'default',
  circle = false,
  className = '',
  style = {},
  size = 50,
}) {
  const [stage, setStage] = useState('direct') // 'direct' | 'proxy' | 'fallback'
  const [loaded, setLoaded] = useState(false)

  // รีเซ็ตสถานะเมื่อ src เปลี่ยน
  useEffect(() => {
    setStage(src ? 'direct' : 'fallback')
    setLoaded(false)
  }, [src])

  const PlatformIcon = PLATFORM_ICONS[platform?.toLowerCase()] || ImageIcon
  const bgGradient = PLATFORM_COLORS[platform?.toLowerCase()] || PLATFORM_COLORS.default

  // คำนวณตัวอักษรย่อสำหรับ Avatar Fallback
  const initial = (title || alt || platform || '?').trim().charAt(0).toUpperCase()

  const handleError = () => {
    if (stage === 'direct' && src && !src.includes('/api/proxy-image') && src.startsWith('http')) {
      // ลองโหลดผ่าน Image Proxy ของเซิร์ฟเวอร์ (แก้ปัญหา Client Adblocker บล็อก *.fbcdn.net / *.cdninstagram.com)
      setStage('proxy')
    } else {
      // หาก Proxy แล้วยังไม่ผ่าน (URL signature หมดอายุจริง) ให้แสดง Branded Fallback
      setStage('fallback')
    }
  }

  if (stage === 'fallback' || !src) {
    return (
      <div
        className={`smart-thumb-fallback ${circle ? 'smart-thumb-fallback--circle' : ''} ${className}`}
        style={{
          width: size ? `${size}px` : undefined,
          height: size ? `${size}px` : undefined,
          background: bgGradient,
          ...style,
        }}
        title={title || alt}
        aria-label={title || alt}
      >
        <span className="smart-thumb-fallback__initial">{initial}</span>
        <span className="smart-thumb-fallback__badge">
          <PlatformIcon size={Math.max(10, Math.floor(size * 0.28))} />
        </span>
      </div>
    )
  }

  const effectiveSrc =
    stage === 'proxy'
      ? resolveBackendUrl(`/api/proxy-image?url=${encodeURIComponent(src)}`)
      : resolveBackendUrl(src)

  return (
    <div
      className={`smart-thumb-container ${circle ? 'smart-thumb-container--circle' : ''} ${className}`}
      style={{
        width: size ? `${size}px` : undefined,
        height: size ? `${size}px` : undefined,
        ...style,
      }}
    >
      {/* Skeleton Shimmer Background ระหว่างโหลด */}
      {!loaded && <div className="smart-thumb-skeleton" />}

      <img
        src={effectiveSrc}
        alt="" /* เว้น alt เป็นค่าว่างเพื่อไม่ให้บราวเซอร์วาดข้อความทับซ้อนไอคอนในกล่องเล็ก */
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={`smart-thumb-img ${loaded ? 'smart-thumb-img--loaded' : ''}`}
      />
    </div>
  )
}
