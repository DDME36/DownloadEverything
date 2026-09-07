import type { DownloadOption } from '../types'

export function videoQualityOptions(formats: any[] = []): DownloadOption[] {
  const heights = [...new Set(formats.filter(f => f.vcodec && f.vcodec !== 'none' && Number.isInteger(f.height) && f.height > 0).map(f => f.height as number))].sort((a, b) => b - a)
  return heights.map((height, index) => ({
    id: `video_${height}p`,
    label: `${height}p${index === 0 ? ' · สูงสุดที่มี' : ''}`,
    format: 'mp4', quality: `${height}p`,
  }))
}

// Inspect embedded JSON, never rewrite a signed CDN URL to invent a larger image.
export function profileImageFromHtml(html: string, targetUsername?: string): string | undefined {
  const candidates: { url: string; rank: number; isTarget: boolean }[] = []
  const cleanTarget = targetUsername?.toLowerCase().trim()

  const visit = (value: any, depth = 0, isViewer = false) => {
    if (!value || typeof value !== 'object' || depth > 35) return

    const currentIsViewer = isViewer || value.viewer !== undefined || value.id === 'viewer'
    const objUsername = (value.username || value.user?.username || '')?.toLowerCase()
    const matchesTarget = cleanTarget ? objUsername === cleanTarget : true

    // ถ้าเจอก้อน viewer หรือ username อื่นที่ไม่ตรงกับเป้าหมาย ห้ามนำมาใช้
    if (cleanTarget && objUsername && objUsername !== cleanTarget) {
      return
    }

    if (!currentIsViewer || (cleanTarget && objUsername === cleanTarget)) {
      if (typeof value.profile_pic_url_hd === 'string') {
        candidates.push({ url: value.profile_pic_url_hd, rank: 1, isTarget: matchesTarget })
      }
      const versions = [...(Array.isArray(value.hd_profile_pic_versions) ? value.hd_profile_pic_versions : []), value.hd_profile_pic_url_info].filter(Boolean)
      for (const image of versions) {
        if (typeof image.url === 'string') {
          candidates.push({
            url: image.url,
            rank: Number(image.width || 1) * Number(image.height || 1),
            isTarget: matchesTarget,
          })
        }
      }
    }

    for (const [key, child] of Object.entries(value)) {
      visit(child, depth + 1, currentIsViewer || key === 'viewer')
    }
  }

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])) } catch {}
  }

  if (cleanTarget) {
    const targetMatches = candidates.filter(c => c.isTarget && /^https:\/\//.test(c.url))
    return targetMatches.sort((a, b) => b.rank - a.rank)[0]?.url
  }

  return candidates.filter(c => /^https:\/\//.test(c.url)).sort((a, b) => b.rank - a.rank)[0]?.url
}
