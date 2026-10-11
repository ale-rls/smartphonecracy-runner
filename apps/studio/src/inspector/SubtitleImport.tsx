import { useRef, useState } from 'react';
import { parseSubtitles } from '../../../../packages/scenario/src/subtitles.js';
import type { Phase } from './model.js';

type MediaPhase = Extract<Phase, { kind: 'video' | 'video-position-question' }>;
export function SubtitleImport({ phase, onChange }: { phase: MediaPhase; onChange: (phase: Phase) => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(phase);
  latest.current = phase;
  const style = phase.subtitleStyle ?? {};
  const update = (patch: Partial<NonNullable<MediaPhase['subtitleStyle']>>) => onChange({ ...phase, subtitleStyle: { ...style, ...patch } });
  return <>
    <p className="sc-tool-copy field-hint">Import UTF-8 SRT or WebVTT for this scene. Times start at zero for this phase, including scenes cut from a continuous film. Import replaces existing cues; file styling is replaced by the controls below. Cues are saved inside this show.</p>
    <label className="sc-tool-label">Upload subtitles<input type="file" accept=".srt,.vtt" disabled={busy} onChange={async (event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      setBusy(true);
      try {
        if (file.size > 1_000_000) throw new Error('Subtitle files must be under 1 MB.');
        const source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
        const subtitles = parseSubtitles(source, file.name, phase.expectedDurationMs);
        if (latest.current !== phase) throw new Error('The scene changed during import. Please select the file again.');
        onChange({ ...phase, subtitles });
        setMessage(`Imported ${subtitles.length} cues from ${file.name}.`);
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed.'); }
      finally { setBusy(false); }
    }} /></label>
    {message && <p role="status">{message}</p>}
    <label className="sc-tool-label">Text color<input type="color" value={style.color ?? '#ffffff'} onChange={(e) => update({ color: e.target.value })} /></label>
    <label className="sc-tool-label">Background color<input type="color" value={style.background ?? '#000000'} onChange={(e) => update({ background: e.target.value })} /></label>
    <label className="sc-tool-label">Background opacity<input type="range" min="0" max="1" step="0.01" value={style.backgroundOpacity ?? .72} onChange={(e) => update({ backgroundOpacity: Number(e.target.value) })} /></label>
    <label className="sc-tool-label">Font size (% of screen width)<input type="range" min="1" max="6" step="0.1" value={style.fontSize ?? 2.2} onChange={(e) => update({ fontSize: Number(e.target.value) })} /></label>
    <label className="sc-tool-label">Distance from bottom (%)<input type="range" min="0" max="80" step="1" value={style.bottomPercent ?? 7} onChange={(e) => update({ bottomPercent: Number(e.target.value) })} /></label>
    <label className="sc-tool-label">Text alignment<select value={style.textAlign ?? 'center'} onChange={(e) => update({ textAlign: e.target.value as 'left' | 'center' | 'right' })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <button type="button" className="sc-tool-button" onClick={() => onChange({ ...phase, subtitleStyle: undefined })}>Reset subtitle design</button>
  </>;
}
