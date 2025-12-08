"use client";
import { use } from "react";
import { useEffect } from "react";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useTheme } from "next-themes";

export default function AuthLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // Use the theme that next-themes already has stored in localStorage
    // If no theme is set, default to blue_theme
    if (!theme) {
      setTheme("blue_theme");
    }
  }, [theme, setTheme]);

  return (
    <Box as="main" h="full" display="flex" flexDirection="column">
      <NavigationBar lng={lng} showNav={false} isAuth />
      <Box display="flex" flexDirection="row" flex={1}>
        <Box w="full">
          <Box pt={148} pb={4} w="480px" maxW="full" mx="auto" px={4}>
            <Toaster />
            {props.children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
