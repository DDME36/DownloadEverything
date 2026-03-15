# Download Everything - Universal Media Downloader

ดาวน์โหลดวิดีโอ/เสียงจาก YouTube, Instagram, Facebook, SoundCloud ได้ง่ายๆ

## 🚀 Free Tier Deployment

### Frontend (Vercel)
1. Push โค้ดไปที่ GitHub
2. Import project ใน Vercel
3. Set root directory: `frontend`
4. Environment Variables:
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```

### Backend (Render)
1. Create new Web Service
2. Connect GitHub repo
3. Set root directory: `backend`
4. Docker deployment (ใช้ Dockerfile)
5. Environment Variables:
   ```
   PORT=3001
   FRONTEND_URL=https://your-frontend.vercel.app
   ```

## ⚠️ Free Tier Limitations

- **Timeout**: ~30-60 วินาที (ใช้ streaming แก้)
- **Cold Start**: 15-30 วินาทีครั้งแรก
- **File Size**: จำกัดไฟล์ไม่เกิน 500MB
- **Concurrent**: ไม่ควรโหลดพร้อมกันเกิน 2-3 คน

## 🛠️ Local Development

### Backend
```bash
cd backend
bun install
bun run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📦 Features

- ✅ YouTube (video/audio)
- ✅ Instagram (posts/reels)
- ✅ Facebook (videos)
- ✅ SoundCloud (tracks)
- ✅ Streaming download (ไม่ต้องรอนาน)
- ✅ Thai language support

## 🔧 Tech Stack

- **Backend**: Bun + Elysia + yt-dlp
- **Frontend**: React + Vite
- **Deployment**: Render + Vercel (Free Tier)
