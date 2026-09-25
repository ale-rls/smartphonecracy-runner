# Local venue show

The September 24 delivery uses one uninterrupted main film with timed interactive cues. The familiar phases remain as cue names for voting, recording and the admin scene navigator; advancing a cue does not reload the film. Live mode remains the default.

## Behavior

- The supplied lobby film loops until a visitor joins.
- One visitor starts a 30-second countdown. Two connected visitors start immediately.
- Phones remain live, including late joins through the printed QR code. No QR is drawn over the film. Quiet watching does not end a session.
- When all phones disconnect, the film continues for up to two minutes. A returning visitor cancels that timeout. Otherwise the runner returns to the lobby. Broken connections are first detected by the existing WebSocket heartbeat.
- The final vote resolves normally, including the existing Kleroterion tie-break. Its result stays visible until the delivery's hide cue, then the winner film plays, followed by the current credits. An empty vote returns to the lobby as in the supplied timing file.
- At the end, the existing visit cleanup disconnects phones and clears their results. Visitors join again for a fresh run.
- The same `/admin/` provides start, skip, restart, return to idle and scene navigation. Venue mode displays its automatic behavior and hides Studio show selection, ghost settings and scheduling. It does not need a separate admin route.

## Prepared SSD delivery

`/Volumes/SANDISK SSD/Smartphonocracy/Masters/runner-fullHD/` contains six browser-ready MP4s, `venue.json`, and `media-manifest.json`. Original MOV files remain in `fullHD/`.

Video frames are copied without re-encoding. PCM audio is converted to AAC at 320 kbit/s with no level normalization. The current project credits are copied unchanged. The generator verifies dimensions and frame counts and hashes the resulting files.

To reproduce the delivery:

```sh
python3 scripts/prepare-venue.py \
  --timings '/Volumes/SANDISK SSD/Smartphonocracy/Masters/SMARTPHONOCRACY_runner-timings.json' \
  --backup '/Users/m/Downloads/Smartphonocracy Week 2 Friday - Final.studio-backup.json' \
  --masters '/Volumes/SANDISK SSD/Smartphonocracy/Masters/fullHD' \
  --media-dir '/Volumes/SANDISK SSD/Smartphonocracy/Masters/runner-fullHD'
```

The generator also writes the repository's `content/scenarios/venue.json` and `content/media-manifests/venue.json`. Existing video outputs are validated and reused. To replace an output after changing its master, move the previous output aside first.

## Live site and venue playback

Visitors use their own phones on mobile data or venue Wi-Fi. The printed QR should link to:

```text
https://smartphonocracy-server.enabler.space/phone/
```

The live server handles admission, show timing, votes, and automatic starts. The venue computer runs only the playback gateway; video and audio bytes stay on the SSD. Both the venue computer and visitors need internet access. The existing admin is on the live site at `/admin/`.

### Live deployment (Coolify)

Deploy this repository with build context `.` and Dockerfile `apps/server/Dockerfile`. This builds the matching phone, display and admin apps together. Keep the existing PocketBase, display token, join-secret and cursor-relay settings. Add these runtime settings:

```dotenv
RUN_MODE=venue
VENUE_MEDIA_LOCATION=display
SHOW_ID=smartphonocracy-venue-2026-09-24
SCENARIO_PATH=content/scenarios/venue.json
MEDIA_MANIFEST_PATH=content/media-manifests/venue.json
PHONE_JOIN_BASE_URL=https://smartphonocracy-server.enabler.space/phone/
ALLOW_LATE_JOIN=true
```

The coordinator validates the scenario and manifest but does not require video files on its own filesystem. It loads this venue scenario from the deployed repository, independent of Studio publication. `SOURCE_COMMIT` provides matching server/frontend build versions through the existing Dockerfile.

### Venue computer

Install this repository's dependencies with Node 22+ and pnpm, connect the SSD, and run:

```sh
bash scripts/start-venue.sh
```

Open `http://localhost:3000/display/`, enable sound once, and enter fullscreen. The display token is supplied by the live build as before; an explicit `?token=...` override also works. No local PocketBase or frontend build is required.

The local gateway loads the display app from the live deployment, forwards its WebSocket to that same server, and serves `/media/` only from the SSD. It checks the SSD file sizes and SHA-256 hashes against the live manifest before allowing the display to connect. Hashing takes a little time on first launch. The gateway binds only to localhost.

Optional overrides:

```sh
VENUE_SERVER_URL=https://smartphonocracy-server.enabler.space \
MEDIA_DIR='/Volumes/SANDISK SSD/Smartphonocracy/Masters/runner-fullHD' \
PORT=3000 bash scripts/start-venue.sh
```

Use a stable public URL in the printed QR; never print `localhost` or the venue computer's private LAN address for mobile-data visitors. No QR is shown over the film.

### Verification

`pnpm typecheck` and `pnpm test` exercise the runtime. After building the display, phone and admin apps, `node --import tsx scripts/verify-venue.mts` starts a hosted-style coordinator with no media directory and a separate SSD gateway, tests browser playback and phone joins, then shuts both down.

Before unattended use, check picture, sound and one actual phone using mobile data at the venue. The server clock schedules interactions; the player corrects video drift greater than half a second.

### Live performance mode

To restore the previous operator-driven show, deploy with `RUN_MODE=live` and `VENUE_MEDIA_LOCATION=server`. This retains the existing PocketBase show selection and operator/scheduled starts. The standalone local-engine setup is still available by running the server with `RUN_MODE=venue` and `VENUE_MEDIA_LOCATION=server`, using the SSD media directory, but it is not the mobile-data setup described above.
