/** Select one proxy consistently for HTTP fetch and external download tools. */
export function getProxyForUrl(url: string | URL): string | undefined {
  const target = new URL(url)
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || ''
  const port = target.port || (target.protocol === 'https:' ? '443' : '80')
  for (const raw of noProxy.split(',')) {
    const entry = raw.trim().toLowerCase()
    if (!entry) continue
    if (entry === '*') return ''
    const match = entry.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/)
    if (!match || (match[2] && match[2] !== port)) continue
    const host = match[1].replace(/^\*?\./, '')
    if (target.hostname === host || target.hostname.endsWith('.' + host)) return ''
  }
  const protocolProxy = target.protocol === 'https:'
    ? process.env.HTTPS_PROXY || process.env.https_proxy
    : process.env.HTTP_PROXY || process.env.http_proxy
  return protocolProxy || process.env.ALL_PROXY || process.env.all_proxy || process.env.YT_DLP_PROXY || undefined
}
