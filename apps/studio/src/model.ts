import type { StudioProject } from "@smartphonecracy/studio-adapter";

export type StudioNodeLayout = { id: string; x: number; y: number };
export type StudioDocument = {
  studioFormatVersion: 1;
  runtimeScenarioVersion: string;
  showId: string;
  nodes: StudioNodeLayout[];
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>;
  viewport: { x: number; y: number; zoom: number };
  notes?: Record<string, string>;
};

export type Draft = {
  id: string;
  name: string;
  updatedAt: number;
  project: StudioProject;
  document: StudioDocument;
};

export type StudioBackup = { format: "smartphonecracy-studio-backup"; version: 1; draft: Draft };

export function autoLayout(project: StudioProject, showId = crypto.randomUUID()): StudioDocument {
  const nodes = project.scenario.phases.map((phase, index) => ({
    id: phase.id,
    x: 100 + (index % 3) * 280,
    y: 80 + Math.floor(index / 3) * 180,
  }));
  const targets = (phase: StudioProject["scenario"]["phases"][number]) => {
    if (phase.kind === "idle") return [];
    if (phase.kind === "video") return [phase.next];
    return phase.next.type === "fixed"
      ? [phase.next.target]
      : [...Object.values(phase.next.map), phase.next.tie, phase.next.empty];
  };
  const edges = project.scenario.phases.flatMap((phase) =>
    [...new Set(targets(phase))].map((target, index) => ({
      id: `${phase.id}-${target}-${index}`,
      source: phase.id,
      target,
    })),
  );
  return {
    studioFormatVersion: 1,
    runtimeScenarioVersion: project.scenario.version,
    showId,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
