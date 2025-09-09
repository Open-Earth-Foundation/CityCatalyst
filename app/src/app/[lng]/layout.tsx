import "../globals.css";
import type { Metadata } from "next";
import { Providers } from "../providers";
import { dir } from "i18next";
import { languages } from "@/i18n/settings";
import { PublicEnvScript } from "next-runtime-env";
import { Toaster } from "@/components/ui/toaster";
import ClientRootLayout from "@/components/ClientRootLayout";
import CookieConsent from "@/components/CookieConsent";
import { use } from "react";
import { HighlightInit } from "@highlight-run/next/client";
import HighlightIdentifier from "@/components/HighlightIdentifier";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

export const metadata: Metadata = {
  title: "CityCatalyst",
  description: "Make building a climate inventory a breeze",
};

export async function generateStaticParams() {
  return languages.map((lng: string) => ({ lng }));
}

export default function RootLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const isHighlightEnabled = hasFeatureFlag(FeatureFlags.HIGHLIGHT_ENABLED);

  return (
<<<<<<< HEAD
    <>
      {isHighlightEnabled && (
        <HighlightInit
          projectId={process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID}
          serviceName="citycatalyst"
          tracingOrigins
          backendUrl={process.env.NEXT_PUBLIC_HIGHLIGHT_BACKEND_URL}
          networkRecording={{
            enabled: true,
            recordHeadersAndBody: true,
            urlBlocklist: [],
          }}
        />
      )}
      <html lang={lng} dir={dir(lng)} suppressHydrationWarning>
        <head>
          <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
          <link rel="icon" type="image/png" href="/assets/icon.png" />
          <PublicEnvScript />
        </head>
        <body>
          <Providers>
            {isHighlightEnabled && <HighlightIdentifier />}
            <Toaster />
            <ClientRootLayout lng={lng}>{props.children}</ClientRootLayout>
          </Providers>
        </body>
      </html>
    </>
=======
    <html lang={lng} dir={dir(lng)} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
        <link rel="icon" type="image/png" href="/assets/icon.png" />
        <PublicEnvScript />
      </head>
      <body>
        <Providers>
          <Toaster />
          <ClientRootLayout lng={lng}>{props.children}</ClientRootLayout>
          <CookieConsent lng={lng} />
        </Providers>
      </body>
    </html>
>>>>>>> develop
  );
}
