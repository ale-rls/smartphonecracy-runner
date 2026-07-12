import { useEffect, useMemo, useRef, useState } from "react";
import { addEdge, Background, ReactFlow, type Connection, type Edge, type Node, useEdgesState, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Autosave, IndexedDbDraftDatabase, recoverDraft, type SaveStatus } from "./drafts.js";
import { exportArtifacts, exportBackup, importBackup, importRuntime } from "./io.js";
import type { Draft } from "./model.js";
import { applyEdges, END_NODE_ID, ENTRY_NODE_ID, graphEdges, pruneEdges, validateConnection } from "./canvas/graph.js";
import { nodeTypes } from "./canvas/nodes.js";
import { changePhaseKind, renamePhase, type Phase, type PhaseKind } from "./inspector/model.js";
import { Inspector } from "./inspector/Inspector.js";
import { SessionHistory } from "./inspector/history.js";
import "./style.css";

const download = (name: string, value: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
};

export function App() {
  const db = useMemo(() => new IndexedDbDraftDatabase(), []);
  const autosave = useMemo(() => new Autosave(db), [db]);
  const [recent, setRecent] = useState<Draft[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string>();
  type HistoryState = { draft: Draft; edges: Edge[] };
  const history = useRef<SessionHistory<HistoryState>>();

  useEffect(() => void db.list().then(setRecent), [db]);
  useEffect(() => {
    if (!draft) return;
    const layout = new Map(draft.document.nodes.map((node) => [node.id, node]));
    const phaseNodes: Node[] = draft.project.scenario.phases.map((phase, index) => ({ id: phase.id, type: "phase", position: layout.get(phase.id) ?? { x: 360 + (index % 3) * 300, y: 80 + Math.floor(index / 3) * 220 }, data: { label: phase.kind === "position-question" ? phase.text : phase.id, kind: phase.kind, outcome: phase.kind === "position-question" && phase.next.type === "quadrant-plurality" } }));
    setNodes([{ id: ENTRY_NODE_ID, type: "entry", position: layout.get(ENTRY_NODE_ID) ?? { x: 30, y: 80 }, data: {} }, ...phaseNodes, { id: END_NODE_ID, type: "end", position: layout.get(END_NODE_ID) ?? { x: 1250, y: 500 }, data: {} }]);
    setEdges(graphEdges(draft.project));
  }, [draft?.id, setEdges, setNodes]);

  const save = (next: Draft) => {
    setDraft(next);
    autosave.schedule(next, (value) => {
      setStatus(value);
      if (value === "saved") void db.list().then(setRecent);
    });
  };
  const applyHistory = (state: HistoryState) => { setEdges(state.edges); save(state.draft); };
  const record = (nextDraft: Draft, nextEdges = edges) => {
    if (!history.current || history.current.value.draft.id !== nextDraft.id) history.current = new SessionHistory({ draft: draft ?? nextDraft, edges });
    applyHistory(history.current.apply({ draft: nextDraft, edges: nextEdges }));
  };
  const readJson = (file: File) => file.text().then(JSON.parse);
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const parsed = await Promise.all([...files].map(readJson));
      const imported = files.length === 1 ? importBackup(parsed[0]) : importRuntime(parsed[0], parsed[1]);
      history.current = undefined;
      save(imported);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import failed");
    }
  };
  const duplicate = (source: Draft) => save({ ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} copy`, updatedAt: Date.now() });
  const remove = async (source: Draft) => {
    if (!confirm(`Delete “${source.name}”?`)) return;
    await db.delete(source.id);
    if (draft?.id === source.id) setDraft(undefined);
    setRecent(await db.list());
  };
  const persistGraph = (nextEdges: Edge[]) => {
    if (!draft) return;
    let project = draft.project;
    try { project = applyEdges(project, nextEdges); } catch { /* Incomplete wiring remains visible until repaired. */ }
    save({ ...draft, project, document: { ...draft.document, edges: nextEdges }, updatedAt: Date.now() });
  };
  const connect = (connection: Connection) => {
    if (!draft) return;
    const problem = validateConnection(draft.project, edges, connection);
    if (problem) return void alert(problem);
    const next = addEdge({ ...connection, id: `${connection.source}:${connection.sourceHandle ?? "next"}` }, edges);
    setEdges(next);
    persistGraph(next);
  };
  const addPhase = (kind: "idle" | "video" | "position-question") => {
    if (!draft) return;
    if (kind === "idle" && draft.project.scenario.phases.some((phase) => phase.kind === "idle")) return void alert("A show already has its idle phase.");
    const id = kind === "idle" ? "idle" : `${kind}-${crypto.randomUUID().slice(0, 6)}`;
    const phase = kind === "idle" ? { kind, id: "idle" as const } : kind === "video"
      ? { kind, id, src: "media/new-video.mp4", expectedDurationMs: 1000, next: "idle" }
      : { kind, id, text: "New position question", xAxis: { minLabel: "Left", maxLabel: "Right" }, yAxis: { minLabel: "Top", maxLabel: "Bottom" }, durationMs: 60000, freezeMs: 5000, connectionStaleAfterMs: 10000, showLiveCounts: true, next: { type: "quadrant-plurality" as const, map: { q1: "idle", q2: "idle", q3: "idle", q4: "idle" }, tie: "idle", empty: "idle", countedStatuses: ["valid", "stale", "disconnected"] as const } };
    const phases = [...draft.project.scenario.phases, phase] as Draft["project"]["scenario"]["phases"];
    save({ ...draft, project: { ...draft.project, scenario: { ...draft.project.scenario, phases } }, updatedAt: Date.now() });
    setNodes((current) => [...current, { id, type: "phase", position: { x: 400, y: 200 }, data: { label: kind === "position-question" ? phase.text : id, kind } }]);
    if (kind !== "idle") setEdges((current) => [...current, { id: `${id}:next`, source: id, sourceHandle: "next", target: END_NODE_ID }]);
  };
  const updatePhase = (nextPhase: Phase) => {
    if (!draft) return;
    const phases = draft.project.scenario.phases.map((phase) => phase.id === nextPhase.id ? nextPhase : phase) as Draft["project"]["scenario"]["phases"];
    record({ ...draft, project: { ...draft.project, scenario: { ...draft.project.scenario, phases } }, updatedAt: Date.now() });
    setNodes((current) => current.map((node) => node.id === nextPhase.id ? { ...node, data: { ...node.data, label: nextPhase.kind === "position-question" ? nextPhase.text : nextPhase.id, kind: nextPhase.kind, outcome: nextPhase.kind === "position-question" && nextPhase.next.type === "quadrant-plurality" } } : node));
  };
  const renameSelected = (nextId: string) => {
    if (!draft || !selectedId) return;
    const project = renamePhase(draft.project, selectedId, nextId);
    const nextEdges = edges.map((edge) => ({ ...edge, id: edge.id.replace(`${selectedId}:`, `${nextId}:`), source: edge.source === selectedId ? nextId : edge.source, target: edge.target === selectedId ? nextId : edge.target }));
    record({ ...draft, project, document: { ...draft.document, nodes: draft.document.nodes.map((node) => node.id === selectedId ? { ...node, id: nextId } : node), edges: nextEdges }, updatedAt: Date.now() }, nextEdges);
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, id: nextId, data: { ...node.data, label: nextId } } : node));
    setSelectedId(nextId);
  };
  const changeSelectedKind = (kind: PhaseKind) => {
    if (!draft || !selectedId) return;
    const phase = draft.project.scenario.phases.find((item) => item.id === selectedId);
    if (!phase || phase.kind === kind) return;
    if (!confirm("Changing phase type replaces its fields and connections. You can undo this change.")) return;
    const nextPhase = changePhaseKind(phase, kind);
    const retained = edges.filter((edge) => edge.source !== selectedId);
    const nextEdges = kind === "idle" ? retained : [...retained, { id: `${nextPhase.id}:next`, source: nextPhase.id, sourceHandle: "next", target: END_NODE_ID }];
    const phases = draft.project.scenario.phases.map((item) => item.id === selectedId ? nextPhase : item) as Draft["project"]["scenario"]["phases"];
    record({ ...draft, project: { ...draft.project, scenario: { ...draft.project.scenario, phases } }, document: { ...draft.document, edges: nextEdges }, updatedAt: Date.now() }, nextEdges);
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { label: nextPhase.kind === "position-question" ? nextPhase.text : nextPhase.id, kind: nextPhase.kind, outcome: nextPhase.kind === "position-question" && nextPhase.next.type === "quadrant-plurality" } } : node));
  };
  const changeTransition = (kind: "fixed" | "quadrant-plurality") => {
    if (!draft || !selectedId) return;
    const phase = draft.project.scenario.phases.find((item) => item.id === selectedId);
    if (!phase || phase.kind !== "position-question" || phase.next.type === kind) return;
    if (!confirm("Changing the transition rule replaces this phase’s connections. You can undo this change.")) return;
    const next = kind === "fixed"
      ? { type: "fixed" as const, target: "idle" }
      : { type: "quadrant-plurality" as const, map: { q1: "idle", q2: "idle", q3: "idle", q4: "idle" }, tie: "idle", empty: "idle", countedStatuses: ["valid", "stale", "disconnected"] as ["valid", "stale", "disconnected"] };
    const nextPhase: Phase = { ...phase, next };
    const retained = edges.filter((edge) => edge.source !== selectedId);
    const handles = kind === "fixed" ? ["next"] : ["q1", "q2", "q3", "q4", "tie", "empty"];
    const nextEdges = [...retained, ...handles.map((handle) => ({ id: `${selectedId}:${handle}`, source: selectedId, sourceHandle: handle, target: END_NODE_ID }))];
    const phases = draft.project.scenario.phases.map((item) => item.id === selectedId ? nextPhase : item) as Draft["project"]["scenario"]["phases"];
    record({ ...draft, project: { ...draft.project, scenario: { ...draft.project.scenario, phases } }, document: { ...draft.document, edges: nextEdges }, updatedAt: Date.now() }, nextEdges);
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, outcome: kind === "quadrant-plurality" } } : node));
  };

  if (!draft) return <main className="home"><h1>Show Studio</h1><p>Create and safely round-trip Smartphonecracy shows.</p>
    <label className="button">Import show or backup<input hidden multiple type="file" accept="application/json" onChange={(event) => void importFiles(event.target.files)} /></label>
    <h2>Recent drafts</h2>{recent.length === 0 && <p>No local drafts yet. Import scenario.json and media-manifest.json together.</p>}
    {recent.map((item) => <article key={item.id}><button onClick={() => void recoverDraft(db, item.id).then(setDraft)}>{item.name}</button><small>{new Date(item.updatedAt).toLocaleString()}</small><button onClick={() => duplicate(item)}>Duplicate</button><button onClick={() => download(`${item.name}.studio-backup.json`, exportBackup(item))}>Export backup</button><button onClick={() => void remove(item)}>Delete</button></article>)}</main>;

  return <main className="editor"><header><button onClick={() => setDraft(undefined)}>Projects</button><input aria-label="Show name" value={draft.name} onChange={(event) => save({ ...draft, name: event.target.value, updatedAt: Date.now() })} /><span className={`status ${status}`}>{status}</span><button disabled={!history.current?.canUndo} onClick={() => { if (history.current) applyHistory(history.current.undo()); }}>Undo</button><button disabled={!history.current?.canRedo} onClick={() => { if (history.current) applyHistory(history.current.redo()); }}>Redo</button><button onClick={() => {
    const current = { ...draft, document: { ...draft.document, nodes: nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })) }, updatedAt: Date.now() };
    save(current);
  }}>Save layout</button><button onClick={() => Object.entries(exportArtifacts(draft)).forEach(([name, value]) => download(name, value))}>Export files</button><button onClick={() => download(`${draft.name}.studio-backup.json`, exportBackup(draft))}>Backup</button></header>
    <aside className="palette" aria-label="Node palette"><strong>Add node</strong><button onClick={() => addPhase("idle")}>Idle</button><button onClick={() => addPhase("video")}>Video</button><button onClick={() => addPhase("position-question")}>Position question</button></aside>
    <section className="canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelectedId(node.id)} onConnect={connect} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onEdgesDelete={(deleted) => { const ids = new Set(deleted.map((edge) => edge.id)); const next = edges.filter((edge) => !ids.has(edge.id)); setEdges(next); persistGraph(next); }} onNodesDelete={(deleted) => { const removed = new Set(deleted.map((node) => node.id)); const nodeIds = new Set(nodes.filter((node) => !removed.has(node.id)).map((node) => node.id)); const nextEdges = pruneEdges(edges, nodeIds); setEdges(nextEdges); const phases = draft.project.scenario.phases.filter((phase) => !removed.has(phase.id)) as Draft["project"]["scenario"]["phases"]; save({ ...draft, project: { ...draft.project, scenario: { ...draft.project.scenario, phases } }, document: { ...draft.document, edges: nextEdges }, updatedAt: Date.now() }); }} fitView onMoveEnd={(_, viewport) => save({ ...draft, document: { ...draft.document, viewport }, updatedAt: Date.now() })}><Background /></ReactFlow></section>
    <Inspector project={draft.project} selectedId={selectedId} onRename={renameSelected} onChange={updatePhase} onKindChange={changeSelectedKind} onTransitionChange={changeTransition} /></main>;
}
