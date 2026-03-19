# 🦊 Download Everything

ดาวน์โหลดวิดีโอและเสียงจากทุกแพลตฟอร์มได้ง่ายๆ ในที่เดียว

## ✨ Features

- 🎬 รองรับ 10 แพลตฟอร์ม: YouTube, Instagram, Facebook, TikTok, Twitter, Reddit, Vimeo, Dailymotion, Twitch, SoundCloud
- 📹 หลายความละเอียด: 360p - 2160p (4K)
- 🎵 หลายรูปแบบเสียง: MP3, WAV, M4A
- ⚡ Streaming download (ไม่ต้องรอนาน)
- 📱 รองรับ iOS (Web Share API)
- 🎨 UI สวยงาม พร้อม Lucide icons
- 🇹🇭 ภาษาไทย

## 🚀 Quick Start

### Local Development

```bash
# Backend
cd backend
bun install
bun run dev

# Frontend (terminal ใหม่)
cd frontend
npm install
npm run dev
```

เปิด http://localhost:5173

## 📦 Deployment

### แนะนำ: Render (Monolith - ง่ายที่สุด)

1. Build frontend:
```bash
cd frontend
npm install
npm run build
```

2. Push to GitHub:
```bash
git add .
git commit -m "Deploy"
git push
```

3. Deploy to Render:
- New Web Service
- Connect GitHub repo
- Docker deployment (ใช้ `Dockerfile.monolith`)
- Environment: `NODE_ENV=production`

URL เดียว: `https://your-app.onrender.com`

### ทางเลือก: แยก Frontend (Vercel) + Backend (Render)

**Frontend → Vercel:**
- Root directory: `frontend`
- Environment: `VITE_API_URL=https://your-backend.onrender.com`

**Backend → Render:**
- Root directory: `backend`
- Docker deployment
- Environment: `FRONTEND_URL=https://your-frontend.vercel.app`

## ⚙️ Tech Stack

- **Backend**: Bun + Elysia + yt-dlp
- **Frontend**: React + Vite + Lucide Icons
- **Deployment**: Render / Vercel (Free Tier)

## 📝 Notes

### YouTube Age-Restricted Videos
วิดีโอที่มีข้อจำกัดอายุ - ระบบจะพยายามแก้ไขอัตโนมัติด้วย 3 วิธี:
1. Android Client (ดีที่สุด)
2. TV Embedded Client
3. Web Client (Fallback)

อัตราความสำเร็จ: 70-80% (ขึ้นกับการอัปเดต yt-dlp)

**หากยังดาวน์โหลดไม่ได้:**
- อัปเดต yt-dlp: `yt-dlp -U`
- ดูรายละเอียดเพิ่มเติมใน [AGE_RESTRICTED_FIX.md](./AGE_RESTRICTED_FIX.md)

### Instagram Profile Pictures
Instagram จำกัดความละเอียดรูปโปรไฟล์ที่ 640x640px (March 2026) - นี่เป็นข้อจำกัดจาก Instagram API ไม่ใช่ปัญหาของโปรแกรม

### Free Tier Limitations
- Cold start: 30-60 วินาที (ครั้งแรก)
- File size: จำกัด 500MB
- Concurrent: แนะนำไม่เกิน 2-3 คนพร้อมกัน
- Rate limiting: YouTube อาจบล็อก IP ชั่วคราว (รอ 10-15 นาที)

### iOS Download
iOS ใช้ Web Share API - กดโหลดแล้วเลือก "Save to Files"

## 🛠️ Environment Variables

### Monolith
```env
NODE_ENV=production
PORT=3001
```

### แยก Frontend/Backend
**Frontend:**
```env
VITE_API_URL=https://your-backend.onrender.com
```

**Backend:**
```env
PORT=3001
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
```

## 📄 License

MIT
