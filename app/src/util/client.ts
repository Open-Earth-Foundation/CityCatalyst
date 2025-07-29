
import { Client } from "@/util/types";

// We use a semicolon-separated environment variable
// with each field comma-separated

const clients =
  process.env.OAUTH_CLIENTS?.split(';')
  .map((clientStr) : Client => {
    const [clientId, redirectUri, name, description] = clientStr.split(',', 4);
    return {clientId, redirectUri, name: {en: name}, description: {en: description}}
  })

const clientMap = (clients)
  ? Object.fromEntries(clients.map(c => [c.clientId, c]))
  : {}

export async function getClient(clientId: string): Promise<Client|null> {
  return clientMap[clientId]
}