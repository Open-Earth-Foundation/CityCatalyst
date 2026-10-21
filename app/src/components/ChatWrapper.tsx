"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isDashboardRoute, isPreAuthRoute } from "@/util/iframe-routes";

// Pulls in the full ChatBot UI and its dependencies — load it lazily so
// routes that never show it (auth, public dashboards, etc.) don't pay for
// that JS as part of the shared root layout bundle.
const ChatPopover = dynamic(
  () => import("@/components/ChatBot/chat-popover"),
  { ssr: false },
);

// Routes where Clima (the chat launcher) is either not relevant (pre-auth
// flows, public iframe dashboards) or would compete with an embedded/primary
// chat workflow.
function isChatExcludedRoute(pathname: string) {
  return (
    isDashboardRoute(pathname) ||
    isPreAuthRoute(pathname) ||
    pathname.includes("/draft/stationary-energy") ||
    /^\/[^/]+\/cities\/onboarding(\/|$)/.test(pathname) ||
    /(^|\/)concept-notes(?:\/|$)/.test(pathname)
  );
}

interface ChatWrapperProps {
  lng: string;
}

export default function ChatWrapper({ lng }: ChatWrapperProps) {
  const pathname = usePathname();

  if (isChatExcludedRoute(pathname)) {
    return null;
  }

  return <ChatPopover lng={lng} />;
}
