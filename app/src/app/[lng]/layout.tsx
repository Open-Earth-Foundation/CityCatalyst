import "../globals.css";
import type { Metadata } from "next";
import { Providers } from "../providers";
import { openSans, poppins } from "../fonts";
import { dir } from "i18next";
import { languages } from "@/i18n/settings";
import { RuntimeEnvScript, env } from "@/lib/runtime-env";
import { Toaster } from "@/components/ui/toaster";
import ClientRootLayout from "@/components/ClientRootLayout";
import CookieConsent from "@/components/CookieConsent";
import { use } from "react";
import ChatWrapper from "@/components/ChatWrapper";
import HighlightWidgets from "@/components/HighlightIo/HighlightWidgets";
import { hasServerFeatureFlag, FeatureFlags } from "@/util/feature-flags";
export const metadata: Metadata = {
  title: {
    default: "CityCatalyst",
    template: "CityCatalyst - %s",
  },
  description: "Make building a climate inventory a breeze",
};

export async function generateStaticParams() {
  return languages.map((lng: string) => ({ lng }));
}

const HIGHLIGHT_PROJECT_ID =
  env("NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID") || "4d7yymxd";
const ENVIRONMENT = process.env.NODE_ENV || "development";

export default function RootLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);

  // Check for Highlight feature flag (inside component to avoid static generation issues)
  let isHighlightEnabled = false;
  try {
    isHighlightEnabled = hasServerFeatureFlag(FeatureFlags.HIGHLIGHT_ENABLED);
  } catch (error) {
    // Fallback to false if feature flag check fails
    console.warn("Failed to check Highlight feature flag:", error);
    isHighlightEnabled = false;
  }

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
        <RuntimeEnvScript />
      </head>
      <body className={openSans.className}>
        <Providers>
          <Toaster />
          <HighlightWidgets
            enabled={isHighlightEnabled}
            projectId={HIGHLIGHT_PROJECT_ID}
            serviceName={`CityCatalyst-${ENVIRONMENT}`}
          />
          <ClientRootLayout lng={lng}>{props.children}</ClientRootLayout>
          <CookieConsent lng={lng} />
          <ChatWrapper lng={lng} />
        </Providers>
      </body>
    </html>
  );
}
