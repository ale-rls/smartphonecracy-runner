import { describe, expect, it } from 'vitest';
import { parseSubtitles } from './subtitles.js';
import { videoPhaseSchema } from './schema.js';

describe('subtitle import', () => {
  it('imports BOM, CRLF, multiline SRT and strips markup safely', () => {
    expect(parseSubtitles('\uFEFF1\r\n00:00:01,000 --> 00:00:02,000\r\n<b>Hello</b> &amp;\r\nworld', 'scene.srt', 3000)).toEqual([{ startAtMs: 1000, endAtMs: 2000, text: 'Hello &\nworld' }]);
  });
  it('imports WebVTT identifiers, settings and overlapping cues, ignoring file CSS', () => {
    const cues = parseSubtitles('WEBVTT\n\nSTYLE\n::cue { color: red }\n\nNOTE author\ncomment\n\none\n00:01.000 --> 00:03.000 align:start\nHello\n\n00:02.000 --> 00:04.000\nWorld', 'scene.vtt', 5000);
    expect(cues).toHaveLength(2);
    expect(cues[1]?.startAtMs).toBe(2000);
  });
  it.each([
    ['1\n00:00:02,000 --> 00:00:01,000\nBad', 'x.srt'],
    ['1\n00:00:00,000 --> 00:00:10,000\nToo long', 'x.srt'],
    ['1\n00:61:00,000 --> 00:62:00,000\nBad', 'x.srt'],
    ['WEBVTT', 'x.vtt'], ['broken', 'x.vtt'], ['bad', 'x.exe'],
  ])('rejects invalid files without partial import', (source, file) => {
    expect(() => parseSubtitles(source, file, 5000)).toThrow();
  });
  it('preserves validated design and rejects unsafe styles', () => {
    const phase = { kind: 'video', id: 'intro', src: 'intro.mp4', expectedDurationMs: 5000, next: 'idle', subtitleStyle: { color: '#ffffff', fontSize: 3 } };
    expect(videoPhaseSchema.parse(phase).subtitleStyle).toEqual(phase.subtitleStyle);
    expect(videoPhaseSchema.safeParse({ ...phase, subtitleStyle: { color: 'url(bad)' } }).success).toBe(false);
  });
});
