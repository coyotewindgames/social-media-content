/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

// Allow `process.env` checks in browser-safe code (provider-fallback.ts)
declare const process: { env: Record<string, string | undefined> } | undefined

// Fix @github/spark llmPrompt type: package declares string[] but tagged
// template literals pass TemplateStringsArray. Override the Window property.
interface Window {
  spark: {
    llmPrompt(strings: TemplateStringsArray | string[], ...values: any[]): string;
    llm(prompt: string, modelName?: string, jsonMode?: boolean): Promise<string>;
    user: () => Promise<{ login: string }>;
    kv: {
      keys: () => Promise<string[]>;
      get: <T>(key: string) => Promise<T | undefined>;
      set: <T>(key: string, value: T) => Promise<void>;
      delete: (key: string) => Promise<void>;
    };
  };
}
