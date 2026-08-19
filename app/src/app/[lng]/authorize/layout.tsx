import "../../globals.css";
import { NavigationBar } from "@/components/navigation-bar";
import type { Metadata } from "next";
import { languages } from "@/i18n/settings";
import { Toaster } from "@/components/ui/toaster";
import { use } from "react";
import { Box } from "@chakra-ui/react";

export const metadata: Metadata = {
  title: "CityCatalyst",
  description: "Make building a climate inventory a breeze",
};

export async function generateStaticParams() {
  return languages.map((lng: string) => ({ lng }));
}

export default function AuthorizeRootLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { children } = props;
  const { lng } = use(props.params);

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar lng={lng} />
      <Toaster />
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
