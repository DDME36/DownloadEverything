import { test, expect } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveBoundedStream } from '../src/utils/streamFile'

test('streams exact bytes and removes output when an unknown-length stream exceeds limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zenload-stream-test-'))
  const path = join(dir, 'output.bin')
  const makeStream = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3, 4])); c.close() } })
  try {
    expect(await saveBoundedStream(makeStream(), path, 4)).toBe(4)
    expect([...new Uint8Array(await Bun.file(path).arrayBuffer())]).toEqual([1, 2, 3, 4])
    await expect(saveBoundedStream(makeStream(), path, 3)).rejects.toThrow()
    expect(await Bun.file(path).exists()).toBe(false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('abort interrupts a stalled stream and removes the partial file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zenload-stream-test-'))
  const path = join(dir, 'output.bin')
  const controller = new AbortController()
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1])) } })
  try {
    const pending = saveBoundedStream(stream, path, 100, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow()
    expect(await Bun.file(path).exists()).toBe(false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
