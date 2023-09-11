"use client";

import { appTheme } from "@/lib/app-theme";
import { CacheProvider } from "@chakra-ui/next-js";
import { ChakraProvider } from "@chakra-ui/react";
import { SessionProvider } from "next-auth/react";

import { Open_Sans, Poppins } from "next/font/google";
const poppins = Poppins({ weight: "500", subsets: ["latin"] });
const openSans = Open_Sans({ subsets: ["latin"] });

export function Providers({ children }: { children: React.ReactNode }) {
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
        <ChakraProvider theme={appTheme}>
          <SessionProvider>{children}</SessionProvider>
        </ChakraProvider>
      </CacheProvider>
    </>
  );
}
