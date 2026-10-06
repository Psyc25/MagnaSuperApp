import { describe, expect, it } from "vitest";
import { modelForAgent, resolveAIConfig } from "./config";

const AGENT_MODEL = "gh/gpt-4o-mini-2024-07-18";

describe("resolveAIConfig", () => {
  it("tanpa env di development: 9Router lokal dengan model bawaan agen", () => {
    const c = resolveAIConfig({ NODE_ENV: "development" });
    expect(c.provider).toBe("9router");
    expect(c.available).toBe(true);
    expect(modelForAgent(c, AGENT_MODEL)).toBe(AGENT_MODEL);
  });

  it("tanpa env di production: tidak tersedia dengan petunjuk untuk admin", () => {
    const c = resolveAIConfig({ NODE_ENV: "production" });
    expect(c.available).toBe(false);
    expect(c.unavailableReason).toContain("AI_API_URL");
  });

  it("OpenRouter: model default yang dikenal OpenRouter, bukan nama 9Router", () => {
    const c = resolveAIConfig({ NODE_ENV: "production", AI_API_URL: "https://openrouter.ai/api/v1/", AI_API_KEY: "k" });
    expect(c.provider).toBe("openrouter");
    expect(c.available).toBe(true);
    expect(c.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(modelForAgent(c, AGENT_MODEL)).toBe("openai/gpt-4o-mini");
    expect(c.extraHeaders["X-Title"]).toBe("MagnaSuperApp");
  });

  it("AI_MODEL mengganti model semua agen", () => {
    const c = resolveAIConfig({ AI_API_URL: "https://api.openai.com/v1", AI_API_KEY: "k", AI_MODEL: "gpt-4.1-mini" });
    expect(modelForAgent(c, AGENT_MODEL)).toBe("gpt-4.1-mini");
  });

  it("penyedia cloud tanpa API key tidak tersedia", () => {
    const c = resolveAIConfig({ AI_API_URL: "https://api.groq.com/openai/v1" });
    expect(c.available).toBe(false);
    expect(c.unavailableReason).toContain("AI_API_KEY");
  });

  it("penyedia lain wajib AI_MODEL", () => {
    const c = resolveAIConfig({ AI_API_URL: "https://llm.example.com/v1", AI_API_KEY: "k" });
    expect(c.available).toBe(false);
    expect(resolveAIConfig({ AI_API_URL: "https://llm.example.com/v1", AI_API_KEY: "k", AI_MODEL: "m" }).available).toBe(true);
  });
});

describe("resolveAIConfig dengan AI_PROVIDER", () => {
  it("AI_PROVIDER=groq tanpa AI_API_URL memakai base URL Groq", () => {
    const c = resolveAIConfig({ NODE_ENV: "production", AI_PROVIDER: "groq", AI_API_KEY: "k" });
    expect(c.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(c.provider).toBe("groq");
    expect(c.model).toBe("llama-3.3-70b-versatile");
    expect(c.available).toBe(true);
  });

  it("AI_PROVIDER menimpa AI_API_URL localhost", () => {
    const c = resolveAIConfig({ NODE_ENV: "production", AI_PROVIDER: "together", AI_API_URL: "http://localhost:20128/v1", AI_API_KEY: "k" });
    expect(c.provider).toBe("together");
    expect(c.available).toBe(true);
  });

  it("AI_API_URL non-lokal tetap menang atas AI_PROVIDER", () => {
    const c = resolveAIConfig({ NODE_ENV: "production", AI_PROVIDER: "groq", AI_API_URL: "https://openrouter.ai/api/v1", AI_API_KEY: "k" });
    expect(c.provider).toBe("openrouter");
  });
});
