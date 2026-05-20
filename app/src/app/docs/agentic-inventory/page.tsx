/* eslint-disable i18next/no-literal-string */
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import AgenticInventoryShowcase from "./showcase";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--agentic-display-font",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--agentic-mono-font",
});

export const metadata: Metadata = {
  title: "Agentic Inventory Drafting",
  description:
    "Static concept page for a CityCatalyst inventory drafting subpage.",
};

export default function AgenticInventoryPage() {
  return (
    <AgenticInventoryShowcase
      fontClassName={`${display.variable} ${mono.variable}`}
    />
  );
}
