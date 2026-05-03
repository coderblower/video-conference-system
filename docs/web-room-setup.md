# Mediasoup Web Meet Setup

## What changed

- The web meeting flow now uses `mediasoup` as an SFU instead of browser-to-browser mesh.
- Join still happens with `roomId` / room key.
- Each room is limited to `4` participants.
- Screen sharing uses media swap on the existing video producer with `replaceTrack`.
- UI remains meet-style and web-only.

## Added socket events

- `mediasoup-room:join`
- `mediasoup-room:create-transport`
- `mediasoup-room:connect-transport`
- `mediasoup-room:produce`
- `mediasoup-room:get-producers`
- `mediasoup-room:consume`
- `mediasoup-room:resume-consumer`
- `mediasoup-room:media-state`
- `mediasoup-room:leave`

## Backend install

From the project root:

```bash
cd video-conference-system
npm install
```

`mediasoup` builds native binaries. Build tools must exist on the server.

Typical Ubuntu packages:

```bash
sudo apt update
sudo apt install -y build-essential python3 pkg-config
```

## Backend env

Set these values in `.env`:

```env
PORT=3001
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=YOUR_PUBLIC_SERVER_IP
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=49999
MEDIASOUP_LOG_LEVEL=warn
```

Notes:

- `MEDIASOUP_ANNOUNCED_IP` must be the public IP or DNS-facing IP clients can reach.
- Open UDP/TCP port range `40000-49999` on the server firewall.

## Backend run

```bash
cd video-conference-system
npm run dev
```

Yes, mediasoup runs from the existing `server_entry.js`. You do not need a separate mediasoup server file.

## Frontend install

In another terminal:

```bash
cd video-conference-system/frontend/my-react-app
npm install
```

Create or update frontend `.env`:

```env
VITE_SOCKET_URL=http://localhost:3001
```

For production:

```env
VITE_SOCKET_URL=https://your-domain-or-socket-host
```

Run frontend:

```bash
npm run dev
```

Or from the backend root:

```bash
cd video-conference-system
npm run client:dev
```

## Serve the built frontend from `public/`

The Vite build is configured to output into:

```text
video-conference-system/public/meet
```

Build it with:

```bash
cd video-conference-system
npm run client:build
```

After that, the existing backend serves the built app from:

```text
http://localhost:3001/meet
```

Room URLs work from the same backend:

```text
http://localhost:3001/meet/room/meet-7284
```

## How join works

1. Open the web app landing page.
2. Enter your display name.
3. Enter a room key or click `Create new room`.
4. The app navigates to:

```text
/room/<roomId>
```

Example:

```text
/room/meet-7284
```

That `roomId` is the join key. Share it with the other participants.

## Capacity rule

- Maximum `4` users per room.
- The 5th user receives a room-full error.

## Media behavior

- Audio is produced once and distributed by mediasoup.
- Video is produced once and distributed by mediasoup.
- `Present now` swaps the video producer track from camera to screen.
- Turning camera off pauses the video producer.
- Turning mic off pauses the audio producer.

## Deployment notes

- If frontend and backend are on different origins, keep Socket.IO CORS enabled.
- For HTTPS deployments, run the frontend and signaling endpoint over TLS.
- If the server is behind NAT, `MEDIASOUP_ANNOUNCED_IP` is mandatory.
- STUN/TURN is not the transport model here; mediasoup handles SFU routing, but proper public IP and firewall rules are still required.
