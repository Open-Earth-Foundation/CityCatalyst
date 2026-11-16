import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  loadLLMFileConfig,
  resetLLMConfigCache,
  resolveLLMConfigPath,
} from "@/backend/llm/config";
import { LLMError, LLMErrorCode } from "@/backend/llm/types";

const ROLE = "    name: gpt-5.6-luna\n";

function buildYaml(
  overrides: { pdf?: string; skipCrva?: boolean; extra?: string } = {},
): string {
  const pdf = overrides.pdf ?? ROLE;
  const crva = overrides.skipCrva ? "" : `  crva_extraction:\n${ROLE}`;
  return (
    `models:\n  pdf_extraction:\n${pdf}` +
    crva +
    `  file_interpretation:\n    name: gpt-4o-mini\n    temperature: 0\n` +
    `api:\n  timeout_ms: 1000\n  max_retries: 2\n` +
    (overrides.extra ?? "")
  );
}

let tmpDir: string;
let counter = 0;

function writeConfig(yamlText: string): string {
  const filePath = path.join(tmpDir, `llm_config_${counter++}.yaml`);
  fs.writeFileSync(filePath, yamlText);
  process.env.LLM_CONFIG_PATH = filePath;
  return filePath;
}

function load(yamlText: string) {
  writeConfig(yamlText);
  return loadLLMFileConfig();
}

function expectConfigError(fn: () => unknown, message?: string): void {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(LLMError);
  expect((error as LLMError).code).toBe(LLMErrorCode.CONFIG);
  if (message) {
    expect((error as LLMError).message).toContain(message);
  }
}

describe("LLM file config", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-config-"));
    delete process.env.LLM_CONFIG_PATH;
    resetLLMConfigCache();
  });

  afterEach(() => {
    delete process.env.LLM_CONFIG_PATH;
    resetLLMConfigCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads the versioned app/llm_config.yaml", () => {
    const config = loadLLMFileConfig();
    expect(config.models.pdf_extraction).toEqual({ name: "gpt-5.6-luna" });
    expect(config.models.crva_extraction).toEqual({ name: "gpt-5.6-luna" });
    expect(config.models.file_interpretation).toEqual({
      name: "gpt-4o-mini",
      temperature: 0,
    });
    expect(config.timeoutMs).toBe(180000);
    expect(config.maxRetries).toBe(3);
  });

  it("maps reasoning_effort to reasoningEffort", () => {
    const config = load(
      buildYaml({ pdf: `${ROLE}    reasoning_effort: "low"\n` }),
    );
    expect(config.models.pdf_extraction.reasoningEffort).toBe("low");
  });

  it("falls back to the default path when LLM_CONFIG_PATH is blank", () => {
    process.env.LLM_CONFIG_PATH = "  ";
    expect(resolveLLMConfigPath()).toBe(
      path.join(process.cwd(), "llm_config.yaml"),
    );
  });

  it("rejects a missing file", () => {
    const missing = path.join(tmpDir, "does-not-exist.yaml");
    process.env.LLM_CONFIG_PATH = missing;
    expectConfigError(() => loadLLMFileConfig(), missing);
  });

  it("rejects an empty file", () => {
    expectConfigError(() => load(""));
  });

  it("rejects an unknown top-level key", () => {
    expectConfigError(() => load(buildYaml({ extra: "extra: 1\n" })));
  });

  it("rejects an unknown role field", () => {
    expectConfigError(
      () => load(buildYaml({ pdf: `${ROLE}    temprature: 0\n` })),
      "temprature",
    );
  });

  it("rejects a missing role", () => {
    expectConfigError(
      () => load(buildYaml({ skipCrva: true })),
      "crva_extraction",
    );
  });

  it("rejects an empty model name", () => {
    expectConfigError(() => load(buildYaml({ pdf: '    name: ""\n' })));
  });

  it.each(["minimal", "High"])(
    "rejects an unknown reasoning effort (%s)",
    (effort) => {
      expectConfigError(() =>
        load(buildYaml({ pdf: `${ROLE}    reasoning_effort: "${effort}"\n` })),
      );
    },
  );

  it.each([-0.1, 2.1])("rejects a temperature out of range (%s)", (temp) => {
    expectConfigError(() =>
      load(buildYaml({ pdf: `${ROLE}    temperature: ${temp}\n` })),
    );
  });

  it("reads the file once", () => {
    const filePath = writeConfig(buildYaml());
    const first = loadLLMFileConfig();
    fs.rmSync(filePath);
    const second = loadLLMFileConfig();
    expect(second).toEqual(first);
    expect(second.timeoutMs).toBe(1000);
  });
});
