// Authenticate the recording browser against the real development service.
// Credentials stay in memory and are never included in recording artifacts.
const fs = require('node:fs');
const path = require('node:path');
const base = 'https://citycatalyst.openearth.dev';
module.exports = async (context) => {
  const values = {};
  const root = path.resolve(__dirname, '../../..');
  for (const raw of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  if (!values.CITYCATALYST_DEV_EMAIL || !values.CITYCATALYST_DEV_PASSWORD) throw new Error('Development login credentials unavailable');
  const csrfResponse = await context.request.get(base + '/api/auth/csrf/', {timeout:30000});
  if (!csrfResponse.ok()) throw new Error('CSRF endpoint HTTP ' + csrfResponse.status());
  const {csrfToken} = await csrfResponse.json();
  const login = await context.request.post(base + '/api/auth/callback/credentials/?json=true', {form:{csrfToken,email:values.CITYCATALYST_DEV_EMAIL,password:values.CITYCATALYST_DEV_PASSWORD,redirect:'false',callbackUrl:base+'/en/cities/'},timeout:30000});
  if (!login.ok()) throw new Error('Development login HTTP ' + login.status());
  const session = await context.request.get(base + '/api/auth/session/');
  if (!(await session.json())?.user?.email) throw new Error('No authenticated development session');
};
