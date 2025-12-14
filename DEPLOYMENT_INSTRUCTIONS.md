# Deployment Instructions - Netlify + Nile Database

This guide will help you deploy the SMP Cash Book application to Netlify (frontend) with Nile database integration.

## Architecture Overview

- **Frontend**: React app (in `smp-cashbook/`) → Deploy to **Netlify**
- **Backend**: Express.js API (in `smp-cashbook-backend/`) → Deploy to **Railway/Render/Fly.io**
- **Database**: Nile PostgreSQL → Already configured

## Step 1: Deploy Backend Server

Since Netlify is a static hosting platform, you need to deploy your backend (Express.js server) separately. Here are recommended options:

### Option A: Deploy Backend to Railway (Recommended - Free tier available)

1. Go to https://railway.app/
2. Sign in with GitHub
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Select your repository: `tejukargal/React_SMP-Cash-Book`
5. Choose the **root directory** (or configure to use `smp-cashbook-backend`)
6. Add the following configuration:
   - **Root Directory**: `smp-cashbook-backend`
   - **Build Command**: Leave empty (Node.js auto-detected)
   - **Start Command**: `node server.js`
7. Add Environment Variables:
   - `NILE_CONNECTION_STRING`: `postgres://019b1350-f28f-76f2-ab19-fe14bb494979:63597054-be0b-4454-bcf0-f5d7d575fee1@us-west-2.db.thenile.dev:5432/smp_cashbook`
   - `PORT`: `3001` (Railway will auto-assign, but this is fallback)
   - `NODE_ENV`: `production`
8. Click **"Deploy"**
9. Once deployed, Railway will give you a public URL like: `https://your-app.railway.app`
10. **Important**: Copy this URL - you'll need it for frontend configuration

### Option B: Deploy Backend to Render

1. Go to https://render.com/
2. Sign in with GitHub
3. Click **"New +"** → **"Web Service"**
4. Connect your repository: `tejukargal/React_SMP-Cash-Book`
5. Configure:
   - **Name**: `smp-cashbook-backend`
   - **Root Directory**: `smp-cashbook-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. Add Environment Variables (same as Railway above)
7. Click **"Create Web Service"**
8. Copy the deployed URL (e.g., `https://smp-cashbook-backend.onrender.com`)

### Option C: Deploy Backend to Fly.io

1. Install Fly CLI: `npm install -g flyctl`
2. Login: `fly auth login`
3. Navigate to backend: `cd smp-cashbook-backend`
4. Initialize: `fly launch` (follow prompts)
5. Set secrets:
   ```bash
   fly secrets set NILE_CONNECTION_STRING="postgres://019b1350-f28f-76f2-ab19-fe14bb494979:63597054-be0b-4454-bcf0-f5d7d575fee1@us-west-2.db.thenile.dev:5432/smp_cashbook"
   ```
6. Deploy: `fly deploy`

## Step 2: Update Frontend Configuration

Once your backend is deployed, you need to update the frontend to point to your backend URL.

You'll need to set the `VITE_API_BASE_URL` environment variable in Netlify to point to your backend.

**Example**: If your Railway backend URL is `https://your-app.railway.app`, then:
- `VITE_API_BASE_URL` = `https://your-app.railway.app/api`

## Step 3: Deploy Frontend to Netlify via GitHub

### 3.1 Go to Netlify Dashboard

1. Visit: https://app.netlify.com
2. Sign in with your GitHub account (or create an account)

### 3.2 Import Your GitHub Repository

1. Click **"Add new site"** → **"Import an existing project"**
2. Click **"Deploy with GitHub"**
3. Authorize Netlify to access your GitHub account (if not already authorized)
4. Search for and select your repository: **`tejukargal/React_SMP-Cash-Book`**

### 3.3 Configure Build Settings

Netlify should auto-detect your `netlify.toml` configuration, but verify these settings:

- **Base directory**: `smp-cashbook`
- **Build command**: `npm run build`
- **Publish directory**: `smp-cashbook/dist`

### 3.4 Add Environment Variables

**CRITICAL**: Before deploying, add this environment variable:

1. In the Netlify dashboard, go to **"Site configuration"** → **"Environment variables"**
2. Click **"Add a variable"** → **"Add a single variable"**
3. Add:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://your-backend-url.railway.app/api` (replace with your actual backend URL from Step 1)
   - **Scopes**: Select all (Production, Deploy Previews, Branch deploys)

### 3.5 Deploy

1. Click **"Deploy [your-site-name]"**
2. Netlify will start building your site
3. Wait for the build to complete (usually 2-3 minutes)
4. Once deployed, Netlify will give you a URL like: `https://random-name.netlify.app`

### 3.6 Custom Domain (Optional)

1. In Netlify dashboard, go to **"Domain management"**
2. Click **"Add a domain"**
3. Follow the instructions to add your custom domain

## Step 4: Verify Deployment

1. Visit your Netlify URL
2. Test the application:
   - Create a new entry (Receipt or Payment)
   - View transactions
   - Generate reports
   - Import CSV files

3. Open browser DevTools → Network tab to verify:
   - Frontend is loading from Netlify
   - API calls are going to your backend URL
   - Database operations are working

## Step 5: Enable Continuous Deployment

Your deployment is now set up with continuous deployment! This means:

- **Every push to `main` branch** → Automatically deploys to Netlify
- **Pull requests** → Netlify creates preview deployments
- **Backend updates** → Railway/Render auto-deploys on push

## Troubleshooting

### Frontend shows "Failed to fetch"
- Check that `VITE_API_BASE_URL` is correctly set in Netlify
- Verify backend is running (visit backend URL in browser)
- Check browser console for CORS errors

### CORS Errors
Your backend (`server.js`) already has CORS enabled with `app.use(cors())`. If you still have issues:
1. Update backend to allow specific origin:
   ```javascript
   app.use(cors({
     origin: 'https://your-netlify-app.netlify.app'
   }));
   ```
2. Redeploy backend

### Build Fails on Netlify
- Check build logs in Netlify dashboard
- Verify all dependencies are in `package.json`
- Make sure base directory is set to `smp-cashbook`

### Database Connection Issues
- Verify `NILE_CONNECTION_STRING` is correct in backend environment
- Check Nile dashboard to ensure database is active
- Test connection directly from backend logs

## Security Checklist

- ✅ `.env` files are in `.gitignore` (not committed to GitHub)
- ✅ Environment variables are set in hosting platforms (not hardcoded)
- ✅ HTTPS is enabled (Netlify and Railway provide this automatically)
- ✅ CORS is properly configured
- ⚠️ Consider adding authentication for production use
- ⚠️ Consider rate limiting for API endpoints

## Monitoring & Maintenance

### Logs
- **Frontend**: Netlify Dashboard → Deploys → Build logs
- **Backend**: Railway/Render Dashboard → Logs
- **Database**: Nile Dashboard → Monitor queries

### Updates
1. Make changes locally
2. Test locally
3. Commit and push to GitHub
4. Automatic deployment triggers
5. Verify in production

## Support Resources

- **Netlify Docs**: https://docs.netlify.com/
- **Railway Docs**: https://docs.railway.app/
- **Render Docs**: https://render.com/docs
- **Nile Docs**: https://docs.thenile.dev/

## Cost Estimate (Free Tiers)

- **Netlify**: Free (100GB bandwidth, 300 build minutes/month)
- **Railway**: Free tier with $5/month credit (then pay-as-you-go)
- **Render**: Free (services may spin down after inactivity)
- **Nile Database**: Free tier available

---

## Quick Reference - Your URLs

After deployment, note down your URLs:

- **Frontend (Netlify)**: `https://______.netlify.app`
- **Backend (Railway/Render)**: `https://______.railway.app` or `.onrender.com`
- **Database (Nile)**: `us-west-2.db.thenile.dev:5432/smp_cashbook`

Good luck with your deployment! 🚀
