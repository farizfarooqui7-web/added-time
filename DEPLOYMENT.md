# Top Bins - Production Deployment Guide

This guide details how to deploy Top Bins to production using Cloudflare's official PartyServer architecture deployed via Wrangler, and an optimized static frontend (Vercel, Cloudflare Pages, or Netlify).

---

## 1. Deploying the PartyServer Backend (Cloudflare Workers + Durable Objects)

Top Bins uses Cloudflare's official `partyserver` package (`party/main.ts`) for zero-cold-start, serverless real-time WebSockets with room-level multiplayer synchronization and authoritative match state machines.

### Deployment Steps:
1. Ensure dependencies are installed:
   ```bash
   npm install
   ```
2. Log in to Cloudflare with Wrangler (first time only):
   ```bash
   npx wrangler login
   ```
3. Deploy the backend to Cloudflare:
   ```bash
   npm run deploy:server
   ```
4. Wrangler will output your live worker domain:
   ```
   Uploaded top-bins-server
   Deployed to: https://top-bins-server.<your-subdomain>.workers.dev
   ```
5. Copy this host: `top-bins-server.<your-subdomain>.workers.dev`.

### Health Check Verification:
- Send a `GET` request to `https://top-bins-server.<your-subdomain>.workers.dev/health`
- Returns `200 OK`:
  ```json
  {
    "status": "ok",
    "edge": true,
    "service": "top-bins-partyserver",
    "timestamp": "2026-10-14T12:00:00.000Z"
  }
  ```

---

## 2. Deploying the Frontend (Vercel / Cloudflare Pages)

The frontend is a Vite + React SPA that automatically connects to PartyServer in production.

### Option A: Vercel
1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Import your GitHub repository (`top-bins`).
3. Project Settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Environment Variables**:
   - Add:
     `VITE_PARTYKIT_HOST` = `top-bins-server.<your-subdomain>.workers.dev`
     *(Replace with your actual Cloudflare Workers domain)*
5. Click **Deploy**.

### Option B: Cloudflare Pages
1. Go to Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages**.
2. Connect Git repository.
3. Build Settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**:
     `VITE_PARTYKIT_HOST` = `top-bins-server.<your-subdomain>.workers.dev`
4. Click **Save and Deploy**.

---

## 3. Alternative: Monolithic Node.js WebSocket Backend (Railway / Render)

If you prefer running the traditional monolithic Node.js server (`partyServer.ts`):
1. **Start Command**: `npm run server:start`
2. **Health Check Path**: `/health`
3. Set Frontend Env: `VITE_WS_URL=wss://your-backend.up.railway.app`

---

## 4. Local Development

To run the full stack locally:
- Run PartyServer via Wrangler:
  ```bash
  npm run server:dev
  ```
  *(Starts on `http://localhost:8787`)*
- Run Vite frontend:
  ```bash
  npm run dev
  ```
  *(Starts on `http://localhost:5173`)*
- Or run both concurrently:
  ```bash
  npm run dev:all
  ```
