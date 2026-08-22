import './globals.css'

export const metadata = {
  title: 'BidBlitz — live auctions on Monad',
  description:
    'Every bid is a Monad transaction. Scan, name yourself, and bid against the room in real time.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // stops iOS zooming when the bid input takes focus mid-auction
  themeColor: '#6e54ff',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
