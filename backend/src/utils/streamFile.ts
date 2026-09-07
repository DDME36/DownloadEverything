import { unlink } from 'node:fs/promises'
import { AppError } from './errors'

export async function saveBoundedStream(stream: ReadableStream<Uint8Array>, path: string, maxBytes: number, signal?: AbortSignal): Promise<number> {
  const reader = stream.getReader()
  const sink = Bun.file(path).writer()
  let bytes = 0
  const onAbort = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    signal?.throwIfAborted()
    while (true) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new AppError('FILE_TOO_LARGE', 'ไฟล์มีขนาดเกินขีดจำกัด', 413)
      sink.write(value)
      await sink.flush()
    }
    await sink.end()
    return bytes
  } catch (error) {
    await reader.cancel().catch(() => {})
    try { await sink.end() } catch {}
    await unlink(path).catch(() => {})
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}
