import React, { memo } from 'react'
import { Youtube, Instagram, Facebook, Music2, Twitter, Cloud, Sparkles, Layers, ShieldCheck, Zap } from 'lucide-react'

const BENTO_FEATURES = [
  {
    id: 'tiktok',
    name: 'TikTok Studio',
    tagline: 'วิดีโอไร้ลายน้ำ & สไลด์โชว์รูปภาพ HD + แผ่นเสียง MP3',
    icon: Music2,
    badge: 'NEW: โพสต์รูปภาพ',
    highlight: true,
    capabilities: ['ไร้ลายน้ำ', 'สไลด์รูป HD', 'แผ่นเสียง MP3', 'ดาวน์โหลด ZIP'],
    gradient: 'linear-gradient(135deg, rgba(0, 242, 234, 0.12), rgba(255, 0, 79, 0.12))',
    borderColor: 'rgba(0, 242, 234, 0.3)',
  },
  {
    id: 'youtube',
    name: 'YouTube Pro',
    tagline: 'วิดีโอ 1080p / 4K และแยกไฟล์เสียง MP3 บิตเรตสูง',
    icon: Youtube,
    badge: '4K / MP3',
    capabilities: ['วิดีโอ 1080p/4K', 'แยกไฟล์ MP3', 'ดาวน์โหลดความเร็วสูง'],
    gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(185, 28, 28, 0.05))',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    tagline: 'Reels, สตอรี่, โพสต์ภาพเดี่ยว/อัลบั้ม และรูปโปรไฟล์',
    icon: Instagram,
    badge: 'Reels & Photos',
    capabilities: ['Reels คมชัด', 'อัลบั้มภาพ', 'รูปโปรไฟล์ HD'],
    gradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(249, 115, 22, 0.08))',
    borderColor: 'rgba(236, 72, 153, 0.3)',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    tagline: 'วิดีโอ HD/Watch, คลิปสั้น Reels และรูปภาพโปรไฟล์',
    icon: Facebook,
    badge: 'HD Video',
    capabilities: ['วิดีโอ HD/Watch', 'Facebook Reels', 'โปรไฟล์ต้นฉบับ'],
    gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(29, 78, 216, 0.05))',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    tagline: 'แทร็กเพลงและไฟล์เสียงคุณภาพสูงสุด ส่งตรงลงเครื่อง',
    icon: Cloud,
    badge: 'Lossless Audio',
    capabilities: ['ไฟล์เสียงสตรีมมิ่ง', 'ค้นหาปกเพลง', 'โหลดเร็วพิเศษ'],
    gradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.12), rgba(194, 65, 12, 0.05))',
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    tagline: 'คลิปวิดีโอสั้น, แอนิเมชัน GIF และสื่อจากไทม์ไลน์',
    icon: Twitter,
    badge: 'Clips & GIFs',
    capabilities: ['คลิปวิดีโอไวรัล', 'ไฟล์ GIF', 'ไม่มีโฆษณาแทรก'],
    gradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(2, 132, 199, 0.05))',
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
]

function BentoPlatforms() {
  return (
    <section className="zen-bento-section" aria-labelledby="bento-heading">
      <div className="zen-bento-header">
        <h2 id="bento-heading" className="zen-bento-title">
          <Sparkles size={16} className="text-purple" aria-hidden="true" />
          <span>สื่อทุกรูปแบบ ครอบคลุมทุกแพลตฟอร์ม</span>
        </h2>
        <p className="zen-bento-subtitle">
          เชื่อมต่อแพลตฟอร์มที่คุณชื่นชอบ ดึงไฟล์ต้นฉบับคมชัดสูงสุดอย่างปลอดภัย
        </p>
      </div>

      <div className="zen-bento-grid">
        {BENTO_FEATURES.map((feat) => {
          const Icon = feat.icon
          return (
            <article
              key={feat.id}
              className={`zen-bento-card zen-bento-card--${feat.id} ${feat.highlight ? 'zen-bento-card--highlight' : ''}`}
              style={{
                '--card-gradient': feat.gradient,
                '--card-border-hover': feat.borderColor,
              }}
            >
              <div className="zen-bento-card__top">
                <div className="zen-bento-card__icon-wrap">
                  <Icon size={20} aria-hidden="true" />
                </div>
                {feat.badge && (
                  <span className={`zen-bento-badge ${feat.highlight ? 'zen-bento-badge--pulse' : ''}`}>
                    {feat.badge}
                  </span>
                )}
              </div>

              <div className="zen-bento-card__body">
                <h3 className="zen-bento-card__name">{feat.name}</h3>
                <p className="zen-bento-card__desc">{feat.tagline}</p>
              </div>

              <div className="zen-bento-card__tags">
                {feat.capabilities.map((cap) => (
                  <span key={cap} className="zen-bento-tag">
                    {cap}
                  </span>
                ))}
              </div>
            </article>
          )
        })}
      </div>

      <div className="zen-bento-footer">
        <div className="zen-bento-perk">
          <Zap size={14} className="text-purple" aria-hidden="true" />
          <span>เซิร์ฟเวอร์สตรีมตรง ไม่บีบอัดซ้ำ</span>
        </div>
        <div className="zen-bento-perk">
          <ShieldCheck size={14} className="text-purple" aria-hidden="true" />
          <span>ปลอดภัย 100% ไม่มีโฆษณาสแปม</span>
        </div>
        <div className="zen-bento-perk">
          <Layers size={14} className="text-purple" aria-hidden="true" />
          <span>รองรับ PWA ติดตั้งใช้งานเหมือนแอปจริง</span>
        </div>
      </div>
    </section>
  )
}

export default memo(BentoPlatforms)

