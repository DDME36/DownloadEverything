# 📱 คู่มือใช้งานบน iOS

## ปัญหา iOS

iOS มีข้อจำกัดด้านความปลอดภัย:
- ไม่อนุญาตให้ดาวน์โหลดไฟล์อัตโนมัติ
- ต้องมีการกระทำจากผู้ใช้ (user interaction)
- Safari บล็อก popup และ auto-download

---

## วิธีดาวน์โหลดบน iOS

### วิธีที่ 1: Share Sheet (แนะนำ) ⭐⭐⭐

1. กดปุ่มดาวน์โหลด
2. iOS จะเปิด Share Sheet
3. เลือก "Save to Files" หรือ "บันทึกลงไฟล์"
4. เลือกตำแหน่งที่ต้องการบันทึก
5. เสร็จ!

**ข้อดี:**
- ง่ายที่สุด
- ใช้ได้กับ iOS 13+
- บันทึกตรงไปที่ Files app

---

### วิธีที่ 2: Long Press (Fallback) ⭐⭐

ถ้า Share Sheet ไม่ทำงาน:

1. กดปุ่มดาวน์โหลด
2. ไฟล์จะเปิดในแท็บใหม่
3. **กดค้าง** ที่ไฟล์ (long press)
4. เลือก "Download" หรือ "บันทึก"
5. ไปที่ Downloads folder

**ข้อดี:**
- ใช้ได้กับ iOS ทุกเวอร์ชัน
- ไม่ต้องติดตั้งอะไรเพิ่ม

---

### วิธีที่ 3: Shortcuts (Advanced) ⭐

สำหรับคนที่ชอบ automation:

1. เปิด Shortcuts app
2. สร้าง shortcut ใหม่:
   ```
   Get Contents of URL → [download URL]
   Save File → [destination]
   ```
3. รัน shortcut
4. เสร็จ!

**ข้อดี:**
- Automate ได้
- บันทึกตำแหน่งเดิมเสมอ

**ข้อเสีย:**
- ต้องตั้งค่าก่อน
- ยุ่งยาก

---

## เปรียบเทียบ iOS vs Android

| Feature | iOS | Android |
|---------|-----|---------|
| Auto Download | ❌ | ✅ |
| Direct Save | ❌ | ✅ |
| Share Sheet | ✅ | ✅ |
| Long Press | ✅ | ✅ |
| Shortcuts | ✅ | ❌ |

---

## Tips สำหรับ iOS

### 1. ใช้ Safari
- Chrome บน iOS มีข้อจำกัดมากกว่า
- Safari รองรับ Share API ดีกว่า

### 2. อัพเดท iOS
- iOS 13+ รองรับ Share API
- iOS 15+ ดีที่สุด

### 3. ตั้งค่า Downloads
```
Settings → Safari → Downloads
เลือก: "Ask" หรือ "Downloads folder"
```

### 4. ใช้ Files App
- เปิด Files app
- ไปที่ "On My iPhone" → "Downloads"
- จะเห็นไฟล์ที่ดาวน์โหลด

---

## แก้ปัญหา

### ปัญหา: กดโหลดแล้วไม่มีอะไรเกิดขึ้น
**แก้:** 
- ตรวจสอบว่าไม่ได้บล็อก popup
- ลองใช้ Safari แทน Chrome
- อัพเดท iOS

### ปัญหา: Share Sheet ไม่ขึ้น
**แก้:**
- รีเฟรชหน้าเว็บ
- ลองใหม่อีกครั้ง
- ใช้วิธี Long Press แทน

### ปัญหา: ไฟล์หายหลังดาวน์โหลด
**แก้:**
- เปิด Files app
- ไปที่ Downloads folder
- หรือค้นหาชื่อไฟล์

---

## สรุป

**iOS ยุ่งยากกว่า Android จริงๆ** แต่:

✅ ใช้ Share Sheet (ง่ายที่สุด)  
✅ หรือ Long Press (ใช้ได้เสมอ)  
✅ ระบบจะแนะนำวิธีให้อัตโนมัติ  

**ไม่ต้องกังวล!** 😊
