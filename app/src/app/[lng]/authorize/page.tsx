import crypto from 'crypto';
import AuthorizeForm from './AuthorizeForm';
import { Auth } from "@/lib/auth";
import { hasFeatureFlag, FeatureFlags } from '@/util/feature-flags';

export default async function AuthorizePage({ params }: { params: any }) {

  // XXX: Fix i18n here
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    return <div>{"OAuth 2.0 not enabled"}</div>
  }

  const { lng } = await params;

  const session = await Auth.getServerSession();

  if (!session) {
    throw new Error('Must have a session to authorize');
  }
  if (!session.csrfSecret) {
    throw new Error('Must have a csrfSecret');
  }

  const csrfToken = crypto
    .createHmac('sha256', session.csrfSecret)
    .digest('hex');

  return <AuthorizeForm csrfToken={csrfToken} lng={lng} />;
}