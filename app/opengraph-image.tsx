import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'The Kosher Place: Mashgiach'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#163260',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://mashgiach.tkpapps.com/logo.png"
          width={220}
          height={220}
          alt=""
        />
        <div style={{ color: '#C9A044', fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>
          The Kosher Place
        </div>
        <div style={{ color: '#ffffff', fontSize: 28, opacity: 0.85 }}>
          מערכת ניהול משגיחי כשרות
        </div>
      </div>
    ),
    { ...size }
  )
}
