import { describe, it, expect } from 'bun:test'
import { classifyYtDlpError } from '../src/utils/errors'

describe('yt-dlp Error Classifier Tests', () => {
  it('should classify Auth/Private errors and prohibit client retry', () => {
    const err = classifyYtDlpError('ERROR: [youtube] dQw4w9WgXcQ: Private video. Sign in if you\'ve been granted access to this video')
    expect(err.type).toBe('AUTH_REQUIRED')
    expect(err.canRetryWithClient).toBe(false)
    expect(err.statusCode).toBe(403)
  })

  it('should classify Bot Challenge errors and permit client retry', () => {
    const err = classifyYtDlpError('ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you’re not a bot. This helps protect our community.')
    expect(err.type).toBe('CHALLENGE_REQUIRED')
    expect(err.canRetryWithClient).toBe(true)
    expect(err.statusCode).toBe(403)
  })

  it('should classify Rate Limit errors and prohibit immediate retry', () => {
    const err = classifyYtDlpError('ERROR: [youtube] HTTP Error 429: Too Many Requests')
    expect(err.type).toBe('RATE_LIMITED')
    expect(err.canRetryWithClient).toBe(false)
    expect(err.statusCode).toBe(429)
  })

  it('should classify Format Unavailable errors and flag for format fallback', () => {
    const err = classifyYtDlpError('ERROR: [youtube] dQw4w9WgXcQ: Requested format is not available. Use --list-formats for a list of available formats')
    expect(err.type).toBe('FORMAT_UNAVAILABLE')
    expect(err.canRetryWithFormat).toBe(true)
    expect(err.canRetryWithClient).toBe(false)
    expect(err.statusCode).toBe(400)
  })

  it('should classify Not Found / Removed errors', () => {
    const err = classifyYtDlpError('ERROR: [youtube] dQw4w9WgXcQ: Video unavailable. This video has been removed by the uploader')
    expect(err.type).toBe('NOT_FOUND')
    expect(err.canRetryWithClient).toBe(false)
    expect(err.statusCode).toBe(404)
  })

  it('should classify Network Timeout errors and flag for network retry', () => {
    const err = classifyYtDlpError('ERROR: [youtube] Unable to download webpage: The read operation timed out')
    expect(err.type).toBe('NETWORK_ERROR')
    expect(err.canRetryNetwork).toBe(true)
    expect(err.statusCode).toBe(504)
  })
})
