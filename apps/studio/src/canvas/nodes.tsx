import { Handle, Position, type NodeProps } from "@xyflow/react";

type NodeData = { label: string; kind: string; outcome?: boolean };

const KIND_TITLE: Record<string, string> = { idle: "Idle", video: "Video", "position-question": "Question" };

const InPort = () => (
  <div className="port port-in"><Handle id="input" type="target" position={Position.Left} /><span className="port-name">in</span></div>
);
const OutPort = ({ id, label, tone }: { id: string; label: string; tone?: "quad" | "special" }) => (
  <div className={`port port-out ${tone ?? ""}`}><span className="port-name">{label}</span><Handle id={id} type="source" position={Position.Right} /></div>
);

const OUTCOMES: readonly [string, string, "quad" | "special"][] = [
  ["q1", "q1", "quad"], ["q2", "q2", "quad"], ["q3", "q3", "quad"], ["q4", "q4", "quad"],
  ["tie", "tie", "special"], ["empty", "no votes", "special"],
];

export function PhaseNode({ data }: NodeProps) {
  const value = data as NodeData;
  const outputs = value.outcome
    ? OUTCOMES.map(([id, label, tone]) => <OutPort key={id} id={id} label={label} tone={tone} />)
    : value.kind !== "idle" ? [<OutPort key="next" id="next" label="next" />] : [];
  return (
    <div className={`studio-node kind-${value.kind}`}>
      <div className="node-head">{KIND_TITLE[value.kind] ?? value.kind}</div>
      <div className="node-body"><div className="node-title">{value.label}</div></div>
      <div className="node-io">
        <InPort />
        {outputs.length > 0 && <div className="ports-out">{outputs}</div>}
      </div>
    </div>
  );
}

export function EntryNode() {
  return <div className="studio-node marker kind-entry"><div className="node-head">Entry</div><div className="node-io"><div className="ports-out"><OutPort id="next" label="start" /></div></div></div>;
}
export function EndNode() {
  return <div className="studio-node marker kind-end"><div className="node-head">End</div><div className="node-body"><div className="node-title muted">returns to idle / attract</div></div><div className="node-io"><InPort /></div></div>;
}

export const nodeTypes = { phase: PhaseNode, entry: EntryNode, end: EndNode };
