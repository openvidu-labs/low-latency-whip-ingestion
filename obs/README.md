# OBS scene collection

`openvidu-whip-webcam.json` is an OBS **scene collection**: a webcam filling a 1280×720 canvas, a
solid backdrop behind it, your default microphone, and a *Chroma key* filter on the camera. Import it
and the only thing left to fill in is the WHIP URL and token from the app.

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

## The background

Each camera carries a **Chroma key** filter — OBS's own, no plugin to install — keyed on green, with
OBS's default tolerances:

| Setting | Value |
|---|---|
| Key colour type | Green |
| Similarity | 400 |
| Smoothness | 80 |
| Colour spill reduction | 100 |

Put a green screen behind you and the *Backdrop* colour source underneath shows through instead.
Without one, the filter has nothing to key on and simply leaves the picture alone, which is a
perfectly good way to stream too — so the collection is useful either way.

Tuning it, in **right-click the camera → Filters → Chroma key**:

- **Similarity** is the main dial: raise it until the green goes, stop before your hair does.
- **Smoothness** softens the edge; **Colour spill reduction** takes the green tint off skin and
  light-coloured clothing.
- Even lighting on the screen matters more than any of these three. A shadowed fold in a cloth
  backdrop keys as a different colour, and no setting rescues it.

It costs almost nothing to run — which is the point of choosing it here, on a machine that is also
running the whole OpenVidu stack in Docker.

**No green screen?** A model-based virtual background is a plugin away —
[obs-backgroundremoval](https://github.com/locaal-ai/obs-backgroundremoval), and on Flatpak OBS
`flatpak install flathub com.obsproject.Studio.Plugin.BackgroundRemoval`. Add it to the camera by
hand once installed. It needs no green screen and costs real CPU or GPU on every frame, which is
why it is not what this collection ships with.

## What this does not do

- It does not create the WHIP ingress — that is the app's `POST /api/ingress`.
- It does not set your stream key (see above).
- It does not touch your other scene collections. Importing adds one named *OpenVidu WHIP ingest*.
