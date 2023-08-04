'use client'

import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';

import { Open_Sans, Poppins } from 'next/font/google'
const poppins = Poppins({ weight: '500', subsets: ['latin'] });
const openSans = Open_Sans({ subsets: ['latin'] });

export const theme = extendTheme({
  colors: {
    brand: '#2351DC',
    description: '#7A7B9A',
  },
  fonts: {
    heading: 'var(--font-poppins)',
    body: 'var(--font-opensans)',
  },
  components: {
    Button: {
      baseStyle: {
        textTransform: 'uppercase',
        borderRadius: 50,
      },
      variants: {
        outline: {
          border: '2px solid',
          borderColor: '#2351DC',
          color: '#2351DC',
          _hover: {
            transform: 'scale(0.98)',
            borderColor: '#5a7be0',
            color: '#5a7be0',
          },
          _active: {
            borderColor: '#899ee0',
            color: '#899ee0',
          },
          _loading: {
            opacity: 0.8,
          },
        },
        solid: {
          bg: '#2351DC',
          color: 'white',
          _hover: {
            transform: 'scale(0.98)',
            bg: '#5a7be0',
          },
          _active: {
            bg: '#899ee0',
          },
          _loading: {
            opacity: 0.8,
            _hover: {
              bg: '#5a7be0',
            },
          },
        },
        ghost: {
          color: '#5a7be0',
        },
      },
    },
    Link: {
      baseStyle: {
        color: '#2351DC',
      },
    },
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
            --font-opensans: ${openSans.style.fontFamily};
          }
        `}
      </style>
      <CacheProvider>
        <ChakraProvider theme={theme}>
          {children}
        </ChakraProvider>
      </CacheProvider>
    </>
  );
}

