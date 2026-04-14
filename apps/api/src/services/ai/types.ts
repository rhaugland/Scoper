export interface ExtractedDraft {
  projectType: string | null;
  summary: string;
  statedRequirements: string[];
  impliedRequirements: string[];
  stakeholders: string[];
  constraints: string[];
  timelineReferences: string[];
}

export interface GeneratedScopeItem {
  phase: string;
  deliverable: string;
  optimisticHours: number;
  likelyHours: number;
  pessimisticHours: number;
  confidence: number; // 1-100
}

export interface GeneratedAssumption {
  content: string;
}

export interface GeneratedRisk {
  content: string;
  severity: "low" | "medium" | "high";
  mitigation: string | null;
}

export interface ExtractionResult {
  draft: ExtractedDraft;
  scopeItems: GeneratedScopeItem[];
  assumptions: GeneratedAssumption[];
  risks: GeneratedRisk[];
}

export interface GeneratedQuestion {
  content: string;
  scopeImpact: "low" | "medium" | "high";
  riskLevel: "low" | "medium" | "high";
  forClient: boolean;
}

export interface InterrogationResult {
  questions: GeneratedQuestion[];
  updatedScopeItems: GeneratedScopeItem[] | null;
  newAssumptions: GeneratedAssumption[];
  newRisks: GeneratedRisk[];
}
