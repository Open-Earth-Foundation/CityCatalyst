import { Suspense } from "react";
import UnifiedInviteAcceptancePage from "@/components/InviteAcceptance/UnifiedInviteAcceptancePage";
import { InviteType } from "@/components/InviteAcceptance/UnifiedInviteAcceptancePage";
import ProgressLoader from "@/components/ProgressLoader";

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
