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
import ChatPopover from "@/components/ChatBot/chat-popover";
import IframeAwareWrapper from "@/components/IframeAwareWrapper";
import { HighlightInit } from "@highlight-run/next/client";
import HighlightIdentifier from "@/components/HighlightIo/HighlightIdentifier";
import { hasServerFeatureFlag, FeatureFlags } from "@/util/feature-flags";
export const metadata: Metadata = {
  title: "CityCatalyst",
  description: "Make building a climate inventory a breeze",
};

export async function generateStaticParams() {
  return languages.map((lng: string) => ({ lng }));
}

const HIGHLIGHT_PROJECT_ID =
  process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID || "4d7yymxd";
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
    <>
      <HighlightInit
        projectId={isHighlightEnabled ? HIGHLIGHT_PROJECT_ID : ""}
        serviceName={`CityCatalyst-${ENVIRONMENT}`}
        tracingOrigins={isHighlightEnabled}
        networkRecording={
          isHighlightEnabled
            ? {
                enabled: true,
                recordHeadersAndBody: true,
                urlBlocklist: [],
              }
            : {
                enabled: false,
                recordHeadersAndBody: false,
                urlBlocklist: [],
              }
        }
      />

      <html lang={lng} dir={dir(lng)} suppressHydrationWarning>
        <head>
          <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
          <link rel="icon" type="image/png" href="/assets/icon.png" />
          <PublicEnvScript />
        </head>
        <body>
          <Providers>
            <Toaster />
            {isHighlightEnabled && <HighlightIdentifier />}
            <ClientRootLayout lng={lng}>{props.children}</ClientRootLayout>
            <IframeAwareWrapper>
              <CookieConsent lng={lng} />
              <ChatPopover lng={lng} />
            </IframeAwareWrapper>
          </Providers>
        </body>
      </html>
    </>
  );
}
