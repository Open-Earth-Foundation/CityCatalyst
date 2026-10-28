"use client";

import { store } from "@/lib/store";
import { ChakraProvider } from "@chakra-ui/react";
import { SessionProvider } from "next-auth/react";
import { Provider } from "react-redux";

import { appTheme } from "@/lib/theme/recipes/app-theme";
import { ThemeProvider } from "next-themes";
import { OrganizationContextProvider } from "@/hooks/organization-context-provider/use-organizational-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
      <ChakraProvider value={appTheme}>
        <Provider store={store}>
          <OrganizationContextProvider>
            <SessionProvider>{children}</SessionProvider>
          </OrganizationContextProvider>
        </Provider>
      </ChakraProvider>
    </ThemeProvider>
  );
}
