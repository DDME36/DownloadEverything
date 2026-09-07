import { describe, it, expect } from 'bun:test'
import { DirectMediaAdapter } from '../src/adapters/directMedia'
import { GalleryDlAdapter, checkGalleryDl } from '../src/adapters/galleryDl'

describe('Downloader Adapters Tests', () => {
  describe('DirectMediaAdapter', () => {
    const adapter = new DirectMediaAdapter()

    it('should identify direct media URLs based on platform and extension', () => {
      expect(adapter.canHandle('https://example.com/video.mp4', 'direct')).toBe(true)
      expect(adapter.canHandle('https://example.com/video.mp4', 'unknown')).toBe(true)
      expect(adapter.canHandle('https://example.com/audio.mp3', 'unknown')).toBe(true)
      expect(adapter.canHandle('https://example.com/image.png', 'unknown')).toBe(true)
      expect(adapter.canHandle('https://example.com/image.webp', 'unknown')).toBe(true)

      expect(adapter.canHandle('https://www.youtube.com/watch?v=12345', 'youtube')).toBe(false)
      expect(adapter.canHandle('https://example.com/page.html', 'unknown')).toBe(false)
    })

    it('should reject private/SSRF IP addresses in direct media getInfo', async () => {
      await expect(adapter.getInfo('http://169.254.169.254/video.mp4')).rejects.toThrow()
      await expect(adapter.getInfo('http://127.0.0.1/video.mp4')).rejects.toThrow()
      await expect(adapter.getInfo('http://localhost/video.mp4')).rejects.toThrow()
    })
  })

  describe('GalleryDlAdapter', () => {
    const adapter = new GalleryDlAdapter()

    it('should report correct adapter name', () => {
      expect(adapter.name).toBe('gallery-dl')
    })

    it('should check if gallery-dl binary is installed without throwing', async () => {
      const isInstalled = await checkGalleryDl()
      expect(typeof isInstalled).toBe('boolean')
    })

    it('should handle instagram/twitter/reddit platforms only when installed', async () => {
      const isInstalled = await checkGalleryDl()
      if (isInstalled) {
        expect(adapter.canHandle('https://instagram.com/p/123', 'instagram')).toBe(true)
      } else {
        expect(adapter.canHandle('https://instagram.com/p/123', 'instagram')).toBe(false)
      }
    })
  })
})
