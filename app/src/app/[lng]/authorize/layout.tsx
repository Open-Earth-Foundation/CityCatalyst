import "../../globals.css";
import { NavigationBar } from "@/components/navigation-bar";
import type { Metadata } from "next";
import { languages } from "@/i18n/settings";
import { use } from "react";
import { Box } from "@chakra-ui/react";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
