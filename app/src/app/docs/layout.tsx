import { Metadata } from "next";
import { Providers } from "../providers";

export const metadata: Metadata = {
  title: "CityCatalyst API Docs",
  description: "Interactive API documentation for the CityCatalyst platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
