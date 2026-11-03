import "../globals.css";
import type { Metadata } from "next";
import { Providers } from "../providers";
import { openSans, poppins } from "../fonts";
import { dir } from "i18next";
import { fallbackLng, languages } from "@/i18n/settings";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { use } from "react";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "CityCatalyst",
  description: "Make building a climate inventory a breeze",
};

export async function generateStaticParams() {
  return languages.map((lng: string) => ({ not_found: [lng] }));
}

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ not_found: string[] }>;
}) {
  const { not_found } = use(params);
  const firstSegment = Array.isArray(not_found) ? not_found[0] : not_found;
  const lng = languages.includes(firstSegment) ? firstSegment : fallbackLng;

  return (
    <html
      lang={lng}
      dir={dir(lng)}
      suppressHydrationWarning
      className={`${openSans.variable} ${poppins.variable}`}
    >
      <head>
        <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
        <link rel="icon" type="image/png" href="/assets/icon.png" />
      </head>
      <body className={openSans.className}>
        <Providers>
          <NavigationBar lng={lng} />
          <Toaster />
          {children}
        </Providers>
      </body>
    </html>
  );
}
