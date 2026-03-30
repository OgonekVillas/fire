import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'Огонёк — Учёт' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
