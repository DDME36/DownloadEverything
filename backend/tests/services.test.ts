import { describe, it, expect } from 'bun:test'
import { getInstagramInfo } from '../src/services/instagram'

describe('Service Feature Tests', () => {
  describe('Instagram Service', () => {
    it('should reject stories fast with AUTH_REQUIRED error', async () => {
      try {
        await getInstagramInfo('https://www.instagram.com/stories/username/12345', 'username', 'story')
        expect(true).toBe(false) // Should not reach here
      } catch (err: any) {
        expect(err.code).toBe('AUTH_REQUIRED')
        expect(err.statusCode).toBe(403)
        expect(err.message).toContain('Stories')
        expect(err.suggestion).toContain('Post')
      }
    })
  })
})
