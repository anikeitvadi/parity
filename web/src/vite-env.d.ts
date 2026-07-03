/// <reference types="vite/client" />

// Custom build-time env vars exposed to the client (see web/src/api/client.ts).
interface ImportMetaEnv {
  /** Set to 'true' to build the static portfolio bundle (frozen snapshot, no live /api). */
  readonly VITE_STATIC?: string;
}
