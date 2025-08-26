import UnifiedInviteAcceptancePage from "@/components/InviteAcceptance/UnifiedInviteAcceptancePage";
import { InviteType } from "@/components/InviteAcceptance/UnifiedInviteAcceptancePage";

const AcceptInvitePage = (props: { params: Promise<{ lng: string }> }) => {
  return <UnifiedInviteAcceptancePage params={props.params} inviteType={InviteType.CITY} />;
};

export default AcceptInvitePage;
