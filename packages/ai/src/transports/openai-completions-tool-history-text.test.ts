import { describe, expect, it } from "vitest";
import type { Context, Model, Tool } from "../types.js";
import { createZeroUsage } from "../usage.test-support.js";
import { buildOpenAICompletionsParams } from "./openai-completions-params.js";
import { rewriteCompletionToolHistoryAsText } from "./openai-completions-tool-history-text.js";
import { makeCompletionsModel } from "./openai-completions.test-support.js";

type CompletionsModel = Model<"openai-completions">;
type Message = Record<string, unknown>;

const proxy = makeCompletionsModel({
  provider: "vllm",
  baseUrl: "http://localhost:8000/v1",
  reasoning: false,
});
const native = makeCompletionsModel({ id: "gpt-5.4" });

const lookup: Tool = {
  name: "lookup_weather",
  description: "Get forecast",
  parameters: { type: "object", properties: {} },
};

function settledToolTurn(model: CompletionsModel, tools: Tool[]): Context {
  return {
    systemPrompt: "system",
    tools,
    messages: [
      { role: "user", content: "weather?", timestamp: 1 },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Checking." },
          { type: "toolCall", id: "call_1", name: "lookup_weather", arguments: { city: "Oslo" } },
        ],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: createZeroUsage(),
        stopReason: "toolUse",
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "lookup_weather",
        content: [{ type: "text", text: "rain" }],
        isError: false,
        timestamp: 3,
      },
      { role: "user", content: "Answer now without tools.", timestamp: 4 },
    ],
  };
}

function toolBlocks(messages: unknown[]): Message[] {
  return (messages as Message[]).filter(
    (message) => message.role === "tool" || Array.isArray(message.tool_calls),
  );
}

describe("tool-free Chat Completions requests with tool history", () => {
  it("replays settled tool history as text when a proxy request omits tools", () => {
    const params = buildOpenAICompletionsParams(proxy, settledToolTurn(proxy, []), undefined);

    expect(params).not.toHaveProperty("tools");
    expect(params).not.toHaveProperty("tool_choice");
    expect(toolBlocks(params.messages)).toEqual([]);
    const texts = (params.messages as Message[]).map((message) => JSON.stringify(message.content));
    expect(
      texts.some((text) =>
        text.includes('[Assistant tool call]: lookup_weather({\\"city\\":\\"Oslo\\"})'),
      ),
    ).toBe(true);
    expect(
      texts.some(
        (text) => text.includes("[Tool result: lookup_weather]:") && text.includes("rain"),
      ),
    ).toBe(true);
  });

  it("keeps native tool blocks whenever the request declares tools", () => {
    const params = buildOpenAICompletionsParams(proxy, settledToolTurn(proxy, [lookup]), undefined);

    expect(params.tools).toHaveLength(1);
    expect(toolBlocks(params.messages)).toHaveLength(2);
  });

  it("leaves routes that still send an explicit empty tools array unchanged", () => {
    const params = buildOpenAICompletionsParams(native, settledToolTurn(native, []), undefined);

    expect(params.tools).toEqual([]);
    expect(toolBlocks(params.messages)).toHaveLength(2);
  });

  it("rewrites tool history for a custom proxy host such as LiteLLM", () => {
    const litellm = makeCompletionsModel({
      provider: "litellm",
      baseUrl: "https://llm.example.com",
      reasoning: false,
    });
    const params = buildOpenAICompletionsParams(litellm, settledToolTurn(litellm, []), undefined);

    expect(params).not.toHaveProperty("tools");
    expect(toolBlocks(params.messages)).toEqual([]);
  });
});

describe("rewriteCompletionToolHistoryAsText", () => {
  it("maps messages one-to-one and labels failed tool results", () => {
    const messages: Message[] = [
      { role: "system", content: "system" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "a", type: "function", function: { name: "exec", arguments: '{"cmd":"ls"}' } },
          { id: "b", type: "function", function: { name: "read", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "a", content: "" },
      { role: "tool", tool_call_id: "b", content: [{ type: "text", text: "body" }] },
    ];
    const rewritten = rewriteCompletionToolHistoryAsText(messages, {
      messages: [
        {
          role: "toolResult",
          toolCallId: "a",
          toolName: "exec",
          content: [],
          isError: true,
          timestamp: 1,
        },
      ],
    });

    expect(rewritten).toEqual([
      { role: "system", content: "system" },
      {
        role: "assistant",
        content: '[Assistant tool call]: exec({"cmd":"ls"})\n[Assistant tool call]: read({})',
      },
      { role: "user", content: "[Tool result: exec (error)]:\n(no output)" },
      {
        role: "user",
        content: [
          { type: "text", text: "[Tool result: read]:" },
          { type: "text", text: "body" },
        ],
      },
    ]);
  });
});
