# 🚀 Deploy แบบง่าย - Monolith (ทุกอย่างรวมกัน)

## ทำไมต้องแยก Frontend/Backend?

**ตอบ:** ไม่จำเป็นต้องแยก! แต่แยกจะได้ประโยชน์:
- Frontend บน Vercel = เร็วมาก (CDN ทั่วโลก)
- Backend บน Render = รองรับ yt-dlp ได้

**แต่ถ้าไม่อยากยุ่งยาก → ใช้ Monolith (รวมกัน) ได้เลย!**

---

## 📦 วิธี Deploy แบบรวมกัน (Monolith)

### ขั้นตอนที่ 1: Build Frontend

```bash
cd frontend
npm install
npm run build
```

จะได้ folder `frontend/dist/` ที่มี HTML, CSS, JS

### ขั้นตอนที่ 2: Push โค้ดไป GitHub

```bash
git add .
git commit -m "Ready for monolith deployment"
git push
```

### ขั้นตอนที่ 3: Deploy ไปที่ Render

1. ไปที่ https://render.com
2. คลิก "New +" → "Web Service"
3. Connect GitHub repository
4. ตั้งค่า:
   - **Name:** download-everything
   - **Root Directory:** (เว้นว่าง)
   - **Environment:** Docker
   - **Dockerfile Path:** Dockerfile.monolith
   - **Plan:** Free

5. Environment Variables:
   ```
   NODE_ENV=production
   PORT=3001
   ```

6. คลิก "Create Web Service"

### เสร็จแล้ว! 🎉

URL เดียว: `https://download-everything.onrender.com`

---

## 🔄 อัพเดทโค้ด

เมื่อแก้โค้ด:

```bash
# 1. Build frontend ใหม่
cd frontend
npm run build

# 2. Push
git add .
git commit -m "Update"
git push
```

Render จะ auto-deploy ให้เอง!

---

## ⚡ ทดสอบ Local (Monolith Mode)

```bash
# 1. Build frontend
cd frontend
npm run build

# 2. Run backend (จะ serve frontend ด้วย)
cd ../backend
bun install
NODE_ENV=production bun run src/index.ts

# 3. เปิด browser
# http://localhost:3001
```

---

## 🆚 เปรียบเทียบ

### แบบรวมกัน (Monolith)
✅ Deploy ครั้งเดียว  
✅ URL เดียว  
✅ ไม่ต้องตั้งค่า CORS  
❌ Cold start ช้ากว่า (30-60 วินาที)  
❌ ถ้า backend crash, frontend ก็ตาย  

### แบบแยก (Vercel + Render)
✅ Frontend เร็วมาก  
✅ แยก scaling ได้  
✅ Frontend ไม่ตายถ้า backend crash  
❌ Deploy 2 ที่  
❌ ต้องตั้งค่า CORS  

---

## 💡 คำแนะนำ

**ใช้ส่วนตัว/กลุ่มเล็ก:**  
→ Monolith (ง่ายกว่า)

**ใช้งานจริง/มีคนใช้เยอะ:**  
→ แยก Vercel + Render (เร็วกว่า)

---

## 🐛 แก้ปัญหา

**ปัญหา:** Frontend ไม่แสดง (404)  
**แก้:** ตรวจสอบว่า build frontend แล้ว และมี folder `frontend/dist/`

**ปัญหา:** Cold start ช้า  
**แก้:** ใช้ auto-wake service หรือ upgrade เป็น paid plan

**ปัญหา:** yt-dlp error  
**แก้:** อัพเดท yt-dlp ใน Dockerfile:
```dockerfile
pip3 install --break-system-packages --upgrade yt-dlp
```
