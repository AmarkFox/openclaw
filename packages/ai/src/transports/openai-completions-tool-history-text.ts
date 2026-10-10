import type { Context } from "@openclaw/llm-core";

type CompletionMessage = Record<string, unknown>;

type ToolCallParam = {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
};

type ToolResultFacts = { toolName?: string; isError?: boolean };

function isRecord(value: unknown): value is CompletionMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatToolCallText(call: ToolCallParam): string {
  const name = typeof call.function?.name === "string" ? call.function.name : "tool";
  const rawArgs = call.function?.arguments;
  const args = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {});
  return `[Assistant tool call]: ${name}(${args})`;
}

function formatToolResultHeader(facts: ToolResultFacts | undefined, fallbackName: string): string {
  const name = facts?.toolName || fallbackName;
  return `[Tool result: ${name}${facts?.isError ? " (error)" : ""}]:`;
}

function hasTextContent(content: unknown): boolean {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }
  return Array.isArray(content) && content.length > 0;
}

function appendText(content: unknown, text: string): unknown {
  if (Array.isArray(content)) {
    return [...content, { type: "text", text }];
  }
  return hasTextContent(content) ? `${content as string}\n${text}` : text;
}

function prependHeader(content: unknown, header: string): unknown {
  if (Array.isArray(content)) {
    return content.length > 0
      ? [{ type: "text", text: header }, ...content]
      : `${header}\n(no output)`;
  }
  const text = typeof content === "string" ? content : "";
  return `${header}\n${text.trim().length > 0 ? text : "(no output)"}`;
}

/**
 * Rewrite tool-call history as plain conversation text for a request that sends no `tools`.
 *
 * Some upstreams reject tool_calls/tool messages unless the same request declares tools:
 * Bedrock Converse requires a toolConfig, and LiteLLM refuses such a request before
 * dispatch. Tool-free calls (settled-turn finalization) still need the settled evidence,
 * so it is kept as text. Messages map 1:1 so index-based cache markers stay aligned.
 */
export function rewriteCompletionToolHistoryAsText(
  messages: unknown[],
  context: Pick<Context, "messages">,
): unknown[] {
  const resultFacts = new Map<string, ToolResultFacts>();
  for (const message of context.messages) {
    if (message.role === "toolResult") {
      resultFacts.set(message.toolCallId, {
        toolName: message.toolName,
        isError: message.isError,
      });
    }
  }
  const callNames = new Map<string, string>();
  return messages.map((message) => {
    if (!isRecord(message)) {
      return message;
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      const calls = message.tool_calls as ToolCallParam[];
      if (calls.length === 0) {
        const { tool_calls: _toolCalls, ...rest } = message;
        return rest;
      }
      for (const call of calls) {
        if (typeof call.id === "string" && typeof call.function?.name === "string") {
          callNames.set(call.id, call.function.name);
        }
      }
      const { tool_calls: _toolCalls, ...rest } = message;
      return {
        ...rest,
        content: appendText(message.content, calls.map(formatToolCallText).join("\n")),
      };
    }
    if (message.role === "tool") {
      const toolCallId = typeof message.tool_call_id === "string" ? message.tool_call_id : "";
      const header = formatToolResultHeader(
        resultFacts.get(toolCallId),
        callNames.get(toolCallId) ?? "tool",
      );
      return { role: "user", content: prependHeader(message.content, header) };
    }
    return message;
  });
}
