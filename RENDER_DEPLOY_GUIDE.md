# Deploying to Render

## Step 1 — Push the middleware to GitHub

Render deploys from a Git repo (not a zip upload), so first push this project:

```bash
cd rays-middleware
git init
git add .
git commit -m "Initial middleware"
```

Create a new repo on GitHub (private is fine), then:
```bash
git remote add origin https://github.com/<your-username>/rays-dynamics-middleware.git
git branch -M main
git push -u origin main
```

## Step 2 — Deploy via Blueprint (render.yaml)

This project already includes a `render.yaml` that defines both the web service and a PostgreSQL database — Render can set both up in one go:

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect your GitHub account and select the repo you just pushed
3. Render reads `render.yaml` automatically and shows you the plan (1 web service + 1 database) — click **Apply**
4. It will provision the Postgres database first, then build and deploy the web service (build takes a few minutes — it runs `npm install`, `prisma generate`, `tsc build`, then on start runs `prisma migrate deploy` to create your tables automatically)

## Step 3 — Seed device types

Render's free plan doesn't give you SSH, but you can run one-off commands from the dashboard:
Dashboard → your service → **Shell** tab → run:
```bash
npm run prisma:seed
```

## Step 4 — Get your URLs

Once deployed, Render gives you a URL like:
```
https://rays-dynamics-middleware.onrender.com
```

- REST base: `https://rays-dynamics-middleware.onrender.com/v1`
- App WS: `wss://rays-dynamics-middleware.onrender.com/ws/app`
- Device WS: `wss://rays-dynamics-middleware.onrender.com/ws/device`

Render terminates SSL for you automatically — no cert setup needed, and `wss://` (secure WebSocket) works out of the box.

## Step 5 — Test with Postman (exactly like the local guide, just swap the URL)

Same signup → verify-otp → login → create home → create room flow as before, just point Postman at your Render URL instead of `localhost:4000`.

## ⚠️ About the free plan

The `render.yaml` here uses the **Starter** plan ($7/mo) for the web service — deliberately, because Render's **free** web services sleep after 15 minutes of inactivity and take 30-60s to wake up on the next request. For a REST API that's just annoying; for a **persistent WebSocket connection** (which is how devices and the app stay live-connected) it's actively broken — the connection gets killed when the service sleeps.

If you want to try free first to just poke around, change `plan: starter` to `plan: free` in `render.yaml` before deploying — just know the device simulator below will disconnect if you leave it idle. Switch to Starter (or a proper VPS, as originally planned) once you're doing real connectivity testing.

The free **database** is fine for now (it just expires after 90 days, which is enough runway for this test phase).
