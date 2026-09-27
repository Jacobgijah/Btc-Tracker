/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL in production, e.g. https://btc-api.example.com. Defaults to "/api". */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
