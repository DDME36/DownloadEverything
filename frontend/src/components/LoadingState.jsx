export default function LoadingState() {
  return (
    <div className="loading">
      <div className="loading__spinner" />
      <p className="loading__text">กำลังวิเคราะห์ลิงก์...</p>
      <p className="loading__sub">อาจใช้เวลาสักครู่</p>
    </div>
  )
}
