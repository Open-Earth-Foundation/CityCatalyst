'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { i18n } from '@/i18n-config'


export default function LocaleSwitcher() {
  const pathName = usePathname()
  const redirectedPathName = (locale: string) => {
    if (!pathName) return '/'
    const segments = pathName.split('/')
    segments[1] = locale
    return segments.join('/')
  }

  return (
    <div>
      <ul className='flex space-x-4'>
        {i18n.locales.map((locale) => {
          return (
            <li key={locale}>
              <Link href={redirectedPathName(locale)} className='text-xl hover:underline hover:text-neutral-500'>{locale}</Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}