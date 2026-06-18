import { requireHiapAgenticPageEnabled } from "@/backend/agentic/hiap/page-guard";
import { HiapChatPage } from "@/components/HIAPAgentic/HiapChatPage";

export default function Page() {
  requireHiapAgenticPageEnabled();
  return <HiapChatPage />;
}
