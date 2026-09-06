export function createClient() {
  return { storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } };
}
