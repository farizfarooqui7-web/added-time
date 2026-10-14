# Top Bins - Production Deployment Guide

This guide details how to deploy Top Bins to production with PartyKit serverless real-time WebSockets running on Cloudflare's global edge network, and an optimized static frontend (Vercel, Cloudflare Pages, or Netlify).

---

## 1. Deploying the PartyKit Backend (Cloudflare Global Edge)

Top Bins uses PartyKit (`party/main.ts`) for zero-cold-start, serverless real-time WebSockets with room-level multiplayer synchronization and authoritative match state machines.

### Deployment Steps:
1. Ensure dependencies are installed:
   ```bash
   npm install
   ```
2. Log in to PartyKit (first time only):
   ```bash
   npx partykit login
   ```
3. Deploy the backend to the global edge:
   ```bash
   npm run party:deploy
   ```
4. PartyKit will output your live project host:
   ```
   Deploying party/main.ts...
   Deployed to: top-bins.<your-username>.partykit.dev
   ```
5. Copy this host: `top-bins.<your-username>.partykit.dev`.

### Health Check Verification:
- Send a `GET` request to `https://top-bins.<your-username>.partykit.dev/health`
- Returns `200 OK`:
  ```json
  {
    "status": "ok",
    "edge": true,
    "room": "global-lobby",
    "connections": 0,
    "timestamp": "2026-10-14T12:00:00.000Z"
  }
  ```

---

## 2. Deploying the Frontend (Vercel / Cloudflare Pages)

The frontend is a Vite + React SPA that automatically connects to PartyKit in production.

### Option A: Vercel
1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Import your GitHub repository (`top-bins`).
3. Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (or `top-bins` if repository is in a subfolder)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Environment Variables**:
   - Add:
     `VITE_PARTYKIT_HOST` = `top-bins.<your-username>.partykit.dev`
     *(Replace with your actual PartyKit domain)*
5. Click **Deploy**.

### Option B: Cloudflare Pages
1. Go to Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages**.
2. Connect Git repository.
3. Build Settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**:
     `VITE_PARTYKIT_HOST` = `top-bins.<your-username>.partykit.dev`
4. Click **Save and Deploy**.

---

## 3. Alternative: Monolithic Node.js WebSocket Backend (Railway / Render)

If you prefer running the traditional monolithic Node.js server (`partyServer.ts`):
1. **Railway / Render Start Command**: `npm run server:start`
2. **Health Check Path**: `/health`
3. Set Frontend Env: `VITE_WS_URL=wss://your-backend.up.railway.app`

---

## 4. Local Development

To run the full stack locally:
- Run PartyKit WebSocket server:
  ```bash
  npm run party:dev
  ```
  *(Starts on `http://localhost:1999`)*
- Run Vite frontend:
  ```bash
  npm run dev
  ```
  *(Starts on `http://localhost:5173`)*
- Or run both concurrently:
  ```bash
  npm run dev:all
  ```
