import { useEffect, useRef, useState } from "react";

export type MenuItem =
  | { separator: true }
  | { separator?: false; label: string; onSelect: () => void; disabled?: boolean };

/** Minimal desktop-style dropdown menu: click to open, closes on select,
 *  outside click, or Escape. No external dependency. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{label}</button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((item, index) => item.separator
            ? <div key={index} className="menu-sep" role="separator" />
            : <button key={index} role="menuitem" className="menu-item" disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>)}
        </div>
      )}
    </div>
  );
}
