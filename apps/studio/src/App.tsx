import { useEffect, useMemo, useState } from "react";
import { Background, ReactFlow, type Edge, type Node, useEdgesState, useNodesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Autosave, IndexedDbDraftDatabase, recoverDraft, type SaveStatus } from "./drafts.js";
import { exportArtifacts, exportBackup, importBackup, importRuntime } from "./io.js";
import type { Draft } from "./model.js";
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

  useEffect(() => void db.list().then(setRecent), [db]);
  useEffect(() => {
    if (!draft) return;
    setNodes(draft.document.nodes.map((node) => ({ id: node.id, position: { x: node.x, y: node.y }, data: { label: node.id } })));
    setEdges(draft.document.edges);
  }, [draft?.id, setEdges, setNodes]);

  const save = (next: Draft) => {
    setDraft(next);
    autosave.schedule(next, (value) => {
      setStatus(value);
      if (value === "saved") void db.list().then(setRecent);
    });
  };
  const readJson = (file: File) => file.text().then(JSON.parse);
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const parsed = await Promise.all([...files].map(readJson));
      save(files.length === 1 ? importBackup(parsed[0]) : importRuntime(parsed[0], parsed[1]));
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

  if (!draft) return <main className="home"><h1>Show Studio</h1><p>Create and safely round-trip Smartphonecracy shows.</p>
    <label className="button">Import show or backup<input hidden multiple type="file" accept="application/json" onChange={(event) => void importFiles(event.target.files)} /></label>
    <h2>Recent drafts</h2>{recent.length === 0 && <p>No local drafts yet. Import scenario.json and media-manifest.json together.</p>}
    {recent.map((item) => <article key={item.id}><button onClick={() => void recoverDraft(db, item.id).then(setDraft)}>{item.name}</button><small>{new Date(item.updatedAt).toLocaleString()}</small><button onClick={() => duplicate(item)}>Duplicate</button><button onClick={() => download(`${item.name}.studio-backup.json`, exportBackup(item))}>Export backup</button><button onClick={() => void remove(item)}>Delete</button></article>)}</main>;

  return <main className="editor"><header><button onClick={() => setDraft(undefined)}>Projects</button><input aria-label="Show name" value={draft.name} onChange={(event) => save({ ...draft, name: event.target.value, updatedAt: Date.now() })} /><span className={`status ${status}`}>{status}</span><button onClick={() => {
    const current = { ...draft, document: { ...draft.document, nodes: nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })) }, updatedAt: Date.now() };
    save(current);
  }}>Save layout</button><button onClick={() => Object.entries(exportArtifacts(draft)).forEach(([name, value]) => download(name, value))}>Export files</button><button onClick={() => download(`${draft.name}.studio-backup.json`, exportBackup(draft))}>Backup</button></header>
    <section className="canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView onMoveEnd={(_, viewport) => save({ ...draft, document: { ...draft.document, viewport }, updatedAt: Date.now() })}><Background /></ReactFlow></section></main>;
}
