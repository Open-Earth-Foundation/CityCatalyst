declare global {
  interface Window {
    /** Populated at runtime by RuntimeEnvScript */
    __ENV?: Record<string, string>;
  }
}

export {};
