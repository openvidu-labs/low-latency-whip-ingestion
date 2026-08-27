// A minimal, dependency-free WHIP (WebRTC-HTTP Ingestion Protocol, RFC 9725) publisher.
//
// This is deliberately hand-written instead of pulled from a library: the whole point of this
// demo is to show that WHIP is *just* an HTTP+SDP handshake around a normal RTCPeerConnection --
// there is no magic browser API for it.
//
// The flow (non-trickle ICE, i.e. we wait for all candidates before sending the offer -- simpler
// and reliable for a local demo; a production publisher would usually trickle instead):
//
//   1. Create an RTCPeerConnection, add sendonly transceivers for the local tracks.
//   2. createOffer() / setLocalDescription(), then wait for ICE gathering to finish so the SDP
//      already contains every candidate.
//   3. POST that SDP (Content-Type: application/sdp) to the WHIP endpoint, with the ingress's
//      stream key as a Bearer token.
//   4. The server answers 201 Created with the SDP answer as the body, and a `Location` header
//      pointing at a resource you can DELETE later to end the session.
//   5. setRemoteDescription() with that answer. The connection is now flowing.

export class WHIPClient {
  /**
   * @param {string} url - the WHIP endpoint (Ingress.url from POST /api/ingress).
   * @param {string} token - the WHIP bearer token (Ingress.streamKey from POST /api/ingress).
   */
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.pc = null;
    this.resourceUrl = null;
  }

  /** @param {MediaStream} stream - local camera/mic stream to publish. */
  async publish(stream) {
    this.pc = new RTCPeerConnection({ iceServers: [] });

    for (const track of stream.getTracks()) {
      this.pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(this.pc);

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        Authorization: `Bearer ${this.token}`,
      },
      body: this.pc.localDescription.sdp,
    });

    if (!response.ok) {
      throw new Error(`WHIP POST failed: ${response.status} ${await response.text()}`);
    }

    // `Location` is only readable here if the server exposes it via
    // Access-Control-Expose-Headers -- if it doesn't, we simply can't send a clean DELETE
    // later, and fall back to just closing the peer connection.
    const location = response.headers.get('Location');
    this.resourceUrl = location ? new URL(location, this.url).toString() : null;

    const answerSdp = await response.text();
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  /** Ends the WHIP session and releases the peer connection. */
  async stop() {
    if (this.resourceUrl) {
      try {
        await fetch(this.resourceUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.token}` },
        });
      } catch {
        // Best effort -- closing the peer connection below ends the session either way.
      }
    }
    this.pc?.close();
    this.pc = null;
    this.resourceUrl = null;
  }
}

function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    function check() {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}
