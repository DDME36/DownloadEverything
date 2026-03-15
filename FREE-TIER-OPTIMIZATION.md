# 🚀 Optimization สำหรับ Free Tier

## ปัญหาหลักของ Free Tier

### 1. Rate Limiting
**ปัญหา:** YouTube/TikTok บล็อก IP ถ้าโหลดบ่อย
**วิธีแก้:**

#### A. ใช้ Proxy Rotation (แนะนำ)
```typescript
// backend/src/services/proxy.ts
const FREE_PROXIES = [
  'http://proxy1.example.com:8080',
  'http://proxy2.example.com:8080',
  // ใช้ free proxy lists
]

let currentProxyIndex = 0

export function getNextProxy(): string {
  const proxy = FREE_PROXIES[currentProxyIndex]
  currentProxyIndex = (currentProxyIndex + 1) % FREE_PROXIES.length
  return proxy
}

// ใช้ใน youtube.ts
const proc = Bun.spawn([
  'yt-dlp',
  '--proxy', getNextProxy(),
  ...formatArgs,
  url
])
```

#### B. Rate Limit Detection + Retry
```typescript
// แก้ใน youtube.ts
async function downloadWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await downloadYoutube(url, option)
    } catch (error) {
      if (error.code === 'RATE_LIMITED' && i < maxRetries - 1) {
        // รอ exponential backoff
        await sleep(Math.pow(2, i) * 5000) // 5s, 10s, 20s
        continue
      }
      throw error
    }
  }
}
```

#### C. User-Agent Rotation
```typescript
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0',
]

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}
```

---

### 2. Cold Start (15-30 วินาที)
**ปัญหา:** Render free tier sleep หลัง 15 นาทีไม่ใช้งาน

**วิธีแก้:**

#### A. Auto Wake-up Service (ฟรี)
```yaml
# ใช้ cron-job.org หรือ UptimeRobot
# Ping ทุก 10 นาที
GET https://your-app.onrender.com/health
```

#### B. Warm-up Endpoint
```typescript
// เพิ่มใน index.ts
.get('/warmup', async () => {
  // Pre-load yt-dlp
  await Bun.spawn(['yt-dlp', '--version'], { stdout: 'ignore' }).exited
  return { status: 'warm', time: Date.now() }
})
```

---

### 3. Disk Space จำกัด
**ปัญหา:** Free tier มี disk น้อย

**วิธีแก้:**

#### A. Cleanup Job
```typescript
// เพิ่มใน index.ts
setInterval(async () => {
  const tempDir = getTempDir()
  const files = await readdir(tempDir)
  const now = Date.now()
  
  for (const file of files) {
    const stat = await Bun.file(`${tempDir}/${file}`).stat()
    // ลบไฟล์เก่ากว่า 5 นาที
    if (now - stat.mtime > 5 * 60 * 1000) {
      await unlink(`${tempDir}/${file}`)
    }
  }
}, 60_000) // ทุก 1 นาที
```

#### B. Stream แทน Save
```typescript
// ใช้ streaming (ทำแล้ว ✅)
// ไม่บันทึกไฟล์ลง disk
```

---

### 4. Memory จำกัด (512MB)
**ปัญหา:** yt-dlp + ffmpeg กิน RAM เยอะ

**วิธีแก้:**

#### A. จำกัดขนาดไฟล์
```typescript
// ทำแล้ว ✅
formatArgs = ['-f', 'bestvideo[filesize<500M]...']
```

#### B. Process Pool
```typescript
// จำกัดการโหลดพร้อมกัน
const MAX_CONCURRENT = 2
let activeDownloads = 0

async function queueDownload(fn: () => Promise<any>) {
  while (activeDownloads >= MAX_CONCURRENT) {
    await sleep(1000)
  }
  activeDownloads++
  try {
    return await fn()
  } finally {
    activeDownloads--
  }
}
```

---

## 🎯 แนวทางที่ดีที่สุดสำหรับ Free Tier

### Option 1: Hybrid (แนะนำ)
```
Frontend (Vercel) → Backend (Render) → Proxy Service
                                    ↓
                              yt-dlp download
```

**ข้อดี:**
- Frontend เร็ว (Vercel CDN)
- Backend ฟรี (Render)
- ใช้ proxy เมื่อจำเป็น

### Option 2: Serverless (ยาก)
```
Frontend → Cloudflare Workers → yt-dlp API
```

**ข้อดี:**
- ไม่มี cold start
- Scale ได้ดี

**ข้อเสีย:**
- ติดตั้ง yt-dlp ยาก
- จำกัด execution time (10s)

### Option 3: P2P (Advanced)
```
Frontend → WebTorrent/IPFS → Distributed download
```

**ข้อดี:**
- ไม่ต้องใช้ server
- ไม่มี rate limit

**ข้อเสีย:**
- ซับซ้อนมาก
- ช้ากว่า

---

## 💰 ถ้ามีงบ ($5-10/เดือน)

### Railway ($5/month)
- ไม่มี cold start
- RAM 1GB
- Disk 5GB
- แนะนำที่สุด!

### Render Paid ($7/month)
- ไม่มี cold start
- RAM 512MB
- Disk 1GB

### VPS (DigitalOcean $6/month)
- Full control
- ติดตั้งอะไรก็ได้
- ต้องจัดการเอง

---

## 🆓 Free Proxy Lists

### 1. Free Proxy APIs
```typescript
// https://www.proxy-list.download/api/v1/get?type=http
// https://api.proxyscrape.com/v2/?request=get&protocol=http
```

### 2. Rotating Proxy Services (Free Tier)
- ScraperAPI: 1,000 requests/month
- Bright Data: 7-day trial
- Oxylabs: Trial available

### 3. Tor Network (ฟรี แต่ช้า)
```bash
# ติดตั้ง tor
apt-get install tor

# ใช้ใน yt-dlp
--proxy socks5://127.0.0.1:9050
```

---

## 📊 เปรียบเทียบ

| วิธี | ค่าใช้จ่าย | Rate Limit | Speed | Complexity |
|------|-----------|-----------|-------|------------|
| Free Tier (ปัจจุบัน) | ฟรี | สูง | ปานกลาง | ⭐ |
| + Proxy Rotation | ฟรี | ต่ำ | ปานกลาง | ⭐⭐ |
| + Auto Wake | ฟรี | สูง | เร็ว | ⭐ |
| Railway | $5/mo | ปานกลาง | เร็ว | ⭐ |
| + Paid Proxy | $10/mo | ไม่มี | เร็วมาก | ⭐⭐ |

---

## 🎯 สรุป: แนะนำสำหรับคุณ

**ใช้ส่วนตัว/กลุ่มเล็ก (1-10 คน):**
```
✅ Free Tier (Render) + Auto Wake
✅ ไม่ต้องใช้ proxy (ไม่โหลดบ่อย)
✅ ไม่มีโฆษณา (ดีกว่าเว็บอื่น!)
```

**ใช้งานจริง (10-100 คน):**
```
✅ Railway ($5/mo)
✅ + Free Proxy Rotation
✅ + Rate Limit Detection
```

**ใช้งานเยอะ (100+ คน):**
```
✅ VPS ($10/mo)
✅ + Paid Proxy Service
✅ + Load Balancer
```

---

## 🔧 Quick Wins (ทำได้เลย)

1. **เพิ่ม Auto Wake** - ใช้ UptimeRobot (ฟรี)
2. **เพิ่ม Cleanup Job** - ลบไฟล์เก่า
3. **เพิ่ม User-Agent Rotation** - ลด detection
4. **เพิ่ม Retry Logic** - auto retry เมื่อ fail

อยากให้ผมช่วยทำอันไหนก่อนครับ?
