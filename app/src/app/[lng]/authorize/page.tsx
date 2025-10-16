import crypto from 'crypto';
import { Auth } from "@/lib/auth";
import { hasFeatureFlag, FeatureFlags } from '@/util/feature-flags';
import AuthorizeForm from './AuthorizeForm';
import RedirectToLogin from "@/components/Navigation/RedirectToLogin";
import OAuthNotEnabled from "./OAuthNotEnabled";

export default async function AuthorizePage({ params }: { params: any }) {

  const { lng } = await params;

  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    return <OAuthNotEnabled lng={lng} />
  }

  const session = await Auth.getServerSession();

  if (!session) {
    return <RedirectToLogin lng={lng} />
  }

  if (!session.csrfSecret) {
    throw new Error('Must have a csrfSecret');
  }

  const csrfToken = crypto
    .createHmac('sha256', session.csrfSecret)
    .digest('hex');

  return <AuthorizeForm csrfToken={csrfToken} lng={lng} />;
}