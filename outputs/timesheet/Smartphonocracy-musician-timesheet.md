# Smartphonocracy · Musician’s timesheet

Source: **Smartphonocracy Week 2 Friday - Final 2.studio-backup.json**. Times are elapsed **MM:SS.mmm**, with **00:00.000 = start of Athene (2.0)**. Pre-show / idle is not timed in this backup.

**Timing basis:** exact arithmetic from the saved expected media durations, with the full configured end-of-video holds added. This is the intended schedule, not verified playback timecode: the backup contains no media or recorded performance timestamps. No frame rate is specified, so these are milliseconds, not SMPTE frames. Actual playback, operator actions and loading can shift cues.

**Runner discrepancy:** the current workspace runner advances at expected duration + 5 seconds if no completion arrives. It does not add the configured hold to that deadline. Assuming actual media durations match the saved values, this truncates the election’s 15-second hold to about 5 seconds and the credits’ 60-second hold to about 5 seconds. Use the separate runner projection below if running this code unchanged. The deployed runner has not been checked.

## Full intended schedule

| In | Media ends | Next stage / hold ends | Stage | Media duration | Hold |
|---|---|---|---|---|---|
| 00:00.000 | 02:18.125 | 02:18.125 | 2.0 · Athene / welcome | 02:18.125 | 00:00.000 |
| 02:18.125 | 02:58.209 | 02:58.209 | 2.1 · Fangt mich! / Chase me | 00:40.084 | 00:00.000 |
| 02:58.209 | 03:45.209 | 03:45.209 | 2.2 · Füttert mich! / Feed me | 00:47.000 | 00:00.000 |
| 03:45.209 | 05:38.668 | 05:38.668 | OSTRAKISMÓS | 01:53.459 | 00:00.000 |
| 05:38.668 | 07:14.293 | 07:14.293 | PROMETHEUS-ABGABE | 01:35.625 | 00:00.000 |
| 07:14.293 | 08:52.668 | 08:52.668 | KLĒROTERION | 01:38.375 | 00:00.000 |
| 08:52.668 | 09:22.668 | 09:22.668 | Wo befindest du dich? | 00:30.000 | 00:00.000 |
| 09:22.668 | 09:52.668 | 09:52.668 | Wo wärst du gerne? | 00:30.000 | 00:00.000 |
| 09:52.668 | 10:22.668 | 10:22.668 | Wo befindet sich die westliche Demokratie? | 00:30.000 | 00:00.000 |
| 10:22.668 | 10:52.668 | 10:52.668 | Wo befindet sich die westliche Demokratie in 50 Jahren? | 00:30.000 | 00:00.000 |
| 10:52.668 | 11:22.668 | 11:22.668 | Wo positionierst du deine politische Aktivität? | 00:30.000 | 00:00.000 |
| 11:22.668 | 11:52.668 | 11:52.668 | Wie politisch aktiv wärst du gerne? | 00:30.000 | 00:00.000 |
| 11:52.668 | 12:22.668 | 12:22.668 | Wo positionierst du dich im bestehenden politischen System? | 00:30.000 | 00:00.000 |
| 12:22.668 | 12:52.668 | 12:52.668 | Wie empfindest du das aktuelle politische Klima? | 00:30.000 | 00:00.000 |
| 12:52.668 | 13:22.668 | 13:22.668 | Wo verortest du dich ökonomisch? | 00:30.000 | 00:00.000 |
| 13:22.668 | 13:52.668 | 13:52.668 | Wie KI-fiziert bist du persönlich? | 00:30.000 | 00:00.000 |
| 13:52.668 | 14:17.710 | 14:17.710 | 2.7 · Abmoderation | 00:25.042 | 00:00.000 |
| 14:17.710 | 14:41.710 | 14:41.710 | 3.0 · Wahlkampf-Auftakt | 00:24.000 | 00:00.000 |
| 14:41.710 | 14:57.527 | 14:57.527 | Title · OpenApollo | 00:15.817 | 00:00.000 |
| 14:57.527 | 16:38.527 | 16:38.527 | 3.1 · OpenApollo speech | 01:41.000 | 00:00.000 |
| 16:38.527 | 16:54.344 | 16:54.344 | Title · Dionysos69 | 00:15.817 | 00:00.000 |
| 16:54.344 | 18:28.344 | 18:28.344 | 3.2 · Dionysos69 speech | 01:34.000 | 00:00.000 |
| 18:28.344 | 18:44.736 | 18:44.736 | Title · Kassandra | 00:16.392 | 00:00.000 |
| 18:44.736 | 20:33.736 | 20:33.736 | 3.3 · Kassandra speech | 01:49.000 | 00:00.000 |
| 20:33.736 | 21:16.403 | 21:31.403 | 4.0 · Wahl / election | 00:42.667 | 00:15.000 |

## Alternative endings — play only the elected winner

| Winner | Winner starts | Winner media ends | Credits start (after 1 s hold) | Credits media ends | Return to idle (after 60 s hold) |
|---|---|---|---|---|---|
| 4.1 · Apollo wins | 21:31.403 | 23:17.320 | 23:18.320 | 27:58.800 | 28:58.800 |
| 4.2 · Dionysos wins | 21:31.403 | 23:12.778 | 23:13.778 | 27:54.258 | 28:54.258 |
| 4.3 · Kassandra wins | 21:31.403 | 23:24.737 | 23:25.737 | 28:06.217 | 29:06.217 |

Credits media duration: **04:40.480**. Election: **00:42.667 media + 00:15.000 hold**. Each winner film has a **00:01.000 hold**.

The election chooses one branch by audience plurality. A tie uses the configured kleroterion tie-break; the backup also specifies idle as the tie/empty fallback. If election resolution returns idle, winner and credits are skipped. No additional manually timed applause break is specified.

## Current workspace runner projection

Conditional on media lengths equalling the saved expected durations, uninterrupted playback and no manual intervention. Timer scheduling and network delays are excluded. Stages before the election have the same nominal start times as above.

| Winner | Winner starts | Credits start | Credits media ends | Return to idle |
|---|---|---|---|---|
| 4.1 · Apollo wins | 21:21.403 | 23:08.320 | 27:48.800 | 27:53.800 |
| 4.2 · Dionysos wins | 21:21.403 | 23:03.778 | 27:44.258 | 27:49.258 |
| 4.3 · Kassandra wins | 21:21.403 | 23:15.737 | 27:56.217 | 28:01.217 |

## Internal cues — intended schedule

Local offsets are measured from the start of the named stage. Global cues below use the full intended schedule. “Text” is a saved on-screen subtitle, not a verified spoken or musical cue. Position-question windows use the runner’s stage clock.

| Stage | Cue | Local in → out | Global in → out |
|---|---|---|---|
| 2.1 · Fangt mich! / Chase me | Text: Fangt mich! | 00:00.000 → 00:40.000 | 02:18.125 → 02:58.125 |
| 2.2 · Füttert mich! / Feed me | Text: Füttert mich! | 00:03.000 → 00:20.000 | 03:01.209 → 03:18.209 |
| OSTRAKISMÓS | Question visible | 00:21.000 → 00:45.001 | 04:06.209 → 04:30.210 |
| OSTRAKISMÓS | Audience input open | 00:21.600 → 00:40.001 | 04:06.809 → 04:25.210 |
| OSTRAKISMÓS | Text: Kratze Initialen! | 00:52.000 → 01:04.000 | 04:37.209 → 04:49.209 |
| PROMETHEUS-ABGABE | Question visible | 00:24.100 → 00:48.301 | 06:02.768 → 06:26.969 |
| PROMETHEUS-ABGABE | Audience input open | 00:24.100 → 00:43.001 | 06:02.768 → 06:21.669 |
| PROMETHEUS-ABGABE | Text: Baue Silber ab! | 00:59.000 → 01:07.000 | 06:37.668 → 06:45.668 |
| PROMETHEUS-ABGABE | Text: Drücke den richtigen Knopf! | 01:17.000 → 01:29.000 | 06:55.668 → 07:07.668 |
| KLĒROTERION | Question visible | 00:19.000 → 00:43.201 | 07:33.293 → 07:57.494 |
| KLĒROTERION | Audience input open | 00:19.000 → 00:38.100 | 07:33.293 → 07:52.393 |
| KLĒROTERION | Text: Faites vos jeux - platziere deinen Chip! | 00:58.000 → 01:10.000 | 08:12.293 → 08:24.293 |
| Wo befindest du dich? | Question visible | 00:00.000 → 00:25.000 | 08:52.668 → 09:17.668 |
| Wo befindest du dich? | Audience input open | 00:15.000 → 00:20.000 | 09:07.668 → 09:12.668 |
| Wo befindest du dich? | Closing countdown | 00:15.000 → 00:20.000 | 09:07.668 → 09:12.668 |
| Wo wärst du gerne? | Question visible | 00:00.000 → 00:25.000 | 09:22.668 → 09:47.668 |
| Wo wärst du gerne? | Audience input open | 00:15.000 → 00:20.000 | 09:37.668 → 09:42.668 |
| Wo wärst du gerne? | Closing countdown | 00:15.000 → 00:20.000 | 09:37.668 → 09:42.668 |
| Wo befindet sich die westliche Demokratie? | Question visible | 00:00.000 → 00:25.000 | 09:52.668 → 10:17.668 |
| Wo befindet sich die westliche Demokratie? | Audience input open | 00:15.000 → 00:20.000 | 10:07.668 → 10:12.668 |
| Wo befindet sich die westliche Demokratie? | Closing countdown | 00:15.000 → 00:20.000 | 10:07.668 → 10:12.668 |
| Wo befindet sich die westliche Demokratie in 50 Jahren? | Question visible | 00:00.000 → 00:25.000 | 10:22.668 → 10:47.668 |
| Wo befindet sich die westliche Demokratie in 50 Jahren? | Audience input open | 00:15.000 → 00:20.000 | 10:37.668 → 10:42.668 |
| Wo befindet sich die westliche Demokratie in 50 Jahren? | Closing countdown | 00:15.000 → 00:20.000 | 10:37.668 → 10:42.668 |
| Wo positionierst du deine politische Aktivität? | Question visible | 00:00.000 → 00:25.000 | 10:52.668 → 11:17.668 |
| Wo positionierst du deine politische Aktivität? | Audience input open | 00:15.000 → 00:20.000 | 11:07.668 → 11:12.668 |
| Wo positionierst du deine politische Aktivität? | Closing countdown | 00:15.000 → 00:20.000 | 11:07.668 → 11:12.668 |
| Wie politisch aktiv wärst du gerne? | Question visible | 00:00.000 → 00:25.000 | 11:22.668 → 11:47.668 |
| Wie politisch aktiv wärst du gerne? | Audience input open | 00:15.000 → 00:20.000 | 11:37.668 → 11:42.668 |
| Wie politisch aktiv wärst du gerne? | Closing countdown | 00:15.000 → 00:20.000 | 11:37.668 → 11:42.668 |
| Wo positionierst du dich im bestehenden politischen System? | Question visible | 00:00.000 → 00:25.000 | 11:52.668 → 12:17.668 |
| Wo positionierst du dich im bestehenden politischen System? | Audience input open | 00:15.000 → 00:20.000 | 12:07.668 → 12:12.668 |
| Wo positionierst du dich im bestehenden politischen System? | Closing countdown | 00:15.000 → 00:20.000 | 12:07.668 → 12:12.668 |
| Wie empfindest du das aktuelle politische Klima? | Question visible | 00:00.000 → 00:25.000 | 12:22.668 → 12:47.668 |
| Wie empfindest du das aktuelle politische Klima? | Audience input open | 00:15.000 → 00:20.000 | 12:37.668 → 12:42.668 |
| Wie empfindest du das aktuelle politische Klima? | Closing countdown | 00:15.000 → 00:20.000 | 12:37.668 → 12:42.668 |
| Wo verortest du dich ökonomisch? | Question visible | 00:00.000 → 00:25.000 | 12:52.668 → 13:17.668 |
| Wo verortest du dich ökonomisch? | Audience input open | 00:15.000 → 00:20.000 | 13:07.668 → 13:12.668 |
| Wo verortest du dich ökonomisch? | Closing countdown | 00:15.000 → 00:20.000 | 13:07.668 → 13:12.668 |
| Wie KI-fiziert bist du persönlich? | Question visible | 00:00.000 → 00:25.000 | 13:22.668 → 13:47.668 |
| Wie KI-fiziert bist du persönlich? | Audience input open | 00:15.000 → 00:20.000 | 13:37.668 → 13:42.668 |
| Wie KI-fiziert bist du persönlich? | Closing countdown | 00:15.000 → 00:20.000 | 13:37.668 → 13:42.668 |
| 3.1 · OpenApollo speech | Text: Kämpfen oder Trümmer räumen? | 00:14.500 → 00:26.000 | 15:12.027 → 15:23.527 |
| 3.1 · OpenApollo speech | Text: Bist du oben oder unten? | 00:30.000 → 00:38.000 | 15:27.527 → 15:35.527 |
| 3.1 · OpenApollo speech | Reaction window 1 | 00:46.000 → 01:06.000 | 15:43.527 → 16:03.527 |
| 3.1 · OpenApollo speech | Text: Schreibt mit! | 00:52.000 → 01:00.000 | 15:49.527 → 15:57.527 |
| 3.1 · OpenApollo speech | Text: Füllt das Vakuum! | 01:06.000 → 01:14.000 | 16:03.527 → 16:11.527 |
| 3.1 · OpenApollo speech | Reaction window 2 | 01:37.000 → 01:41.000 | 16:34.527 → 16:38.527 |
| 3.2 · Dionysos69 speech | Text: Bleibst du im Raster oder brichst du aus? | 00:11.000 → 00:19.000 | 17:05.344 → 17:13.344 |
| 3.2 · Dionysos69 speech | Reaction window 1 | 00:22.000 → 00:36.000 | 17:16.344 → 17:30.344 |
| 3.2 · Dionysos69 speech | Text: Weinst du mit? | 00:33.000 → 00:46.000 | 17:27.344 → 17:40.344 |
| 3.2 · Dionysos69 speech | Text: Streichelst du mit? | 01:11.000 → 01:16.000 | 18:05.344 → 18:10.344 |
| 3.2 · Dionysos69 speech | Reaction window 2 | 01:13.000 → 01:24.000 | 18:07.344 → 18:18.344 |
| 3.2 · Dionysos69 speech | Reaction window 3 | 01:31.000 → 01:34.000 | 18:25.344 → 18:28.344 |
| 3.3 · Kassandra speech | Text: Folge dem Wasser! | 00:19.000 → 00:28.000 | 19:03.736 → 19:12.736 |
| 3.3 · Kassandra speech | Text: Räume auf - viele Hände, schnelles Ende... | 00:40.500 → 00:49.000 | 19:25.236 → 19:33.736 |
| 3.3 · Kassandra speech | Reaction window 1 | 00:45.000 → 00:55.000 | 19:29.736 → 19:39.736 |
| 3.3 · Kassandra speech | Text: Stell dich an! | 01:08.000 → 01:18.000 | 19:52.736 → 20:02.736 |
| 3.3 · Kassandra speech | Reaction window 2 | 01:45.000 → 01:49.000 | 20:29.736 → 20:33.736 |
| 4.0 · Wahl / election | Question visible | 00:27.700 → 00:42.600 | 21:01.436 → 21:16.336 |
| 4.0 · Wahl / election | Audience input open | 00:27.700 → 00:37.901 | 21:01.436 → 21:11.637 |
| 4.0 · Wahl / election | Closing countdown | 00:27.901 → 00:37.901 | 21:01.637 → 21:11.637 |

## Source audit

Order was followed through each `next` link from `entryPhaseId`; the JSON array itself is not performance order. All 25 stages before the winner branch, all 3 winner alternatives and credits are included. Idle has no fixed duration. Extra question audio plays within its question stage and adds no separate duration.

Source SHA-256: `979cdf4a2b011252461c0c759c9efc977a6d42b80703c1e855263ab97e729d7e`

Runner references: `apps/display/src/components/PhaseVideo.tsx` (video-ended hold); `apps/server/src/engine/video.ts` (5-second fallback grace); `apps/server/src/engine/phase-engine.ts` (fallback transition). Media filenames and saved durations are listed below for rehearsal verification.

| Phase ID | Media | Expected duration (ms) | Tail (ms) |
|---|---|---|---|
| 2-0-Athene | athene_v5_final_v3_1380.mp4 | 138125 | 0 |
| 2-1-chaseme | 2.1_25v2_D_zweiteiler_v2.mp4 | 40084 | 0 |
| 2-2-chapme | 2.2 - 25v2_FINAL_D_M6.mp4 | 47000 | 0 |
| 2-3-ostrakismos | 2.3_25v3_SCENE.mp4 | 113459 | 0 |
| 2-4-prometheus | 2.4_25v3_SCENE.mp4 | 95625 | 0 |
| 2-5-kleroterion | 2.5_25v3_SCENE.mp4 | 98375 | 0 |
| 2-6-01-wo-befindest-du-dich | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-02-wo-waerst-du-gerne | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-03-westliche-demokratie | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-04-demokratie-in-50-jahren | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-05-politische-aktivitaet | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-06-politisch-aktiv-waerst-du-gerne | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-07-politisches-system | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-08-politisches-klima | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-09-oekonomisch | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-6-10-ki-fiziert | loop_arena_sky_30s_chain_s3-s2_slow_dissolve.mp4 | 30000 | 0 |
| 2-7-abmoderation | 2.7 - 25v2_abmoderation_master-2.mp4 | 25042 | 0 |
| 3-0-wahlkampf-auftakt-video | 3.0 - 25v2_rahmen_turn2_master.mp4 | 24000 | 0 |
| title-apollo | BG_sky_loop_20s_v2.mp4 | 15817 | 0 |
| 3-1-openapollo-rede | 3.1_25_SCENE_longinserts.mp4 | 101000 | 0 |
| title-dionysos | BG_sky_loop_20s_v2.mp4 | 15817 | 0 |
| 3-2-dionysos-rede | 3.2_25_SCENE_longinserts.mp4 | 94000 | 0 |
| title-kassandra | BG_sky_loop_20s_v1.mp4 | 16392 | 0 |
| 3-3-kassandra-rede | 3.3_25_SCENE_longinserts-v2.mp4 | 109000 | 0 |
| 4-0-wahl | 4.0 - 25_Wahl_master_v6_3108_athena_vo.mp4 | 42667 | 15000 |
| apollo-wins | 4.1_25_SCENE_v9_bridge_dissolve.mp4 | 105917 | 1000 |
| dionysos-wins | 4.2_25_SCENE_v9_bridge_dissolve.mp4 | 101375 | 1000 |
| kassandra-wins | 4.3_25_SCENE_v8_bridge_dissolve.mp4 | 113334 | 1000 |
| credits | smartphonocracy-credits (1).mp4 | 280480 | 60000 |
