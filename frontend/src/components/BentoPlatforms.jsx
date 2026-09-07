import { Youtube, Instagram, Facebook, Music, Twitter, Cloud } from 'lucide-react'
const platforms = [['YouTube', Youtube], ['Instagram', Instagram], ['Facebook', Facebook], ['TikTok', Music], ['X / Twitter', Twitter], ['SoundCloud', Cloud]]
export default function BentoPlatforms() {
  return <section className="fetch-platforms" aria-label="แพลตฟอร์ม"><p>ลิงก์จากแพลตฟอร์มที่คุณใช้</p><div>{platforms.map(([name, Icon]) => <span key={name}><Icon size={17} />{name}</span>)}</div><small>ตัวเลือกที่ดาวน์โหลดได้ขึ้นอยู่กับลิงก์และการเข้าถึงเนื้อหาของแต่ละแพลตฟอร์ม</small></section>
}
