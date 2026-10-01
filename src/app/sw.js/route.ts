import { renderServiceWorker } from "@/lib/pwa/service-worker-source";

export const dynamic = "force-dynamic";

export function GET() {
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "local";
  return new Response(renderServiceWorker(buildId), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Service-Worker-Allowed": "/",
      "X-Personal-Vault-SW-Version": buildId,
    },
  });
}
