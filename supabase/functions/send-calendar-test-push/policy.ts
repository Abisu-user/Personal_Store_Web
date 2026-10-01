export function providerFailure(status: number | undefined) {
  if (status === 404 || status === 410) return "SUBSCRIPTION_EXPIRED";
  if (status === 401 || status === 403) return "VAPID_REJECTED";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  return "PUSH_PROVIDER_FAILED";
}

export function validDeviceRequest(value: unknown): value is { ownerId: string; subscriptionId: string } {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof body.ownerId === "string" && uuid.test(body.ownerId) &&
    typeof body.subscriptionId === "string" && uuid.test(body.subscriptionId);
}
