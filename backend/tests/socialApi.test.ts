import { afterEach, expect, spyOn, test } from 'bun:test'
import { app } from '../src/index'
import * as facebook from '../src/services/facebook'
import * as gallery from '../src/adapters/galleryDl'
import { mediaCache } from '../src/utils/cache'

let restore: (() => void) | undefined
afterEach(() => { restore?.(); mediaCache.clear() })
const info = { platform: 'facebook' as const, title: 'Example', thumbnail: 'https://cdn.example.com/avatar.jpg', items: [], options: [] }
const analyze = (url: string) => app.handle(new Request('http://localhost/api/analyze', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.55' }, body: JSON.stringify({ url }),
}))

test('analyze cache uses the same normalized URL as the download worker', async () => {
  const spy = spyOn(facebook, 'getFacebookInfo').mockResolvedValue({ ...info })
  restore = () => spy.mockRestore()
  const response = await analyze('facebook.com/example')
  expect(response.status).toBe(200)
  expect(mediaCache.get('https://facebook.com/example')?.title).toBe('Example')
})

test('Instagram album extraction detects gallery-dl before asking whether it can handle the post', async () => {
  let ready = false
  const check = spyOn(gallery, 'checkGalleryDl').mockImplementation(async () => { ready = true; return true })
  const can = spyOn(gallery.GalleryDlAdapter.prototype, 'canHandle').mockImplementation(() => ready)
  const get = spyOn(gallery.GalleryDlAdapter.prototype, 'getInfo').mockResolvedValue({ ...info, platform: 'instagram', title: 'Album extracted' })
  // If routing skips gallery, fail without contacting Instagram.
  const ig = await import('../src/services/instagram')
  const fallback = spyOn(ig, 'getInstagramInfo').mockRejectedValue(new Error('gallery not initialized'))
  restore = () => { check.mockRestore(); can.mockRestore(); get.mockRestore(); fallback.mockRestore() }
  const response = await analyze('https://instagram.com/p/example')
  expect((await response.json()).data?.title).toBe('Album extracted')
})
