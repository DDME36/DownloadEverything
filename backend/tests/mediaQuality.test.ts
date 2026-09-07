import { test, expect } from 'bun:test'
import { videoQualityOptions, profileImageFromHtml } from '../src/utils/mediaQuality'

test('lists every real resolution descending, including 8K and 240p; ignores audio and duplicates', () => {
  const result = videoQualityOptions([4320, 1080, 240, 1080].map(height => ({ height, vcodec: 'av1' })).concat([{ height: 100, vcodec: 'none' }]))
  expect(result.map(o => o.id)).toEqual(['video_4320p', 'video_1080p', 'video_240p'])
  expect(videoQualityOptions()).toEqual([])
})
test('prefers the largest published profile candidate without changing its URL', () => {
  const url = 'https://cdn.example.com/original.jpg?signature=unchanged'
  const html = `<script type="application/json">${JSON.stringify({user:{profile_pic_url_hd:'https://cdn.example.com/small.jpg',hd_profile_pic_versions:[{url,width:1080,height:1080}]}})}</script>`
  expect(profileImageFromHtml(html)).toBe(url)
  expect(profileImageFromHtml('<html>no image</html>')).toBeUndefined()
})
