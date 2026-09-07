import { afterEach, expect, spyOn, test } from 'bun:test'
import * as security from '../src/utils/security'
import { getFacebookInfo, downloadFacebook } from '../src/services/facebook'
import { downloadInstagram, getInstagramInfo } from '../src/services/instagram'
import { GalleryDlAdapter } from '../src/adapters/galleryDl'
import type { MediaInfo } from '../src/types'
import sharp from 'sharp'

const avatar = 'https://scontent.example.fbcdn.net/v/t39.30808-1/avatar.jpg?oh=signed&ctp=s100x100&oe=123'
const cover = 'https://scontent.example.fbcdn.net/v/t39.30808-6/cover.jpg?oh=other&ctp=s960x960'
const meta: MediaInfo = {
  platform: 'facebook', title: 'Example', contentType: 'profile', thumbnail: avatar,
  options: [], items: [{ id: 'cover', kind: 'image', url: cover, options: [{ id: 'cover_hd', label: 'Cover', format: 'jpg' }] }],
}
let restore: (() => void) | undefined
afterEach(() => { restore?.(); restore = undefined })

function respond(handler: (url: string, init?: RequestInit) => Response) {
  const spy = spyOn(security, 'safeFetch').mockImplementation(async (url, init) => handler(String(url), init))
  restore = () => spy.mockRestore()
}

test('Facebook keeps signed CDN query bytes unchanged', async () => {
  respond(() => new Response(`<title>Example | Facebook</title><img src="${avatar.replaceAll('&', '&amp;')}">`))
  expect((await getFacebookInfo('https://facebook.com/example', 'example')).thumbnail).toBe(avatar)
})

test('Facebook does not discard a valid profile containing a login link', async () => {
  respond((_url, init) => new Headers(init?.headers).get('user-agent')?.includes('facebookexternalhit')
    ? new Response('<title>Log in to Facebook</title>')
    : new Response(`<title>Example | Facebook</title><a href="/login.php">Login</a><img src="${avatar}">`))
  expect((await getFacebookInfo('https://facebook.com/example', 'example')).thumbnail).toBe(avatar)
})

test('Facebook selects cached cover by option, never returns avatar for a cover request', async () => {
  respond(url => new Response(url === cover ? 'cover bytes' : 'wrong image', { headers: { 'content-type': 'image/jpeg' } }))
  const result = await downloadFacebook('https://facebook.com/example', 'example', 'profile', 'cover_hd', undefined, undefined, meta)
  expect(await new Response(result.stream).text()).toBe('cover bytes')
})

test('Facebook and Instagram cached downloads need no second profile request', async () => {
  respond(url => {
    if (url !== avatar) throw new Error('Unexpected profile scrape')
    return new Response('image bytes', { headers: { 'content-type': 'image/jpeg' } })
  })
  for (const download of [downloadFacebook, downloadInstagram]) {
    const cached = { ...meta, thumbnail: `https://api.example.com/api/proxy-image?url=${encodeURIComponent(avatar)}` }
    const result = await download('https://facebook.com/example', 'example', 'profile', 'profile_hd', undefined, undefined, cached)
    expect(await new Response(result.stream).text()).toBe('image bytes')
  }
})

test('Instagram rejects an HTML login response from the image CDN', async () => {
  respond(() => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }))
  await expect(downloadInstagram('https://instagram.com/example', 'example', 'profile', 'profile_hd', undefined, undefined, meta)).rejects.toThrow()
})

function galleryOutput(output: unknown) {
  const spy = spyOn(Bun, 'spawn').mockImplementation((..._args: any[]) => ({
    stdout: new Response(JSON.stringify(output)).body, stderr: new Response('').body,
    exited: Promise.resolve(0), pid: 1,
  }) as any)
  restore = () => spy.mockRestore()
}

test('gallery-dl excludes directory and queued extractor URLs from media items', async () => {
  galleryOutput([[2, { category: 'instagram' }], [6, 'https://instagram.com/p/child', {}], [3, avatar, { extension: 'jpg' }]])
  const info = await new GalleryDlAdapter().getInfo('https://instagram.com/p/example')
  expect(info.items.map(item => item.url)).toEqual([avatar])
})

test('gallery-dl accepts a single JSONL media tuple', async () => {
  galleryOutput([3, avatar, { extension: 'jpg' }])
  expect((await new GalleryDlAdapter().getInfo('https://instagram.com/p/example')).items[0].url).toBe(avatar)
})

test('gallery-dl rejects an extraction containing only queued URLs', async () => {
  galleryOutput([[6, 'https://instagram.com/p/child', {}]])
  await expect(new GalleryDlAdapter().getInfo('https://instagram.com/p/example')).rejects.toThrow()
})

test('Facebook accepts HttpOnly cookies and excludes expired or lookalike domains', async () => {
  const previous = process.env.FACEBOOK_COOKIE
  delete process.env.FACEBOOK_COOKIE
  const fileSpy = spyOn(Bun, 'file').mockImplementation(() => ({
    exists: async () => true,
    text: async () => '#HttpOnly_.facebook.com\tTRUE\t/\tTRUE\t0\txs\tvalid\n.facebook.com\tTRUE\t/\tTRUE\t1\tc_user\texpired\nnotfacebook.com\tTRUE\t/\tTRUE\t0\tbad\tevil',
  }) as any)
  let cookie = ''
  respond((_url, init) => {
    cookie = new Headers(init?.headers).get('cookie') || ''
    return new Response(`<meta property="og:image" content="${avatar}">`)
  })
  const restoreFetch = restore
  restore = () => { restoreFetch?.(); fileSpy.mockRestore(); if (previous === undefined) delete process.env.FACEBOOK_COOKIE; else process.env.FACEBOOK_COOKIE = previous }
  await getFacebookInfo('https://facebook.com/example', 'example')
  expect(cookie).toBe('xs=valid')
})

test('Instagram reports upstream throttling as RATE_LIMITED instead of private account', async () => {
  respond(() => new Response(JSON.stringify({ message: 'Please wait a few minutes before you try again.', status: 'fail' }), {
    status: 401, headers: { 'content-type': 'application/json' },
  }))
  try {
    await getInstagramInfo('https://instagram.com/thosrs/', 'thosrs')
    throw new Error('Expected upstream rejection')
  } catch (error: any) {
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.statusCode).toBe(429)
  }
})

test('Instagram upscales lower-resolution profile pictures to 1080x1080 Full HD', async () => {
  const smallJpeg = await sharp({
    create: { width: 150, height: 150, channels: 3, background: { r: 255, g: 120, b: 0 } }
  }).jpeg().toBuffer()

  respond(url => {
    if (url === avatar) {
      return new Response(smallJpeg, { headers: { 'content-type': 'image/jpeg' } })
    }
    return new Response('not found', { status: 404 })
  })

  const cached = { ...meta, thumbnail: avatar }
  const result = await downloadInstagram('https://instagram.com/testuser', 'testuser', 'profile', 'profile_hd', undefined, undefined, cached)

  expect(result.filename).toBe('testuser_profile_1080p_HD.jpg')
  expect(result.contentType).toBe('image/jpeg')

  const downloadedBuf = Buffer.from(await new Response(result.stream).arrayBuffer())
  const metaAfter = await sharp(downloadedBuf).metadata()
  expect(metaAfter.width).toBe(1080)
  expect(metaAfter.height).toBe(1080)
})

