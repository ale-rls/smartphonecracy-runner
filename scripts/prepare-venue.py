#!/usr/bin/env python3
"""Prepare the September 2026 venue delivery. Originals are never overwritten."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ]))


def prepare(timings_path, backup_path, masters, media_dir):
    timings = json.loads(timings_path.read_text())
    reference = json.loads(backup_path.read_text())["draft"]["project"]["scenario"]
    by_id = {phase["id"]: phase for phase in reference["phases"]}
    media_dir.mkdir(parents=True, exist_ok=True)
    delivery = timings["files"]
    sources = [delivery["lobby"], delivery["mainShow"], *delivery["winners"].values()]
    names = {}
    for entry in sources:
        filename = Path(entry["files"]["fullHD"]).name
        target = media_dir / Path(filename).with_suffix(".mp4")
        names[filename] = target.name
        if not target.exists():
            print(f"Preparing {target.name}", flush=True)
            # Copy every H.264 picture frame; only convert PCM audio to AAC for
            # browser compatibility. No normalization, cropping or frame changes.
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
                "-i", str(masters / filename), "-map", "0:v:0", "-map", "0:a:0",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", str(target)
            ], check=True)
        video = next(stream for stream in probe(target)["streams"] if stream["codec_type"] == "video")
        if (int(video["nb_frames"]) != entry["frames"] or video["width"] != 1920
                or video["height"] != 1080 or video["codec_name"] != "h264"):
            raise ValueError(f"Unexpected video format/frame count: {target}")

    def source(entry):
        return names[Path(entry["files"]["fullHD"]).name]

    credits = ROOT / "apps/display/src/assets/smartphonocracy-credits.mp4"
    credits_target = media_dir / "smartphonocracy-credits.mp4"
    if not credits_target.exists():
        shutil.copy2(credits, credits_target)
    elif hashlib.sha256(credits.read_bytes()).digest() != hashlib.sha256(credits_target.read_bytes()).digest():
        raise ValueError(f"Existing credits differ from current credits; move {credits_target} before rerunning")
    credits_ms = round(float(probe(credits_target)["format"]["duration"]) * 1000)

    phases = [{"id": "idle", "kind": "idle", "src": source(delivery["lobby"])}]
    segments = delivery["mainShow"]["segments"]
    for index, segment in enumerate(segments):
        start_ms = segment["startFrame"] * 1000 / timings["conventions"]["fps"]
        end_ms = segment["endFrame"] * 1000 / timings["conventions"]["fps"]
        phase = {
            "id": segment["phaseId"], "kind": "video", "src": source(delivery["mainShow"]),
            "timeline": {"id": "main-show", "startMs": start_ms}, "fit": "contain",
            "expectedDurationMs": end_ms - start_ms,
            "next": segments[index + 1]["phaseId"] if index + 1 < len(segments) else "idle",
        }
        cue = segment.get("runnerDraws")
        if cue and cue["type"] == "rating":
            phase["rating"] = {"candidateLabel": cue["candidateLabel"], "windows": [
                {"startAtMs": window["startAtMs"], "endAtMs": window["endAtMs"]}
                for window in cue["windows"]
            ]}
        elif cue:
            phase["kind"] = "video-position-question"
            phase["next"] = cue.get("next", {"type": "fixed", "target": phase["next"]})
            for key in ["showAtMs", "openAtMs", "closeAtMs", "hideAtMs", "closeCountdownSeconds",
                        "connectionStaleAfterMs", "showLiveCounts", "field", "soundEnabled", "textBurnedIn"]:
                if key in cue:
                    phase[key] = cue[key]
            # Keep semantic text for the phones and admin, even when burned into the film.
            phase["text"] = cue.get("text", by_id[phase["id"]].get("text"))
            if cue["type"] == "vote":
                # Leave the result visible until hideAt, then branch out of the
                # baked-in final-frame hold instead of waiting for the whole file.
                phase["expectedDurationMs"] = cue["hideAtMs"]
        phases.append(phase)
    for phase_id, entry in delivery["winners"].items():
        phases.append({"id": phase_id, "kind": "video", "src": source(entry), "fit": "contain",
                       "expectedDurationMs": entry["frames"] * 1000 / timings["conventions"]["fps"], "next": "credits"})
    phases.append({"id": "credits", "kind": "video", "src": credits_target.name, "fit": "contain",
                   "expectedDurationMs": 63000, "fadeOutMs": 3000, "timeline": {"id": "credits", "startMs": 0}, "next": "idle", "showCursors": True})
    for phase in [p for p in phases if p["kind"] == "video-position-question"]:
        phase["showLiveCounts"] = False
    for phase in [p for p in phases if p["kind"] == "video-position-question"][:3]:
        phase["countdownSoundEnabled"] = True
    scenario = {"version": "smartphonocracy-venue-2026.09.24", "entryPhaseId": segments[0]["phaseId"],
                "cyclesAllowed": False, "targetAudienceSize": 50, "phases": phases}
    files = []
    for name in sorted([*names.values(), credits_target.name]):
        path = media_dir / name
        with path.open("rb") as stream:
            hasher = hashlib.sha256()
            for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
                hasher.update(chunk)
            digest = hasher.hexdigest()
        files.append({"src": name, "bytes": path.stat().st_size, "hash": digest})
    for relative, value in [("content/scenarios/venue.json", scenario),
                            ("content/media-manifests/venue.json", {"files": files})]:
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        # Include a self-contained copy with the SSD delivery.
        delivery_name = "venue.json" if path.parent.name == "scenarios" else "media-manifest.json"
        (media_dir / delivery_name).write_text(path.read_text())
    print(f"Prepared {len(files)} films and {len(phases)} timeline cues in {media_dir}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timings", type=Path, required=True)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--masters", type=Path, required=True)
    parser.add_argument("--media-dir", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.timings, args.backup, args.masters, args.media_dir)
