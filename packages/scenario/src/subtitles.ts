import type { Subtitle } from './schema.js';

/** Import plain-text SRT/WebVTT. Styling is controlled by the show, never file CSS. */
export function parseSubtitles(source: string, filename: string, durationMs: number): Subtitle[] {
  if (!/\.(srt|vtt)$/i.test(filename)) throw new Error('Choose an .srt or .vtt file.');
  if (new TextEncoder().encode(source).length > 1_000_000) throw new Error('Subtitle files must be under 1 MB.');
  const vtt = /\.vtt$/i.test(filename);
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const blocks = normalized.split(/\n[\t ]*\n/);
  if (vtt && !/^WEBVTT(?:[\t ].*)?(?:\n|$)/.test(blocks.shift() ?? '')) throw new Error('Missing WEBVTT header.');
  const timestamp = (value: string): number => {
    const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
    if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error(`Invalid timestamp: ${value}`);
    return ((Number(match[1] ?? 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  };
  const cues: Subtitle[] = [];
  for (const block of blocks) {
    if (vtt && /^(NOTE(?:[\t \n]|$)|STYLE(?:\n|$)|REGION(?:\n|$))/.test(block)) continue;
    const lines = block.split('\n');
    if (!lines[0]?.includes('-->')) lines.shift();
    const timing = /^(\S+)\s+-->\s+(\S+)(?:[\t ].*)?$/.exec(lines.shift() ?? '');
    if (!timing) throw new Error(`Invalid timing in cue ${cues.length + 1}.`);
    const startAtMs = timestamp(timing[1]!);
    const endAtMs = timestamp(timing[2]!);
    const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: '\u00a0', lrm: '\u200e', rlm: '\u200f', quot: '"', apos: "'" };
    const text = lines.join('\n').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|nbsp|lrm|rlm|quot|apos);/g, (_, name: string) => entities[name]!).trim();
    if (!text || startAtMs >= endAtMs || endAtMs > durationMs) throw new Error(`Cue ${cues.length + 1} must have text and fit within the phase duration.`);
    cues.push({ text, startAtMs, endAtMs });
    if (cues.length > 5000) throw new Error('At most 5,000 subtitle cues are supported.');
  }
  if (!cues.length) throw new Error('No subtitle cues found.');
  return cues.sort((a, b) => a.startAtMs - b.startAtMs);
}
