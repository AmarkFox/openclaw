import type { RunEmbeddedAgentParams } from "./params.js";

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
