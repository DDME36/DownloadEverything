import { useState, useEffect } from 'react'
import { Image, Music2, Video, Download } from 'lucide-react'

export default function Header() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        setIsInstalled(true)
      }

      const handleBeforeInstall = (e) => {
        e.preventDefault()
        setInstallPrompt(e)
      }

      const handleAppInstalled = () => {
        setIsInstalled(true)
        setInstallPrompt(null)
      }

      window.addEventListener('beforeinstallprompt', handleBeforeInstall)
      window.addEventListener('appinstalled', handleAppInstalled)

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
        window.removeEventListener('appinstalled', handleAppInstalled)
      }
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
  }

  return (
    <header className="fetch-header">
      <div className="fetch-nav">
        <a href="/" className="fetch-brand">
          <span className="fetch-mark"><img src="/zenload-logo.png?v=zenload4" width="36" height="36" alt="Zenload" /></span>
          <strong>Zenload</strong>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {installPrompt && !isInstalled && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="pwa-install-btn"
              title="ติดตั้ง Zenload ลงในเครื่องหรือมือถือ"
            >
              <Download size={13} /> ติดตั้งแอป
            </button>
          )}
          <span className="fetch-byline">A little tool by Zentyr</span>
        </div>
      </div>
      <div className="fetch-hero">
        <p className="fetch-eyebrow">YOUR MEDIA, ONE PLACE</p>
        <h1>เจอลิงก์ที่ชอบ<br /><span>เก็บไว้ได้ในที่เดียว</span></h1>
        <p>วางลิงก์ เลือกรูปแบบ แล้วดาวน์โหลดสื่อที่ต้องการ</p>
        <div className="fetch-media-types">
          <span><Video size={15} /> วิดีโอ</span>
          <span><Music2 size={15} /> เสียง</span>
          <span><Image size={15} /> รูปภาพ</span>
        </div>
      </div>
    </header>
  )
}




