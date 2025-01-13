"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";
import { appTheme } from "@/lib/theme/app-theme";

export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={appTheme}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
