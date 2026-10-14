# Top Bins - Production Deployment Guide

This guide details how to deploy Top Bins to production with a standalone real-time WebSocket backend (Railway, Render, or Fly.io) and an optimized static frontend (Vercel, Cloudflare Pages, or Netlify).

---

## 1. Deploying the WebSocket Backend (Railway / Render / Fly.io)

The backend (`partyServer.ts`) runs an HTTP + WebSocket server with an integrated health check endpoint (`GET /health`) and dynamic port binding (`process.env.PORT`).

### Option A: Railway (Recommended)
1. Go to [railway.app](https://railway.app) and create a **New Project**.
2. Select **Deploy from GitHub repo** and choose your repository.
3. Under **Settings**:
   - **Root Directory**: `top-bins` (or root if repository is top-level).
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server:start`
   - **Healthcheck Path**: `/health`
4. Under **Networking**:
   - Click **Generate Domain** (e.g., `top-bins-production.up.railway.app`).
   - Copy this URL. Your WebSocket URL will be:
     `wss://top-bins-production.up.railway.app`

### Option B: Render
1. Go to [render.com](https://render.com) and create a **New Web Service**.
2. Connect your repository.
3. Set configuration:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server:start`
   - **Health Check Path**: `/health`
4. Render automatically supplies `process.env.PORT`. Copy your service URL:
   `wss://your-service-name.onrender.com`

---

## 2. Deploying the Frontend (Vercel / Cloudflare Pages)

The frontend is a Vite + React SPA that automatically connects to secure WebSocket (`wss://`) in production.

### Option A: Vercel
1. Go to [vercel.com](https://vercel.com) and click **Add New Project**.
2. Import your repository.
3. Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `top-bins` (if in subfolder)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Environment Variables**:
   - Add:
     `VITE_WS_URL` = `wss://your-backend.up.railway.app`
     *(Replace with your actual Railway/Render backend domain)*
5. Click **Deploy**.

### Option B: Cloudflare Pages
1. Go to Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages**.
2. Connect Git repository.
3. Build Settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**:
     `VITE_WS_URL` = `wss://your-backend.up.railway.app`
4. Click **Save and Deploy**.

---

## 3. Architecture & Health Check Verification

- **HTTP Health Check**:
  - Send a `GET` request to `https://your-backend.up.railway.app/health`
  - Returns `200 OK`:
    ```json
    {
      "status": "ok",
      "service": "top-bins-ws",
      "uptime": 120,
      "activeRooms": 2,
      "activeClients": 4,
      "timestamp": "2026-10-14T12:00:00.000Z"
    }
    ```

- **Client WebSocket URL Fallback Matrix**:
  - If `VITE_WS_URL` is set: uses explicit remote domain (`wss://...`).
  - If loaded over `https://` without env var: defaults to `wss://${window.location.host}`.
  - If running locally on `http://localhost`: defaults to `ws://localhost:3001`.
