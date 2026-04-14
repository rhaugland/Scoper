import Anthropic from "@anthropic-ai/sdk";
import { buildProposalPrompt } from "./prompts";
import type { ProposalContext } from "./types";

let _anthropic: Anthropic;
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function generateProposalContent(ctx: ProposalContext): Promise<string> {
  const prompt = buildProposalPrompt(ctx);

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return text.text.trim();
}
