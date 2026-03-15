# Download Everything - Deployment Guide

## 🎯 แนะนำ: 3 วิธี Deploy

### วิธีที่ 1: Monolith บน Render (ง่ายที่สุด, ฟรี)
**ข้อดี:** 
- Deploy ครั้งเดียว ใช้ free tier เดียว
- ไม่ต้องตั้งค่า CORS
- URL เดียว

**ข้อเสีย:**
- Cold start ช้ากว่า (ต้องรอทั้ง backend + frontend)
- ถ้า backend crash, frontend ก็ตายด้วย

**วิธีทำ:**

1. **Build Frontend ก่อน:**
```bash
cd frontend
npm install
npm run build
# จะได้ folder dist/
```

2. **แก้ Dockerfile ให้ copy frontend:**
```dockerfile
# เพิ่มใน Dockerfile
COPY ../frontend/dist ./frontend/dist
```

3. **แก้ backend/src/index.ts:**
```typescript
// เพิ่มที่ท้ายไฟล์ ก่อน .listen()
import { serveFrontend } from './serve-frontend'

// ถ้าเป็น production, serve frontend
if (process.env.NODE_ENV === 'production') {
  app.use(serveFrontend)
}
```

4. **Deploy ไปที่ Render:**
- New Web Service
- Connect GitHub
- Root directory: `backend`
- Docker deployment
- Environment: `NODE_ENV=production`

**URL เดียว:** `https://your-app.onrender.com`

---

### วิธีที่ 2: แยก Frontend (Vercel) + Backend (Render) - ปัจจุบัน
**ข้อดี:**
- Frontend เร็วมาก (Vercel CDN)
- แยก scaling ได้
- Frontend ไม่ตายถ้า backend crash

**ข้อเสีย:**
- ต้อง deploy 2 ที่
- ต้องตั้งค่า CORS
- ใช้ free tier 2 ที่

**วิธีทำ:**

1. **Frontend → Vercel:**
```bash
cd frontend
# ตั้งค่า environment variable
VITE_API_URL=https://your-backend.onrender.com

# Deploy
vercel --prod
```

2. **Backend → Render:**
```bash
cd backend
# Environment variables:
PORT=3001
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
```

---

### วิธีที่ 3: Monolith บน Railway (ทางเลือก)
เหมือนวิธีที่ 1 แต่ใช้ Railway แทน Render

**Railway ข้อดี:**
- Free tier ดีกว่า Render ($5 credit/month)
- Deploy เร็วกว่า
- ไม่มี cold start

**Railway ข้อเสีย:**
- ต้องใส่บัตรเครดิต (แม้จะไม่เสียเงิน)

---

## 🚀 Quick Start - Monolith Setup

### 1. ติดตั้ง dependencies
```bash
# Backend
cd backend
bun install
bun add @elysiajs/static

# Frontend
cd ../frontend
npm install
```

### 2. Build frontend
```bash
cd frontend
npm run build
```

### 3. Test locally
```bash
cd backend
NODE_ENV=production bun run src/index.ts
# เปิด http://localhost:3001
```

### 4. Deploy

**Dockerfile สำหรับ Monolith:**
```dockerfile
FROM oven/bun:1 AS base

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg nodejs npm \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build frontend
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm ci --production
COPY frontend/ ./
RUN npm run build

# Setup backend
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Copy built frontend
RUN mkdir -p ../frontend/dist
COPY --from=0 /app/frontend/dist ../frontend/dist

RUN mkdir -p /tmp/download-everything

EXPOSE 3001
ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
```

---

## 📊 เปรียบเทียบ

| วิธี | ความยาก | ค่าใช้จ่าย | ความเร็ว | Cold Start |
|------|---------|-----------|----------|------------|
| Monolith (Render) | ⭐ | ฟรี | ปานกลาง | 30-60s |
| แยก (Vercel+Render) | ⭐⭐ | ฟรี | เร็ว | Frontend: 0s, Backend: 30s |
| Monolith (Railway) | ⭐ | $5/month | เร็ว | 5-10s |

---

## 🔧 Environment Variables

### Monolith
```env
NODE_ENV=production
PORT=3001
```

### แยก Frontend/Backend
**Frontend (.env):**
```env
VITE_API_URL=https://your-backend.onrender.com
```

**Backend (.env):**
```env
PORT=3001
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
```

---

## 💡 คำแนะนำ

**สำหรับใช้ส่วนตัว/กลุ่มเล็ก:**
→ ใช้ **Monolith บน Render** (วิธีที่ 1)

**สำหรับใช้งานจริง/มีคนใช้เยอะ:**
→ ใช้ **แยก Vercel + Render** (วิธีที่ 2)

**สำหรับ development:**
→ แยกรัน frontend/backend ต่างหาก (เร็วที่สุด)
