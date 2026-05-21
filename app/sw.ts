import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist injects the precache manifest under this property at build time.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Demo API responses must never be served stale. We always go to the
    // network so the parent-facing log and classifier reflect reality.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
      method: "GET",
    },
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
      method: "POST",
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
