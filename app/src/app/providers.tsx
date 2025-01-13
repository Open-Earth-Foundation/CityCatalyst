"use client";

import { persistor, store } from "@/lib/store";
import { CacheProvider } from "@chakra-ui/next-js";
import { Provider as ChakraProvider } from "@/components/ui/provider";
import { SessionProvider } from "next-auth/react";
import localFont from "next/font/local";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";

const openSans = localFont({
  src: [
    {
      weight: "400",
      style: "normal",
      path: "./fonts/open-sans-v36-latin_latin-ext-regular.woff2",
    },
    {
      weight: "600",
      style: "normal",
      path: "./fonts/open-sans-v36-latin_latin-ext-600.woff2",
    },
  ],
});
const poppins = localFont({
  src: [
    {
      weight: "400",
      style: "normal",
      path: "./fonts/poppins-v20-latin_latin-ext-regular.woff2",
    },
    {
      weight: "500",
      style: "normal",
      path: "./fonts/poppins-v20-latin_latin-ext-500.woff2",
    },
    {
      weight: "600",
      style: "normal",
      path: "./fonts/poppins-v20-latin_latin-ext-600.woff2",
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
        <ChakraProvider>
          <SessionProvider>
            <Provider store={store}>
              <PersistGate loading={null} persistor={persistor}>
                {children}
              </PersistGate>
            </Provider>
          </SessionProvider>
        </ChakraProvider>
      </CacheProvider>
    </>
  );
}
