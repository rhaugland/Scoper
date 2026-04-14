import Anthropic from "@anthropic-ai/sdk";
import { buildInterrogationPrompt } from "./prompts";
import type {
  ExtractedDraft,
  GeneratedScopeItem,
  GeneratedAssumption,
  GeneratedRisk,
  InterrogationResult,
} from "./types";

let _anthropic: Anthropic;
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function interrogateScope(
  draft: ExtractedDraft,
  scopeItems: GeneratedScopeItem[],
  assumptions: GeneratedAssumption[],
  risks: GeneratedRisk[],
  previousQA: { question: string; answer: string | null }[]
): Promise<InterrogationResult> {
  const prompt = buildInterrogationPrompt(draft, scopeItems, assumptions, risks, previousQA);

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = text.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr) as InterrogationResult;
  return parsed;
}
