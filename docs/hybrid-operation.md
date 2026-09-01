# Hybrid operation: online phones, local display and media

## Recommended split

Keep the existing phone app and authoritative show process on the public web.
Run only the installation display shell and media working set on the venue
computer.

```text
participant phones
  -> https://smartphonocracy-server.enabler.space/phone/
  -> hosted /api + /ws (admission, show state, votes, authoritative cursors)
  -> hosted cursor relay (low-latency cursor overlay)

venue display
  -> http://127.0.0.1:3000/display/ (local shell)
  -> local /media-manifest.json and /media/* (local video/audio/image bytes)
  -> wss://smartphonocracy-server.enabler.space/ws (hosted show state)
  -> wss://smartphonocracy-websockets.enabler.space (hosted cursor overlay)

local display launcher
  -> hosted /api/status (installation, room, exact build version)
  -> hosted /media-manifest.json (active show's working set)
  -> public PocketBase media collection (startup download only)
```

There is no inbound tunnel and no venue router or port-forwarding change. The
venue computer only makes normal outbound HTTPS and WSS connections. Video,
image, and audio playback uses loopback and local disk; those large bytes never
pass through the public show server during playback.

## What runs where

| Process or data | Location | Reason |
|---|---|---|
| Phone React app | Online | Visitors can open it on Wi-Fi or mobile data without reaching the venue LAN |
| `apps/server` phase engine, admission, votes, timing | Online | One stable public authority; no inbound venue networking |
| `apps/realtime-ws-coolify` | Online | Public low-latency cursor fan-out |
| PocketBase | Online | Published scenarios, active configuration, media master, operator identities, and recordings |
| Display React app | Local | Kiosk shell is independent of public static-asset delivery |
| Active show's media working set | Local disk and display Cache Storage | No show-time video buffering; size and SHA-256 are verified before use |
| Local hybrid process | Local loopback only | Serves the display, manifest, and media; proxies only `/api/status` for bootstrap |
| Admin and Studio | Online by default | They control and publish to the online authority, not a second local show engine |

The low-latency cursor relay is additive. Voting and authoritative cursor input
still travel through the hosted core's `/ws`, so branch decisions and the
display always use the same online show state as participant phones.

## Startup behavior

`pnpm hybrid` performs these steps:

1. Fetch the hosted core's status and active media manifest.
2. Refuse to run if the local Git revision differs from the hosted build.
3. Build only `apps/display`, baking in the hosted build version, hosted `/ws`,
   public cursor relay, and matching display token.
4. Download only missing or changed files in the active manifest from
   PocketBase. Every downloaded and existing local file is checked by byte size
   and SHA-256.
5. Bind a display/media-only server to `127.0.0.1:3000`. It does not instantiate
   a phase engine, accept phones, resolve votes, or write show records.

The local `/api/status` route proxies the hosted status so the display resolves
the current installation and room without requiring cross-origin browser
permissions. Phase snapshots arrive over the configured hosted WebSocket;
relative media names continue to resolve against local `/media/*`.

## Environment and commands

The only required local secret is `DISPLAY_TOKEN`, matching the hosted core.
Copy it into the existing gitignored `.env`. The public endpoints and local
bind values have defaults documented in `.env.hybrid.example`.

```bash
pnpm hybrid --check
pnpm hybrid
```

Then open:

```text
http://127.0.0.1:3000/display/
```

Visitors continue to use:

```text
https://smartphonocracy-server.enabler.space/phone/
```

`--check` verifies the environment, hosted status, active manifest, and source
revision without building, downloading, or opening a port. `--skip-build` is
for repeated local tests only; a live launch should rebuild so its token, URLs,
and build version cannot be stale.

After publishing or selecting a different show, restart `pnpm hybrid` and
hard-refresh the local display. This refreshes the active manifest and downloads
the new working set. Close any hosted display tab first: the authoritative
server intentionally permits only one official display connection.

## Failure and security implications

- Internet loss stops voting, cursor input, QR grants, and phase progression.
  Already-downloaded videos remain local, but the interactive show is not
  designed to continue without its online authority.
- PocketBase is needed during startup when active media is missing or changed.
  It is not in the playback path after synchronization.
- The local edge binds to loopback, so venue phones cannot accidentally join a
  second local server. It never runs a second show engine in any case.
- `DISPLAY_TOKEN` is embedded in the local display bundle. Keep the loopback
  server and kiosk account private, and rotate the token if the machine or token
  has been exposed.
- Do not bypass the source-revision check for a live show. Labeling an old
  display bundle with the new server version could hide a protocol mismatch.
