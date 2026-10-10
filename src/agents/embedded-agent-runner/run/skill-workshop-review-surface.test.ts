import { describe, expect, it } from "vitest";
import { getPluginToolMeta, setPluginToolMeta } from "../../../plugins/tool-metadata.js";
import type { AnyAgentTool } from "../../tools/common.js";
import { gateToolExecution } from "./attempt-tool-catalog.js";
import {
  resolveSkillWorkshopReviewGithubSurface,
  resolveSkillWorkshopReviewPromptAdditions,
} from "./skill-workshop-review-surface.js";

function fakeTool(name: string): AnyAgentTool {
  return {
    name,
    label: name,
    description: `${name} description`,
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: `${name} ran` }], details: {} }),
  } as unknown as AnyAgentTool;
}

describe("Workshop review tool surface parity", () => {
  it("keeps plugin and MCP ownership on execution-gated tools", async () => {
    const browser = fakeTool("browser");
    setPluginToolMeta(browser, { pluginId: "browser", optional: true });
    const remote = fakeTool("remote_echo");
    setPluginToolMeta(remote, {
      pluginId: "bundle-mcp",
      optional: true,
      mcp: { serverName: "remote", safeServerName: "remote", toolName: "echo", operation: "tool" },
    });
    const read = fakeTool("read");

    const [gatedBrowser, gatedRemote, allowedRead] = gateToolExecution(
      [browser, remote, read],
      ["read"],
    );

    expect(allowedRead).toBe(read);
    expect(gatedBrowser).not.toBe(browser);
    expect(getPluginToolMeta(gatedBrowser!)).toEqual(getPluginToolMeta(browser));
    expect(getPluginToolMeta(gatedRemote!)).toEqual(getPluginToolMeta(remote));
    const denied = await gatedBrowser!.execute("call", {});
    expect(JSON.stringify(denied)).not.toContain("browser ran");
  });

  it("mirrors the reviewed turn's GitHub availability only for detached reviews", () => {
    const review = {
      skillWorkshopReviewOf: "agent:main:chat",
      sessionPersistence: "detached" as const,
    };

    expect(
      resolveSkillWorkshopReviewGithubSurface({
        ...review,
        skillWorkshopReviewGithubPublicationAvailable: false,
      }),
    ).toEqual({ githubPublicationAvailable: false });
    expect(
      resolveSkillWorkshopReviewGithubSurface({
        ...review,
        skillWorkshopReviewGithubPublicationAvailable: true,
      }),
    ).toEqual({ githubPublicationAvailable: true });
    expect(resolveSkillWorkshopReviewGithubSurface(review)).toEqual({});
    expect(
      resolveSkillWorkshopReviewGithubSurface({
        skillWorkshopReviewOf: "agent:main:chat",
        sessionPersistence: "durable",
        skillWorkshopReviewGithubPublicationAvailable: true,
      }),
    ).toEqual({});
    expect(
      resolveSkillWorkshopReviewGithubSurface({
        sessionPersistence: "detached",
        skillWorkshopReviewGithubPublicationAvailable: true,
      }),
    ).toEqual({});
  });

  it("reuses the reviewed turn's prepared prompt additions for detached reviews only", () => {
    const prepared = {
      extraSystemPrompt: "Inbound context\n\nCreate a card with progress_card only for ...",
      gitCoauthorPrompt: "Co-authored-by: Example <bot@example.com>",
    };

    expect(
      resolveSkillWorkshopReviewPromptAdditions({
        ...prepared,
        skillWorkshopReviewOf: "agent:main:chat",
        sessionPersistence: "detached",
      }),
    ).toEqual(prepared);
    expect(
      resolveSkillWorkshopReviewPromptAdditions({ ...prepared, sessionPersistence: "detached" }),
    ).toBeUndefined();
    expect(
      resolveSkillWorkshopReviewPromptAdditions({
        ...prepared,
        skillWorkshopReviewOf: "agent:main:chat",
        sessionPersistence: "durable",
      }),
    ).toBeUndefined();
  });
});
