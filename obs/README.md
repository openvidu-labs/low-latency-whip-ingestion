# OBS scene collection

`openvidu-whip-webcam.json` is an OBS **scene collection**: a webcam filling a 1280×720 canvas, a
solid backdrop behind it, your default microphone, and a *Virtual background* filter on the camera.
Import it and the only thing left to fill in is the WHIP URL and token from the app.

It was built against the collection format OBS Studio **32.2.2** saves, and needs OBS **30.0+** for
the WHIP output itself.

## Import it

**Scene Collection → Import**, pick this file, then **Scene Collection → OpenVidu WHIP ingest**.

There are three scenes, one per operating system:

| Scene | Camera source | What to do |
|---|---|---|
| `WHIP webcam — Linux` | `v4l2_input`, device `/dev/video0` | Change the device in **Properties** if your webcam is not `/dev/video0` |
| `WHIP webcam — macOS` | `av_capture_input` | Open **Properties** and pick your camera |
| `WHIP webcam — Windows` | `dshow_input` | Open **Properties** and pick your camera |

A camera source's id is platform-specific, so one scene cannot work everywhere: the two scenes for
the other platforms will show as unavailable sources. Delete them — that is the whole cleanup.

## Point it at OpenVidu

The collection carries scenes, sources and filters. It deliberately carries **no stream settings**:
a WHIP token is single-use and yours, so it does not belong in a file in a git repository.

With the demo app running (see the [main README](../README.md)):

1. Open <http://localhost:3000> and click **Generate WHIP credentials** (or
   `curl -s -X POST http://localhost:3000/api/ingress -H 'Content-Type: application/json' -d '{"identity":"obs"}'`).
2. In OBS, **Settings → Stream**:
   - **Service**: `WHIP`
   - **Server**: the `url` from the response
   - **Bearer Token**: the `streamKey` from the response
3. **Apply**, then **Start Streaming**.
4. Watch it at <http://localhost:3000/watch.html>.

Generate a fresh set of credentials every time you stop and restart streaming — the old ingress is
not reused.

### Output settings worth checking

Resolution and bitrate live in OBS's *profile*, not in a scene collection, so importing this file
does not change them. For a low-latency ingest:

- **Settings → Video**: output resolution 1280×720, 30 fps. The canvas in this collection is 720p;
  matching the output to it avoids a rescale.
- **Settings → Output → Streaming**: 2500–4000 Kbps, keyframe interval **1s**, and the
  `zerolatency` tune if your encoder offers it. WHIP ingress runs with transcoding **off** in this
  demo, so what OBS encodes is exactly what subscribers receive.

## The virtual background

The *Virtual background* filter on each camera is
[obs-backgroundremoval](https://github.com/locaal-ai/obs-backgroundremoval) — a
plugin, not a built-in OBS filter. Without it installed, OBS imports the collection fine and simply
drops the filter; the camera still streams, with your real background.

Install it, then reopen the scene:

```bash
# Flatpak OBS (Linux)
flatpak install flathub com.obsproject.Studio.Plugin.BackgroundRemoval
```

For a system OBS install, or on macOS and Windows, take the installer from the plugin's
[releases page](https://github.com/locaal-ai/obs-backgroundremoval/releases).

If the filter does not appear on the camera after installing the plugin, add it by hand — the
filter's internal id has changed between plugin releases, and the one this file names
(`background_removal`) is the long-standing one:

**Right-click the camera → Filters → + → Background Removal**.

Two things worth knowing:

- It costs CPU (or GPU, depending on the model you pick in the filter's properties). On a machine
  that is also running the whole OpenVidu stack in Docker, drop the camera to 720p before blaming
  WHIP for a stutter.
- **No plugin, no problem:** OBS's built-in **Chroma Key** filter does the same job with a green
  screen behind you, and costs almost nothing.

## What this does not do

- It does not create the WHIP ingress — that is the app's `POST /api/ingress`.
- It does not set your stream key (see above).
- It does not touch your other scene collections. Importing adds one named *OpenVidu WHIP ingest*.
