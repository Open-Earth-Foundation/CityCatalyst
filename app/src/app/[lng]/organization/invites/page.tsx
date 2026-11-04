import { Suspense } from "react";
import UnifiedInviteAcceptancePage from "@/components/InviteAcceptance/UnifiedInviteAcceptancePage";
import { InviteType } from "@/components/InviteAcceptance/UnifiedInviteAcceptancePage";
import ProgressLoader from "@/components/ProgressLoader";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const AcceptInvitePage = (props: { params: Promise<{ lng: string }> }) => {
  return (
    <Suspense fallback={<ProgressLoader />}>
      <UnifiedInviteAcceptancePage
        params={props.params}
        inviteType={InviteType.ORGANIZATION}
      />
    </Suspense>
  );
};

export default AcceptInvitePage;
