# low-latency-whip-ingestion

A companion demo for the OpenVidu blog's ["Low Latency Live Streaming" series](https://openvidu.io/blog/) (see the "Low Latency Live Streaming: WebRTC vs. HLS and DASH" post — link will be added here once it's published). Part 1 explained *why* WHIP gets you sub-second latency where HLS/DASH structurally can't. This repo is the practical part 2: push a real stream into an [OpenVidu](https://openvidu.io/) Room over [WHIP](https://datatracker.ietf.org/doc/rfc9725/) — from a browser webcam or from OBS Studio — and watch it come out the other side.

Everything runs locally with Docker Compose: the OpenVidu stack, this demo app, and your browser are the only moving parts. No cloud account, no video file, no ffmpeg — the whole point is that a browser and OBS can already speak WHIP on their own.

## Architecture

```
┌──────────────┐   WHIP (HTTP + SDP)   ┌──────────────────────┐
│ Browser      │ ────────────────────▶ │ OpenVidu             │
│ (webcam)     │                       │ (LiveKit-compatible) │
└──────────────┘                       │                      │
                                       │  Room: demo-room     │
┌──────────────┐   WHIP (HTTP + SDP)   │                      │
│ OBS Studio   │ ────────────────────▶ │                      │
└──────────────┘                       └──────────┬───────────┘
                                                  │ WebRTC (subscribe)
                                                  ▼
                                        ┌──────────────────────┐
                                        │ Browser (viewer)     │
                                        └──────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ app/ (this repo)                                             │
│  POST /api/ingress        -> creates a WHIP ingress          │
│  GET  /api/viewer-token   -> mints a subscribe-only token    │
└──────────────────────────────────────────────────────────────┘
```

OpenVidu Platform is a self-hosted, [LiveKit](https://livekit.io/)-compatible server. There is no OpenVidu-specific ingestion API — this app talks to it with LiveKit's own `livekit-server-sdk` (server side) and `livekit-client` (browser side), the same SDKs OpenVidu's own docs point you at.

## Prerequisites

- **Docker** and **Docker Compose v2** — `docker compose version`.
- **Git**.
- A webcam and microphone, for the browser-publisher path.
- [OBS Studio](https://obsproject.com/) 30.0+, for the OBS path (optional).

## Quickstart

### 1. Clone this repo

```bash
git clone https://github.com/openvidu-labs/low-latency-whip-ingestion
cd low-latency-whip-ingestion
```

### 2. Start OpenVidu

This app doesn't bundle OpenVidu — it joins the network of a real
[OpenVidu Local Deployment](https://openvidu.io/latest/docs/self-hosting/local/), exactly as you'd
add ingestion to an OpenVidu install you don't otherwise control. Clone that deployment, run its
configure script once, and start it:

```bash
git clone -b 3.8.0 https://github.com/OpenVidu/openvidu-local-deployment vendor/openvidu-local-deployment
cd vendor/openvidu-local-deployment/community
./configure_lan_private_ip_linux.sh    # macOS: ./configure_lan_private_ip_macos.sh
docker compose up -d
cd -
```

On Windows, run `.\configure_lan_private_ip_windows.bat` from PowerShell instead of the `.sh`
script; everything else is the same.

Two notes:

- **`vendor/` is gitignored here**, so the clone doesn't show up as untracked files in this repo.
  Clone it anywhere you like — nothing in this app points at that directory.
- **The configure script writes one line**: your machine's LAN address into the deployment's `.env`,
  as `LAN_PRIVATE_IP`. That is the address the media server announces itself as, which is why the
  deployment ships it empty and detects it per machine. If media negotiates and then never arrives,
  that value is the first thing to check.

Now wait for the ready banner — the stack is eleven containers, and a first boot pulls several GB of
images:

```bash
docker logs -f ready-check
```

It prints `🎉 OpenVidu 3.8.0 is ready! 🎉` when everything is up. (The banner comes from the
`ready-check` container, not from `openvidu`.)

### 3. Start the app

```bash
docker compose up -d --build
```

This builds and runs the small Node.js app in `app/` on port `3000`, joined to the
`openvidu-community` Docker network that step 2 created. That network name is why the two stacks can
be started, stopped and restarted independently of each other.

### 4. Open it

**[http://localhost:3000](http://localhost:3000)**

- **Publish from your webcam** — captures your camera/mic and publishes over WHIP directly from the browser.
- **Watch the stream** — subscribes to whatever is currently live in the room and renders it.

Open both in separate tabs (or separate browsers) to see the whole loop.

## Publish with OBS

**Linux note:** WHIP output is not available in the Ubuntu 24.04 PPA build of OBS. Use the [Flatpak build](https://flathub.org/apps/com.obsproject.Studio) instead if `WHIP` doesn't show up under Service.

**Shortcut:** [`obs/openvidu-whip-webcam.json`](obs/) is a ready-made scene collection — a webcam on
a 720p canvas, a backdrop behind it, and your default mic. Import it (**Scene Collection →
Import**), keep the scene for your OS, and skip to step 1 below. See
[`obs/README.md`](obs/README.md) for background filters and the output settings worth checking.

WHIP has been a built-in OBS output since version 30. You need a WHIP URL and a bearer token — the app generates both for you:

1. With the app running, either:
   - open [http://localhost:3000](http://localhost:3000) and click **Generate WHIP credentials**, or
   - `curl -s -X POST http://localhost:3000/api/ingress -H 'Content-Type: application/json' -d '{"identity":"obs"}'`
2. Copy the `url` and `streamKey` from the response.
3. In OBS: **Settings → Stream**.
   - **Service**: `WHIP`
   - **Server**: the `url` value
   - **Bearer Token**: the `streamKey` value
4. Click **Apply**, then **Start Streaming**.
5. Open [http://localhost:3000/watch.html](http://localhost:3000/watch.html) — your OBS scene should appear.

> Each set of credentials is single-use per ingress. If you stop and restart streaming in OBS, generate a fresh set first — the old ingress isn't reused.

## How it works

- **`POST /api/ingress`** calls LiveKit's `IngressClient.createIngress(IngressInput.WHIP_INPUT, ...)` against OpenVidu, which creates a room (if it doesn't already exist — LiveKit auto-creates rooms on first join) and returns a WHIP `url` and a `streamKey`. The `streamKey` is sent as `Authorization: Bearer <streamKey>` by whatever publishes to that `url`.
- **The browser publisher** (`app/public/whip-client.js`) is a small, dependency-free WHIP client: it builds an `RTCPeerConnection`, adds sendonly transceivers for the camera/mic tracks, waits for ICE gathering to finish, then `POST`s the SDP offer to the ingress URL as `application/sdp`. The server answers `201 Created` with the SDP answer as the body. That's the entire protocol — no bespoke signaling, no OpenVidu SDK on the publish side.
- **OBS** speaks the exact same protocol; it just has a settings UI instead of a `fetch()` call.
- WHIP ingress defaults to **no transcoding** in LiveKit (`enableTranscoding: false` here, made explicit rather than left as an implicit default) — the encoder's codec is forwarded as-is. That's the low-latency path this whole demo exists to show; enabling transcoding trades some of that latency for compatibility with encoders whose codec OpenVidu's Rooms can't otherwise play back.
- **`GET /api/viewer-token`** mints a LiveKit `AccessToken` with `roomJoin: true, canSubscribe: true, canPublish: false` — a subscribe-only grant, since the viewer page should never accidentally start publishing.
- **The viewer page** (`app/public/watch.html`) uses LiveKit's browser SDK (`livekit-client`, served straight from `node_modules` — no bundler, no CDN) to connect, listens for `RoomEvent.TrackSubscribed`, and calls `track.attach()` on the incoming video track.

## API reference

| Endpoint | Method | Body / Query | Returns |
|---|---|---|---|
| `/api/ingress` | `POST` | `{ "identity"?: string }` | `{ roomName, participantIdentity, url, streamKey }` |
| `/api/viewer-token` | `GET` | `?identity=<string>` (optional) | `{ identity, roomName, token, url }` |

## Configuration

Set these as environment variables on the `app` service in `docker-compose.yml`:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the app listens on |
| `ROOM_NAME` | `demo-room` | The single OpenVidu Room this demo publishes to and watches |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `devkey` / `secret` | Must match `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` in `vendor/openvidu-local-deployment/community/.env` |
| `LIVEKIT_INTERNAL_URL` | `http://openvidu:7880` | Reached from inside the `openvidu-community` Docker network, for server-side API calls (ingress/token creation) |
| `LIVEKIT_PUBLIC_URL` | `ws://localhost:7880` | Handed back to the browser, which can't resolve Docker service names |

## Troubleshooting

- **`Could not create ingress. Is the OpenVidu stack up?`** — the `app` container can't reach `http://openvidu:7880`. Confirm the OpenVidu stack is running and that `docker network inspect openvidu-community` lists both `llwi-app` and the OpenVidu containers.
- **Browser publish fails partway through, or "Stop" doesn't cleanly end the stream** — the WHIP `Location` response header (used to `DELETE` and cleanly end a session) is only readable by browser JavaScript if the server sends `Access-Control-Expose-Headers: Location`. If it doesn't, `whip-client.js` falls back to just closing the peer connection locally, which still ends the stream, just less tidily on the server side.
- **Nothing shows up on the watch page** — open the browser console on both the publisher and viewer tabs. A publish failure shows up as a red status on the publish page; a subscribe failure shows up as one on the watch page.
- **Ports already in use** — this demo uses host ports `3000` (app) plus everything `openvidu-local-deployment` publishes (`7880`, `7881`, `7443`, etc. — see its own README).

## Stopping

The app, from this repo:

```bash
docker compose down
```

And the OpenVidu stack, from where you cloned it:

```bash
cd vendor/openvidu-local-deployment/community && docker compose down && cd -
```

Add `-v` to that last one to drop the stack's volumes too (recordings, MinIO and Mongo data).

## Alternative: start OpenVidu without cloning it

If you'd rather not have a second checkout on disk, Compose can read the deployment's compose file
straight out of GitHub. It needs **Compose 2.24 or newer** (tested on v5.5.1) and it is fiddlier than
the clone above, so it is here rather than in the Quickstart:

```bash
# The deployment's defaults — API keys, passwords, ports. One file, no clone.
curl -fsSL -o openvidu.env \
  https://raw.githubusercontent.com/OpenVidu/openvidu-local-deployment/3.8.0/community/.env

# Export them, and fill in the value the configure script would have detected.
set -a
. ./openvidu.env
LAN_PRIVATE_IP=$(ip route get 8.8.8.8 | sed -n 's/.*src \([^ ]*\).*/\1/p')   # macOS: $(ipconfig getifaddr en0)
set +a

docker compose -p openvidu \
  -f "https://github.com/OpenVidu/openvidu-local-deployment.git#3.8.0:community" \
  up -d          # add -y to skip the confirmation prompt
```

Stopping it takes the same file and the same variables, since Compose reads the file again to know
what it is tearing down:

```bash
set -a; . ./openvidu.env; set +a
docker compose -p openvidu \
  -f "https://github.com/OpenVidu/openvidu-local-deployment.git#3.8.0:community" \
  down
```

Three things about it that are not guessable:

- **`set -a` is what makes the variables reach Compose**, not `--env-file`. With a remote compose
  file the project directory is Compose's own cache of the repository, so `--env-file` is resolved
  against *that* and a local env file is silently ignored — every variable comes back unset.
- **`LAN_PRIVATE_IP` has to be set by hand**, because the configure script you skipped is the thing
  that normally sets it.
- **Compose asks for confirmation** when the compose file is remote, listing every variable it
  resolved. `-y` skips it on `up`; `down` takes no such flag and doesn't ask.

Plain HTTPS doesn't work, in case you were about to try it: `docker compose -f https://…/compose.yaml`
treats the URL as a local path. The `.git#tag:subdir` form above is a different mechanism — Compose
fetches the repository, which is also what makes the stack's sibling files
(`livekit.yaml`, `ingress.yaml`, `meet.env`, …) available to it.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
