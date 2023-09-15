"use client";

import { appTheme } from "@/lib/app-theme";
import { store } from "@/lib/store";
import { CacheProvider } from "@chakra-ui/next-js";
import { ChakraProvider } from "@chakra-ui/react";
import { SessionProvider } from "next-auth/react";
import { Open_Sans, Poppins } from "next/font/google";
import { Provider } from "react-redux";

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
          <SessionProvider>
            <Provider store={store}>{children}</Provider>
          </SessionProvider>
        </ChakraProvider>
      </CacheProvider>
    </>
  );
}
