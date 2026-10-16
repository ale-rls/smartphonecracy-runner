import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenarioSchema } from '@smartphonecracy/scenario';
import { parseSubtitles } from '../../../packages/scenario/src/subtitles.js';

const scenario = scenarioSchema.parse(JSON.parse(readFileSync(new URL('../../../content/scenarios/venue.json', import.meta.url), 'utf8')));
describe('venue subtitles', () => {
  it('keeps every delivered cue in the appropriate phase, including boundary crossings', () => {
    for (const phase of scenario.phases) {
      if ((phase.kind !== 'video' && phase.kind !== 'video-position-question') || phase.id === 'credits') continue;
      const filename = phase.src.replace(/\.mp4$/, '.srt');
      const cues = parseSubtitles(readFileSync(new URL(`../../../content/subtitles/venue/${filename}`, import.meta.url), 'utf8'), filename, Number.MAX_SAFE_INTEGER);
      const start = phase.timeline?.startMs ?? 0;
      const expected = cues.filter(cue => cue.startAtMs < start + phase.expectedDurationMs && cue.endAtMs > start).map(cue => ({ ...cue, startAtMs: Math.max(0, Math.ceil(cue.startAtMs - start)), endAtMs: Math.floor(Math.min(phase.expectedDurationMs, cue.endAtMs - start)) })).filter(cue => cue.startAtMs < cue.endAtMs);
      expect(phase.subtitles, phase.id).toEqual(expected);
    }
  });
  it('places all ten question translations below the matching burned-in heading', () => {
    const questions = scenario.phases.filter(p => p.id.startsWith('2-6-'));
    expect(questions).toHaveLength(10);
    for (const phase of questions) {
      if (phase.kind !== 'video-position-question') throw new Error('Expected media question');
      expect(phase.textBurnedIn).toBe(true);
      expect(phase.subtitles).toHaveLength(1);
      expect(phase.subtitleStyle?.topPercent).toBe(['2-6-04-demokratie-in-50-jahren', '2-6-07-politisches-system', '2-6-08-politisches-klima'].includes(phase.id) ? 12.8 : 7.8);
    }
  });
});
