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

  return (
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
          <IframeAwareWrapper>
            <CookieConsent lng={lng} />
            <ChatPopover lng={lng} />
          </IframeAwareWrapper>
        </Providers>
      </body>
    </html>
  );
}
