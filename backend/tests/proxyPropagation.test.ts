import { afterEach, expect, spyOn, test } from 'bun:test'
import { safeFetch } from '../src/utils/security'

const keys = ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'YT_DLP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy']
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
})
function capture() {
  for (const key of keys) delete process.env[key]
  let options: any
  const spy = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => { options = init; return new Response('ok') })
  restore = () => spy.mockRestore()
  return () => options
}
test('HTTPS media requests prefer HTTPS_PROXY over HTTP_PROXY', async () => {
  const options = capture()
  process.env.HTTP_PROXY = 'http://http-proxy.example:8080'
  process.env.HTTPS_PROXY = 'http://https-proxy.example:8080'
  await safeFetch('https://8.8.8.8/image.jpg')
  expect(options().proxy).toBe('http://https-proxy.example:8080')
})
test('image fetch uses YT_DLP_PROXY when standard proxy variables are absent', async () => {
  const options = capture()
  process.env.YT_DLP_PROXY = 'http://media-proxy.example:8080'
  await safeFetch('https://8.8.8.8/image.jpg')
  expect(options().proxy).toBe('http://media-proxy.example:8080')
})
test('NO_PROXY keeps matching requests direct', async () => {
  const options = capture()
  process.env.HTTPS_PROXY = 'http://https-proxy.example:8080'
  process.env.NO_PROXY = '8.8.8.8'
  await safeFetch('https://8.8.8.8/image.jpg')
  expect(options().proxy).toBe('')
})
test('redirect to another origin strips account credentials', async () => {
  capture()
  restore?.()
  let headers: Headers | undefined
  const spy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).includes('8.8.8.8')) return new Response(null, { status: 302, headers: { location: 'https://1.1.1.1/image.jpg' } })
    headers = new Headers(init?.headers)
    return new Response('ok')
  })
  restore = () => spy.mockRestore()
  await safeFetch('https://8.8.8.8/', { headers: { Cookie: 'session=private', Authorization: 'Bearer private' } })
  expect(headers?.get('cookie')).toBeNull()
  expect(headers?.get('authorization')).toBeNull()
})
