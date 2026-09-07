import { expect, test } from 'bun:test'
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initCookies, getCookiesPath, getYtDlpArgs } from '../src/utils/helpers'
import { getInstagramCookieHeader } from '../src/services/instagram'

test('environment session cookies reach the Netscape file used by external downloaders', async () => {
  const keys = ['DATA_DIR', 'YT_DLP_COOKIES_TEXT', 'INSTAGRAM_COOKIE', 'FACEBOOK_COOKIE']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const dir = await mkdtemp(join(tmpdir(), 'zenload-cookie-test-'))
  try {
    process.env.DATA_DIR = dir
    process.env.YT_DLP_COOKIES_TEXT = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tPREF\tyoutube-fixture\n.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\told-fixture'
    process.env.INSTAGRAM_COOKIE = 'sessionid=ig-fixture; csrftoken=csrf-fixture'
    process.env.FACEBOOK_COOKIE = 'c_user=fb-fixture; xs=xs-fixture'
    await initCookies()
    const text = await readFile(getCookiesPath()!, 'utf8')
    expect(text).toContain('\tsessionid\tig-fixture')
    expect(text).not.toContain('old-fixture')
    expect(text).toContain('\txs\txs-fixture')
    expect(text).toContain('youtube-fixture')
    expect(getYtDlpArgs(['yt-dlp', 'https://instagram.com/p/example'])).toContain(getCookiesPath()!)
    delete process.env.INSTAGRAM_COOKIE
    expect(await getInstagramCookieHeader()).toBe('sessionid=ig-fixture; csrftoken=csrf-fixture')
  } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
    await initCookies()
    for (const name of ['cookies.txt', 'runtime-cookies.txt']) await unlink(join(dir, 'cookies', name)).catch(() => {})
    await rmdir(join(dir, 'cookies')).catch(() => {})
    await rmdir(dir)
  }
})
