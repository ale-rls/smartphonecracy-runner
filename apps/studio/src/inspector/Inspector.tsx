import { useEffect, useState } from "react";
import type { StudioProject } from "@smartphonecracy/studio-adapter";
import { compiledJson, phaseIdError, type Phase, type PhaseKind } from "./model.js";

type Props = {
  project: StudioProject;
  selectedId: string | undefined;
  onRename: (nextId: string) => void;
  onChange: (phase: Phase) => void;
  onKindChange: (kind: PhaseKind) => void;
  onTransitionChange: (kind: "fixed" | "quadrant-plurality") => void;
};

const numberValue = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function Inspector({ project, selectedId, onRename, onChange, onKindChange, onTransitionChange }: Props) {
  const phase = project.scenario.phases.find((item) => item.id === selectedId);
  const [idInput, setIdInput] = useState(phase?.id ?? "");
  useEffect(() => setIdInput(phase?.id ?? ""), [phase?.id]);
  const idProblem = phase ? phaseIdError(project, phase.id, idInput) : undefined;

  if (!phase) return <aside className="inspector" aria-label="Properties inspector"><h2>Properties</h2><p>Select a runtime phase to edit it.</p><Compiled project={project} /></aside>;
  const label = (plain: string, runtime: string) => <span>{plain}<small>{runtime}</small></span>;
  const text = (plain: string, runtime: string, value: string, change: (value: string) => void) => <label>{label(plain, runtime)}<input value={value} onChange={(event) => change(event.target.value)} /></label>;
  const number = (plain: string, runtime: string, value: number, change: (value: number) => void) => <label>{label(plain, runtime)}<input type="number" min="0" value={value} onChange={(event) => change(numberValue(event.target.value, value))} /></label>;

  return <aside className="inspector" aria-label="Properties inspector"><h2>Properties</h2>
    <label>{label("Runtime ID", "id")}<input aria-invalid={Boolean(idProblem)} value={idInput} onChange={(event) => setIdInput(event.target.value)} onBlur={() => { if (!idProblem && idInput !== phase.id) onRename(idInput); }} /></label>
    {idProblem && <p className="field-error" role="alert">{idProblem}</p>}
    <label>{label("Phase type", "kind")}<select value={phase.kind} disabled={phase.kind === "idle"} onChange={(event) => onKindChange(event.target.value as PhaseKind)}><option value="idle">Idle</option><option value="video">Video</option><option value="position-question">Position question</option></select></label>
    {phase.kind === "video" && <>
      {text("Media source", "src", phase.src, (src) => onChange({ ...phase, src }))}
      {number("Expected duration (ms)", "expectedDurationMs", phase.expectedDurationMs, (expectedDurationMs) => onChange({ ...phase, expectedDurationMs }))}
    </>}
    {phase.kind === "position-question" && <>
      {text("Question", "text", phase.text, (value) => onChange({ ...phase, text: value }))}
      {text("X axis minimum", "xAxis.minLabel", phase.xAxis.minLabel, (minLabel) => onChange({ ...phase, xAxis: { ...phase.xAxis, minLabel } }))}
      {text("X axis maximum", "xAxis.maxLabel", phase.xAxis.maxLabel, (maxLabel) => onChange({ ...phase, xAxis: { ...phase.xAxis, maxLabel } }))}
      {text("Y axis minimum", "yAxis.minLabel", phase.yAxis.minLabel, (minLabel) => onChange({ ...phase, yAxis: { ...phase.yAxis, minLabel } }))}
      {text("Y axis maximum", "yAxis.maxLabel", phase.yAxis.maxLabel, (maxLabel) => onChange({ ...phase, yAxis: { ...phase.yAxis, maxLabel } }))}
      {number("Question duration (ms)", "durationMs", phase.durationMs, (durationMs) => onChange({ ...phase, durationMs }))}
      {number("Outcome freeze (ms)", "freezeMs", phase.freezeMs, (freezeMs) => onChange({ ...phase, freezeMs }))}
      {number("Connection stale after (ms)", "connectionStaleAfterMs", phase.connectionStaleAfterMs, (connectionStaleAfterMs) => onChange({ ...phase, connectionStaleAfterMs }))}
      <label className="check"><input type="checkbox" checked={phase.showLiveCounts} onChange={(event) => onChange({ ...phase, showLiveCounts: event.target.checked })} />{label("Show live quadrant counts", "showLiveCounts")}</label>
      <label>{label("Transition rule", "next.type")}<select value={phase.next.type} onChange={(event) => onTransitionChange(event.target.value as "fixed" | "quadrant-plurality")}><option value="fixed">Fixed target</option><option value="quadrant-plurality">Quadrant plurality</option></select></label>
      {phase.next.type === "quadrant-plurality" && <CountedStatuses phase={phase} onChange={onChange} />}
    </>}
    <Compiled project={project} />
  </aside>;
}

function CountedStatuses({ phase, onChange }: { phase: Extract<Phase, { kind: "position-question" }>; onChange: (phase: Phase) => void }) {
  if (phase.next.type !== "quadrant-plurality") return null;
  const next = phase.next;
  return <fieldset><legend>Count participant states <small>next.countedStatuses</small></legend>{(["valid", "stale", "disconnected"] as const).map((status) => <label className="check" key={status}><input type="checkbox" checked={next.countedStatuses.includes(status)} onChange={(event) => {
    const values = event.target.checked ? [...next.countedStatuses, status] : next.countedStatuses.filter((item) => item !== status);
    if (values.length === 0) return;
    onChange({ ...phase, next: { ...next, countedStatuses: values as typeof next.countedStatuses } });
  }} />{status}</label>)}</fieldset>;
}

function Compiled({ project }: { project: StudioProject }) {
  return <details><summary>Compiled scenario JSON (read only)</summary><pre>{compiledJson(project)}</pre></details>;
}
