/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_XAI_API_KEY?: string
  readonly VITE_XAI_TTS_VOICE?: string
  readonly VITE_XAI_TTS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
