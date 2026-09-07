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
export function profileImageFromHtml(html: string): string | undefined {
  const candidates: { url: string; rank: number }[] = []
  const visit = (value: any, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 35) return
    if (typeof value.profile_pic_url_hd === 'string') candidates.push({ url: value.profile_pic_url_hd, rank: 1 })
    const versions = [...(Array.isArray(value.hd_profile_pic_versions) ? value.hd_profile_pic_versions : []), value.hd_profile_pic_url_info].filter(Boolean)
    for (const image of versions) if (typeof image.url === 'string') candidates.push({ url: image.url, rank: Number(image.width || 1) * Number(image.height || 1) })
    for (const child of Object.values(value)) visit(child, depth + 1)
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])) } catch {}
  }
  return candidates.filter(c => /^https:\/\//.test(c.url)).sort((a, b) => b.rank - a.rank)[0]?.url
}
