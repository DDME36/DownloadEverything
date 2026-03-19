#!/bin/bash
# สคริปต์สำหรับอัปเดต yt-dlp บน production server
# ใช้เมื่อต้องการอัปเดตโดยไม่ต้อง rebuild Docker image

echo "🔄 Updating yt-dlp..."

# อัปเดต yt-dlp
pip3 install --break-system-packages --upgrade yt-dlp

# แสดงเวอร์ชันปัจจุบัน
echo "✅ yt-dlp version:"
yt-dlp --version

echo "✅ Update complete!"
