/** Rebuild phase-local subtitles from the delivered, full-film UTF-8 SRT tracks. */
import { readFile, writeFile } from 'node:fs/promises';
import { parseSubtitles } from '../packages/scenario/src/subtitles.js';
import { scenarioSchema, type Scenario } from '../packages/scenario/src/schema.js';

const path = 'content/scenarios/venue.json';
const scenario: Scenario = JSON.parse(await readFile(path, 'utf8'));
scenarioSchema.parse(scenario);
const questionStyle = { fontSize: 1.9, fontFamily: 'show' as const, backgroundOpacity: 0, topPercent: 7.8 };
const dialogueStyle = { fontSize: 1.85, fontFamily: 'show' as const, backgroundOpacity: .82, bottomPercent: 1.2 };
// These headings occupy two lines in the supplied 1920×1080 film.
const twoLineQuestions = new Set(['2-6-04-demokratie-in-50-jahren', '2-6-07-politisches-system', '2-6-08-politisches-klima']);
let count = 0;
for (const phase of scenario.phases) {
  if (phase.kind !== 'video' && phase.kind !== 'video-position-question') continue;
  if (phase.id === 'credits') continue;
  const filename = phase.src.replace(/\.mp4$/i, '.srt');
  const source = await readFile(`content/subtitles/venue/${filename}`, 'utf8');
  const cues = parseSubtitles(source, filename, Number.MAX_SAFE_INTEGER);
  const start = phase.timeline?.startMs ?? 0;
  const end = start + phase.expectedDurationMs;
  phase.subtitles = cues.filter(cue => cue.startAtMs < end && cue.endAtMs > start).map(cue => ({
    ...cue,
    startAtMs: Math.max(0, Math.ceil(cue.startAtMs - start)),
    endAtMs: Math.floor(Math.min(phase.expectedDurationMs, cue.endAtMs - start)),
  })).filter(cue => cue.endAtMs > cue.startAtMs);
  phase.subtitleStyle = phase.id.startsWith('2-6-')
    ? { ...questionStyle, topPercent: twoLineQuestions.has(phase.id) ? 12.8 : 7.8 }
    : dialogueStyle;
  count += phase.subtitles.length;
}
scenarioSchema.parse(scenario);
await writeFile(path, JSON.stringify(scenario, null, 2) + '\n');
console.log(`Imported ${count} phase-local cues into ${path}.`);
