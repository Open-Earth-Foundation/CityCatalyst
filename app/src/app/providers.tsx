"use client";

import { store } from "@/lib/store";
import { ChakraProvider } from "@chakra-ui/react";
import { SessionProvider } from "next-auth/react";
import localFont from "next/font/local";
import { Provider } from "react-redux";

import { appTheme } from "@/lib/theme/recipes/app-theme";
import { ThemeProvider } from "next-themes";
import { LogoProvider } from "@/hooks/logo-provider/use-logo-provider";

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
      <ThemeProvider
        defaultTheme="blue_theme"
        themes={[
          "blue_theme",
          "light_brown_theme",
          "dark_orange_theme",
          "green_theme",
          "light_blue_theme",
          "violet_theme",
        ]}
      >
        <LogoProvider>
          <ChakraProvider value={appTheme}>
            <SessionProvider>
              <Provider store={store}>{children}</Provider>
            </SessionProvider>
          </ChakraProvider>
        </LogoProvider>
      </ThemeProvider>
    </>
  );
}
