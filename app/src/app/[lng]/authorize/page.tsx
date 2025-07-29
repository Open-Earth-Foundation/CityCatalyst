import crypto from 'crypto';
import { cookies } from 'next/headers';
import AuthorizeForm from './AuthorizeForm';
import { Auth } from "@/lib/auth";

export default async function AuthorizePage({ params }: { params: { lng: string } }) {

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

  return <AuthorizeForm csrfToken={csrfToken} lng={params.lng} />;
}