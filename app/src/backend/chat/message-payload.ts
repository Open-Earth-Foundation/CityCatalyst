type ChatMessageRequestBody = {
  threadId: string;
  content: string;
  inventory_id?: string;
  inventoryId?: string;
  context?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export function buildClimateAdvisorMessagePayload(params: {
  userId: string;
  accessToken: string;
  body: ChatMessageRequestBody;
}) {
  const inventoryId = params.body.inventory_id ?? params.body.inventoryId;
  const context = { ...(params.body.context ?? {}) };
  delete context.access_token;
  delete context.cc_access_token;
  context.access_token = params.accessToken;

  return {
    thread_id: params.body.threadId,
    user_id: params.userId,
    content: params.body.content,
    inventory_id: inventoryId,
    context,
    options: params.body.options || {},
  };
}
