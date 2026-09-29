# Local venue show

The September 24 delivery uses one uninterrupted main film with timed interactive cues. The familiar phases remain as cue names for voting, recording and the admin scene navigator; advancing a cue does not reload the film. Live mode remains the default.

## Behavior

- The supplied lobby film loops until a visitor joins, with the join QR tracked onto its marker.
- The first visitor starts a 45-second countdown. Additional visitors do not shorten or reset it.
- Phones remain live, including late joins through the printed QR code. A top-left QR with “Mach mit” fades in after three minutes with no connected visitors and fades out as soon as someone joins. Quiet watching does not end a session.
- When all phones disconnect, the film keeps playing. After three minutes the joining invitation appears; a returning visitor resets this timer. Broken connections are first detected by the existing WebSocket heartbeat.
- The final vote resolves normally, including the existing Kleroterion tie-break. Its result stays visible until the delivery's hide cue, then the winner film plays, followed by the current credits. An empty vote returns to the lobby as in the supplied timing file.
- Credits keep live cursors visible and fade picture, cursors, and music from 70 to 73 seconds (ten extra seconds after the credit roll). The lobby fades in from black. Vote totals are hidden; countdown numbers remain and the initial three votes have countdown pings.
- At the end, the existing visit cleanup disconnects phones and clears their results. The data donation choice remains available for two minutes; unanswered recordings are then deleted. After a choice or timeout, phones redirect to Interrobang. Visitors join again for a fresh run.
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
https://smartphonocracy-venue-server.enabler.space/phone/
```

The live server handles admission, show timing, votes, and automatic starts. The venue computer runs only the playback gateway; video and audio bytes stay on that computer. Both the venue computer and visitors need internet access. The existing admin is on the live site at `/admin/`.

### Live deployment (Coolify)

Deploy this repository with build context `.` and Dockerfile `apps/server/Dockerfile`. This builds the matching phone, display and admin apps together. Keep the existing PocketBase, display token, join-secret and cursor-relay settings. Add these runtime settings:

```dotenv
RUN_MODE=venue
INSTALLATION_ID=smartphonocracy-venue
ROOM_ID=venue
VENUE_MEDIA_LOCATION=display
SHOW_ID=smartphonocracy-venue-2026-09-24
SCENARIO_PATH=content/scenarios/venue.json
MEDIA_MANIFEST_PATH=content/media-manifests/venue.json
PHONE_JOIN_BASE_URL=https://smartphonocracy-venue-server.enabler.space/phone/
ALLOW_LATE_JOIN=true
```

The coordinator validates the scenario and manifest but does not require video files on its own filesystem. It loads this venue scenario from the deployed repository, independent of Studio publication. `SOURCE_COMMIT` provides matching server/frontend build versions through the existing Dockerfile.

### Venue computer

For a fresh Windows installation maintained through Git, use [Windows installation and updates](venue-windows-git.md). That workflow builds the local display, opens Edge automatically, and supports startup at Windows sign-in. The Windows launcher uses the local build by default; `-UseLiveDisplay` explicitly selects the hosted display instead.

Install this repository's dependencies with Node 22+ and pnpm. Copy the supplied video folder into the repository and name it `venue-media`, so the files are laid out like this:

```text
smartphonecracy-runner/
  venue-media/
    *.mp4
  scripts/
```

The copied folder may also contain `venue.json` and `media-manifest.json`; the player ignores those local metadata copies and verifies the videos against the live show's manifest. Then run:

```sh
bash scripts/start-venue.sh
```

Open `http://localhost:3000/display/`, enable sound once, and enter fullscreen. The display token is supplied by the live build as before; an explicit `?token=...` override also works. No local PocketBase or frontend build is required.

The local gateway loads the display app from the live deployment, forwards its WebSocket to that same server, and serves `/media/` only from `venue-media`. It checks the local file sizes and SHA-256 hashes against the live manifest before allowing the display to connect. Hashing takes a little time on first launch. The gateway binds only to localhost.

To test local display changes (including lobby QR tracking) before deployment, build `@smartphonecracy/display` with the live show's `BUILD_VERSION` and `DISPLAY_TOKEN`, then set `VENUE_DISPLAY_DIR=apps/display/dist` when starting the player. Reload the display after building. This overrides only `/display/`; status, participation, and show timing still use the live server. Without this explicit override, editing or rebuilding the local display does not change what the player shows.

Optional overrides:

```sh
VENUE_SERVER_URL=https://smartphonocracy-venue-server.enabler.space \
MEDIA_DIR='/another/location/runner-fullHD' \
PORT=3000 bash scripts/start-venue.sh
```

Use a stable public URL in the printed QR; never print `localhost` or the venue computer's private LAN address for mobile-data visitors. No QR is shown over the film.

### Verification

`pnpm typecheck` and `pnpm test` exercise the runtime. After building the display, phone and admin apps, `node --import tsx scripts/verify-venue.mts` starts a hosted-style coordinator with no media directory and a separate SSD gateway, tests browser playback and phone joins, then shuts both down.

Before unattended use, check picture, sound and one actual phone using mobile data at the venue. The server clock schedules interactions; the player corrects video drift greater than half a second.

### Live performance mode

To restore the previous operator-driven show, deploy with `RUN_MODE=live` and `VENUE_MEDIA_LOCATION=server`. This retains the existing PocketBase show selection and operator/scheduled starts. The standalone local-engine setup is still available by running the server with `RUN_MODE=venue` and `VENUE_MEDIA_LOCATION=server`, using the SSD media directory, but it is not the mobile-data setup described above.

### Venue ghosts

Venue mode admits at most 100 human participants. Ghosts fill only up to 15 total cursors (humans plus ghosts), limited by available completed recordings. At 15 or more connected humans there are no ghosts. It does not synthesize recordings. The venue loads its own pool and refreshes it every minute for future sessions. Studio's shared audience override does not affect venue mode. Venue mode enforces the 15-cursor ghost fill independently of Studio overrides. Its join rate limit allows at least 300 attempts per minute per source IP so 100 visitors sharing Wi-Fi can join.

### Windows startup and recovery

Install Node 22+ and pnpm, put this repository on the venue PC, and run `pnpm install` once. Copy the supplied video folder to `venue-media` inside the repository. In PowerShell, from the repository folder, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-venue.ps1 -OpenBrowser
```

This starts the gateway, opens Edge fullscreen, and restarts the gateway five seconds after it exits. The kiosk URL requests sound automatically and Edge is launched with autoplay enabled. Check that sound actually plays on the venue PC. Logs are in `%LOCALAPPDATA%\Smartphonocracy`.

For automatic startup at Windows sign-in:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-venue-startup.ps1
Start-ScheduledTask -TaskName "Smartphonocracy Venue Player"
```

Pass `-MediaDir "D:\some\other\folder"` to either script only when the videos are stored somewhere else.

The task runs as the signed-in user, without administrator privileges. Keep the PC awake while plugged in. Startup requires Windows sign-in; this script does not configure automatic Windows login. To stop/remove startup, use Task Scheduler's **End** / **Disable**, or `Unregister-ScheduledTask -TaskName "Smartphonocracy Venue Player"`. Native Windows execution must be checked on the venue PC.
