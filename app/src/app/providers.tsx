"use client";

import { appTheme } from "@/lib/app-theme";
import { store } from "@/lib/store";
import { CacheProvider } from "@chakra-ui/next-js";
import { ChakraProvider } from "@chakra-ui/react";
import { SessionProvider } from "next-auth/react";
import localFont from "next/font/local";
import { Provider } from "react-redux";

const poppins = localFont({
  src: [
    {
      weight: "300",
      style: "normal",
      path: "./fonts/open-sans-v36-latin_latin-ext-300.woff2",
    },
    {
      weight: "400",
      style: "normal",
      path: "./fonts/open-sans-v36-latin_latin-ext-regular.woff2",
    },
    {
      weight: "700",
      style: "normal",
      path: "./fonts/open-sans-v36-latin_latin-ext-700.woff2",
    },
  ],
});
const openSans = localFont({
  src: [
    {
      weight: "300",
      style: "normal",
      path: "./fonts/open-sans-v36-latin_latin-ext-300.woff2",
    },
    {
      weight: "400",
      style: "normal",
      path: "./fonts/poppins-v20-latin_latin-ext-regular.woff2",
    },
    {
      weight: "700",
      style: "normal",
      path: "./fonts/poppins-v20-latin_latin-ext-700.woff2",
    },
  ],
});

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
          <SessionProvider>
            <Provider store={store}>{children}</Provider>
          </SessionProvider>
        </ChakraProvider>
      </CacheProvider>
    </>
  );
}
