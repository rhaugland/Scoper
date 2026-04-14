import Anthropic from "@anthropic-ai/sdk";
import { buildExtractionPrompt } from "./prompts";
import type { ExtractionResult } from "./types";

const anthropic = new Anthropic();

export async function extractFromInputs(rawInputs: string[]): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt(rawInputs);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = text.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr) as ExtractionResult;
  return parsed;
}
