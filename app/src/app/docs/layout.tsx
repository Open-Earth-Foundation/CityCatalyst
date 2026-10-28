import { Metadata } from "next";
import { Providers } from "../providers";
import { openSans, poppins } from "../fonts";

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${openSans.variable} ${poppins.variable}`}
    >
      <body className={openSans.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
