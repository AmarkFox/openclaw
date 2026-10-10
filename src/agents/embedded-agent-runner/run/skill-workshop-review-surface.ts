import type { RunEmbeddedAgentParams } from "./params.js";

/**
 * The review inherits the reviewed turn's already prepared prompt additions (progress-card and
 * incognito guidance, Git co-author credit). Deriving them again for the private review session
 * would append them twice or change them, so the review reuses the inherited values verbatim.
 */
export function resolveSkillWorkshopReviewPromptAdditions(
  params: Pick<
    RunEmbeddedAgentParams,
    "skillWorkshopReviewOf" | "sessionPersistence" | "extraSystemPrompt" | "gitCoauthorPrompt"
  >,
): { extraSystemPrompt?: string; gitCoauthorPrompt?: string } | undefined {
  if (!params.skillWorkshopReviewOf?.trim() || params.sessionPersistence !== "detached") {
    return undefined;
  }
  return {
    extraSystemPrompt: params.extraSystemPrompt,
    gitCoauthorPrompt: params.gitCoauthorPrompt,
  };
}

/**
 * A detached Workshop review never probes GitHub publication for its private session, so it
 * would build a different tool catalog than the turn it reviews. Mirror the reviewed turn's
 * observation for the tool surface only; the review's execution allowlist still denies the
 * GitHub tools, so this keeps the prompt-cache prefix without granting any action.
 */
export function resolveSkillWorkshopReviewGithubSurface(
  params: Pick<
    RunEmbeddedAgentParams,
    "skillWorkshopReviewOf" | "sessionPersistence" | "skillWorkshopReviewGithubPublicationAvailable"
  >,
): { githubPublicationAvailable?: boolean } {
  if (
    !params.skillWorkshopReviewOf?.trim() ||
    params.sessionPersistence !== "detached" ||
    params.skillWorkshopReviewGithubPublicationAvailable === undefined
  ) {
    return {};
  }
  return { githubPublicationAvailable: params.skillWorkshopReviewGithubPublicationAvailable };
}
