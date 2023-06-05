import Navbar from '@/components/navbar/Navbar'
import './globals.css'
import { Poppins } from 'next/font/google'

import { i18n } from '../../i18n-config'

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }))
}

const poppins = Poppins({
  subsets: ['latin'],
  weight: ["300", "400", "500", "600"],
})

export const metadata = {
  title: 'OpenClimate Cities',
  description: 'OpenClimate Cities',
}

export default function RootLayout({
  children,
  params
}: {
  children: React.ReactNode,
  params?: {
    lang?:string
  }
}) {
  return (
    <html lang={params.lang}>
      <body className={poppins.className}>
        <Navbar lang={params.lang}/>
        {children}
      </body>
    </html>
  )
}
