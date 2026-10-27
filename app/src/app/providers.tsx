"use client";

import { store } from "@/lib/store";
import { ChakraProvider } from "@chakra-ui/react";
import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Provider } from "react-redux";

import { appTheme } from "@/lib/theme/recipes/app-theme";
import { ThemeProvider } from "next-themes";
import { OrganizationContextProvider } from "@/hooks/organization-context-provider/use-organizational-context";
import { isPublicRoute } from "@/util/iframe-routes";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Public pages have no concept of a logged-in user — skip mounting
  // SessionProvider there so it never fires its unconditional
  // GET /api/auth/session on an anonymous page load.
  const skipSession = isPublicRoute(pathname);

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
            {skipSession ? (
              children
            ) : (
              <SessionProvider>{children}</SessionProvider>
            )}
          </OrganizationContextProvider>
        </Provider>
      </ChakraProvider>
    </ThemeProvider>
  );
}
