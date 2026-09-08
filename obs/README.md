# OBS scene collections

One scene collection per operating system: a webcam filling a 1280×720 canvas and your default
microphone. Import the one for your machine and the only thing left to fill in is the WHIP URL and
token from the app.

| Your OS | File | Camera source | Microphone |
|---|---|---|---|
| Linux | `openvidu-whip-webcam-linux.json` | `v4l2_input`, device `/dev/video0` | PulseAudio |
| macOS | `openvidu-whip-webcam-macos.json` | `av_capture_input` | CoreAudio |
| Windows | `openvidu-whip-webcam-windows.json` | `dshow_input` | WASAPI |

They are separate files because a capture source's internal id is platform-specific, so one
collection cannot work everywhere — and choosing your own file beats importing three scenes and
deleting two.

Built against the collection format OBS Studio **32.2.2** saves; the WHIP output itself needs OBS
**30.0+**.

## Import it

**Scene Collection → Import**, pick your file, then **Scene Collection → OpenVidu WHIP ingest**.

It gives you one scene, *WHIP webcam*, with one source in it. Open the camera's **Properties** and
pick your device — the Linux file points at `/dev/video0`, and the macOS and Windows ones deliberately
choose nothing, since device ids are per-machine.

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

## The background

There is no filter on the camera: what the webcam sees is what goes out. If you want the background
replaced, add one yourself — **right-click the camera → Filters → +**:

- **Chroma key** is built into OBS, costs almost nothing per frame, and needs a green screen behind
  you. Green with the default tolerances is usually right; *Similarity* is the dial that matters,
  raised until the green goes and stopped before your hair does. Even lighting on the screen matters
  more than any setting.
- **Background Removal** needs no green screen and runs a model on every frame, at real CPU or GPU
  cost. It is a plugin, not part of OBS:
  [obs-backgroundremoval](https://github.com/locaal-ai/obs-backgroundremoval), and on Flatpak OBS
  `flatpak install flathub com.obsproject.Studio.Plugin.BackgroundRemoval`.

Whichever you add, put it on the camera source and it applies wherever that source is used.

## What this does not do

- It does not create the WHIP ingress — that is the app's `POST /api/ingress`.
- It does not set your stream key (see above).
- It does not touch your other scene collections. Importing adds one named *OpenVidu WHIP ingest*.
