export class SessionHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private current: T, private readonly clone: (value: T) => T = (value) => structuredClone(value)) {}
  get value() { return this.current; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  apply(next: T) { this.past.push(this.clone(this.current)); this.current = this.clone(next); this.future = []; return this.value; }
  undo() { const value = this.past.pop(); if (!value) return this.value; this.future.push(this.clone(this.current)); this.current = value; return this.value; }
  redo() { const value = this.future.pop(); if (!value) return this.value; this.past.push(this.clone(this.current)); this.current = value; return this.value; }
}
