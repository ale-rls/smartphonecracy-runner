import { Handle, Position, type NodeProps } from "@xyflow/react";

type NodeData = { label: string; kind: string; outcome?: boolean };

const Input = () => <span className="node-input"><Handle id="input" type="target" position={Position.Left} /><small>in</small></span>;
const Output = ({ id, label, position }: { id: string; label: string; position?: Position }) => <span className={`node-output output-${id}`}><small>{label}</small><Handle id={id} type="source" position={position ?? Position.Right} /></span>;

export function PhaseNode({ data }: NodeProps) {
  const value = data as NodeData;
  return <div className={`studio-node ${value.kind}`}><Input /><strong>{value.label}</strong><small>{value.kind}</small>
    {value.outcome ? <div className="quadrant-outputs"><Output id="q2" label="q2 · top left" position={Position.Top} /><Output id="q1" label="q1 · top right" position={Position.Top} /><Output id="q3" label="q3 · bottom left" position={Position.Bottom} /><Output id="q4" label="q4 · bottom right / center" position={Position.Bottom} /><Output id="tie" label="tie" /><Output id="empty" label="empty" /></div> : value.kind !== "idle" && <Output id="next" label="next" />}
  </div>;
}

export function EntryNode() { return <div className="studio-node marker"><strong>Entry</strong><Output id="next" label="start" /></div>; }
export function EndNode() { return <div className="studio-node marker"><Input /><strong>End</strong><small>compiles to idle</small></div>; }

export const nodeTypes = { phase: PhaseNode, entry: EntryNode, end: EndNode };
