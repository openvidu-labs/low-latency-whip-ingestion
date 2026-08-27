// Minimal backend for the low-latency-whip-ingestion demo.
//
// It only does two things:
//   1. POST /api/ingress        -> creates a WHIP Ingress on OpenVidu/LiveKit and hands back
//                                   the WHIP URL + stream key an encoder (browser or OBS) needs
//                                   to start publishing.
//   2. GET  /api/viewer-token   -> mints a subscribe-only access token so a browser can watch
//                                   whatever gets published into the room.
//
// OpenVidu Platform is a self-hosted, LiveKit-compatible server, so this uses LiveKit's own
// server SDK (`livekit-server-sdk`) directly -- there's no OpenVidu-specific ingress API.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AccessToken, IngressClient, IngressInput } from 'livekit-server-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const ROOM_NAME = process.env.ROOM_NAME || 'demo-room';
const API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';

// Reached from inside the Docker network (this app -> the OpenVidu/LiveKit API server).
const LIVEKIT_INTERNAL_URL = process.env.LIVEKIT_INTERNAL_URL || 'http://openvidu:7880';

// Handed back to browsers, which run on the host and can't resolve Docker service names.
const LIVEKIT_PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL || 'ws://localhost:7880';

const ingressClient = new IngressClient(LIVEKIT_INTERNAL_URL, API_KEY, API_SECRET);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve the LiveKit browser SDK straight from node_modules -- no bundler needed for a demo
// this small, and it keeps the viewer fully self-hosted (no CDN dependency at runtime).
app.use(
  '/vendor/livekit-client',
  express.static(path.join(__dirname, 'node_modules/livekit-client/dist')),
);

// Creates a fresh WHIP ingress every call. There is no need to create the Room first --
// LiveKit auto-creates a room the moment the first participant (the ingress, here) joins it.
app.post('/api/ingress', async (req, res) => {
  const identity = (req.body && req.body.identity) || `publisher-${randomSuffix()}`;
  try {
    const ingress = await ingressClient.createIngress(IngressInput.WHIP_INPUT, {
      name: identity,
      roomName: ROOM_NAME,
      participantIdentity: identity,
      participantName: identity,
      // For WHIP, LiveKit already defaults to *not* transcoding (the encoder's codec is used
      // as-is), which is what keeps this path low latency. Set explicitly so it's not a magic
      // default someone has to go read the SDK source to discover.
      enableTranscoding: false,
    });

    res.json({
      roomName: ingress.roomName,
      participantIdentity: ingress.participantIdentity,
      // Where an encoder (browser fetch(), OBS, ffmpeg, ...) POSTs its SDP offer.
      url: ingress.url,
      // Sent as `Authorization: Bearer <streamKey>` on that POST.
      streamKey: ingress.streamKey,
    });
  } catch (err) {
    console.error('Failed to create WHIP ingress:', err);
    res.status(502).json({ error: 'Could not create ingress. Is the OpenVidu stack up?' });
  }
});

// Subscribe-only token: this identity can watch the room, but never publish into it.
app.get('/api/viewer-token', async (req, res) => {
  const identity = req.query.identity || `viewer-${randomSuffix()}`;
  const token = new AccessToken(API_KEY, API_SECRET, { identity, ttl: '2h' });
  token.addGrant({
    room: ROOM_NAME,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
  });

  res.json({
    identity,
    roomName: ROOM_NAME,
    token: await token.toJwt(),
    url: LIVEKIT_PUBLIC_URL,
  });
});

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

app.listen(PORT, () => {
  console.log(`low-latency-whip-ingestion app listening on :${PORT}`);
  console.log(`Room: ${ROOM_NAME} | LiveKit (internal): ${LIVEKIT_INTERNAL_URL} | LiveKit (public): ${LIVEKIT_PUBLIC_URL}`);
});
