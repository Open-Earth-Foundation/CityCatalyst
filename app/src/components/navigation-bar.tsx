'use client'

import { useTranslation } from '@/i18n/client';
import { Link } from '@chakra-ui/next-js';
import { Select, Text } from '@chakra-ui/react';
import i18next from 'i18next';
import Image from 'next/image';
import { ChangeEventHandler } from 'react';
import NextLink from 'next/link';

export function NavigationBar({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, 'navigation');
  const onChangeLanguage: ChangeEventHandler<HTMLSelectElement> = (event) => {
    i18next.changeLanguage(event.target.value);
  };

  return (
    <div className="flex flex-row space-between px-8 py-4 align-middle bg-[#001EA7]">
      <NextLink href="/">
        <Image src="/assets/logo.svg" width={36} height={36} alt="CityCatalyst logo" className="mr-[56px]" />
      </NextLink>
      <NextLink href="/">
        <Text size="18" color="white" className="font-bold mt-1">{t('title')}</Text>
      </NextLink>
      <div className="w-full" />
      <Select
        variant="unstyled"
        onChange={onChangeLanguage}
        defaultValue={lng}
        w={20}
        size="md"
        color="white"
        mt={1}
      >
        <option value="en">EN</option>
        <option value="de">DE</option>
        <option value="es">ES</option>
      </Select>
      <Link href="/help" color="white" size="16" className="opacity-75 mt-1" ml={6}>{t('help')}</Link>
    </div>
  )
}
