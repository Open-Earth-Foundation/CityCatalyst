'use client'

import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';

import { Poppins } from 'next/font/google'
const poppins = Poppins({ weight: '500', subsets: ['latin'] });

export const theme = extendTheme({
  brand: {
    900: '#1a365d',
    800: '#153e75',
    700: '#2a69ac',
  },
  fonts: {
    heading: 'var(--font-poppins)',
    body: 'var(--font-rubik)',
  },
});

export function Providers({
  children
}: {
  children: React.ReactNode,
}) {
  return (
    <>
      <style jsx global>
        {`
          :root {
            --font-poppins: ${poppins.style.fontFamily};
          }
        `}
      </style>
      <CacheProvider>
        <ChakraProvider>
          {children}
        </ChakraProvider>
      </CacheProvider>
    </>
  );
}

