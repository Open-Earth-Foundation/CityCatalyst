import "../globals.css";
import type { Metadata } from "next";
import { Providers } from "../providers";
import { dir } from "i18next";
import { fallbackLng, languages } from "@/i18n/settings";
import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { use } from "react";

export const metadata: Metadata = {
  title: "CityCatalyst",
  description: "Make building a climate inventory a breeze",
};

export async function generateStaticParams() {
  return languages.map((lng: string) => ({ lng }));
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
    <html lang={lng} dir={dir(lng)} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
        <link rel="icon" type="image/png" href="/assets/icon.png" />
      </head>
      <body>
        <Providers>
          <NavigationBar lng={lng} />
          <Toaster />
          {children}
        </Providers>
      </body>
    </html>
  );
}
