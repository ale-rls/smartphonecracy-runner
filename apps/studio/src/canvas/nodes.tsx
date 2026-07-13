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
  ["q1", "q1 winner", "quad"], ["q2", "q2 winner", "quad"], ["q3", "q3 winner", "quad"], ["q4", "q4 winner", "quad"],
  ["tie", "tie", "special"], ["empty", "no votes", "special"],
];

export function PhaseNode({ data }: NodeProps) {
  const value = data as NodeData;
  return (
    <div className={`studio-node kind-${value.kind}`}>
      <div className="node-head">{KIND_TITLE[value.kind] ?? value.kind}</div>
      <div className="node-body">
        <InPort />
        <div className="node-title">{value.label}</div>
        {value.outcome
          ? <div className="ports-out"><span className="ports-hint">Route each result →</span>{OUTCOMES.map(([id, label, tone]) => <OutPort key={id} id={id} label={label} tone={tone} />)}</div>
          : value.kind !== "idle" && <div className="ports-out"><OutPort id="next" label="next" /></div>}
      </div>
    </div>
  );
}

export function EntryNode() {
  return <div className="studio-node marker kind-entry"><div className="node-head">Entry</div><div className="node-body"><div className="ports-out"><OutPort id="next" label="start" /></div></div></div>;
}
export function EndNode() {
  return <div className="studio-node marker kind-end"><div className="node-head">End</div><div className="node-body"><InPort /><div className="node-title">compiles to idle</div></div></div>;
}

export const nodeTypes = { phase: PhaseNode, entry: EntryNode, end: EndNode };
