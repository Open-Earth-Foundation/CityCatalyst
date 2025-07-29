
// We use a semicolon-separated environment variable
// with each field comma-separated

const clients =
  process.env.OAUTH_CLIENTS?.split(';')
  .map(clientStr => {
    const [id, redirectUri, name, description] = clientStr.split(',', 4);
    return {id, redirectUri, name: {en: name}, description: {en: description}}
  })

const clientMap = (clients)
  ? Object.fromEntries(clients.map(c => [c.id, c]))
  : {}

export async function getClient(clientId: string): Promise<object|null> {
  return clientMap[clientId]
}