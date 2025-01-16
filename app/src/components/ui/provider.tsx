"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";
import { appTheme } from "@/lib/theme/app-theme";
import { system } from "@chakra-ui/react/preset";

export function Provider(props: ColorModeProviderProps, value: any) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
