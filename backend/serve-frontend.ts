import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

/**
 * Plugin สำหรับ serve frontend static files
 * ใช้เมื่อต้องการ deploy แบบ monolith (backend + frontend รวมกัน)
 */
export const serveFrontend = (app: Elysia) => {
  // ใน production, frontend จะถูก build ไว้ที่ ../frontend/dist
  const frontendPath = process.env.NODE_ENV === 'production' 
    ? '../frontend/dist' 
    : '../frontend/dist'

  return app
    // Serve static files (JS, CSS, images)
    .use(staticPlugin({
      assets: frontendPath,
      prefix: '/',
    }))
    // SPA fallback - ส่ง index.html สำหรับ routes ที่ไม่ใช่ API
    .get('*', ({ set }) => {
      const indexPath = `${frontendPath}/index.html`
      const file = Bun.file(indexPath)
      set.headers['content-type'] = 'text/html'
      return file
    })
}
