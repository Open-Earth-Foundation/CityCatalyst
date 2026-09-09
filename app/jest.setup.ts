import "@/util/big_int_json";

// Jest's jsdom environment does not expose Node's native structuredClone.
// Chakra UI uses it while resolving component recipes during render.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = ((value: unknown) =>
    JSON.parse(JSON.stringify(value))) as typeof structuredClone;
}
