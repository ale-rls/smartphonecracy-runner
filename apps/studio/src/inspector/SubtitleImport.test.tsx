// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SubtitleImport } from './SubtitleImport.js';

it('associates an import with the selected phase and preserves cues on failure', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const onChange = vi.fn();
  const phase = { kind: 'video' as const, id: 'scene', src: 'scene.mp4', expectedDurationMs: 5000, next: 'idle', subtitles: [{ text: 'Old', startAtMs: 0, endAtMs: 1000 }] };
  try {
    await act(async () => root.render(<SubtitleImport phase={phase} onChange={onChange} />));
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
    const upload = async (source: string) => {
      Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'scene.srt', size: source.length, arrayBuffer: async () => new TextEncoder().encode(source).buffer }] });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    };
    await upload('1\n00:00:01,000 --> 00:00:02,000\nImported');
    expect(onChange).toHaveBeenCalledWith({ ...phase, subtitles: [{ text: 'Imported', startAtMs: 1000, endAtMs: 2000 }] });
    onChange.mockClear();
    await upload('invalid');
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Invalid timing');
  } finally { await act(async () => root.unmount()); }
});
