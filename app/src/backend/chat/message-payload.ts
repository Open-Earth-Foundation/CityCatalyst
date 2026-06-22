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
  body: ChatMessageRequestBody;
}) {
  const inventoryId = params.body.inventory_id ?? params.body.inventoryId;

  return {
    thread_id: params.body.threadId,
    user_id: params.userId,
    content: params.body.content,
    inventory_id: inventoryId,
    context: params.body.context,
    options: params.body.options || {},
  };
}
