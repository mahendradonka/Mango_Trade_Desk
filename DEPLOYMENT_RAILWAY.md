# Mango Trade Desk - Railway Deployment Guide

This guide deploys the app to Railway with a managed Postgres database so you can use it on multiple devices.

## 1. Prepare a GitHub repo
1. Create a GitHub repository.
2. Push the full `Mango_APP` folder to the repo root.

Suggested commands:

```powershell
cd c:\Mango_APP
git init
git add .
git commit -m "Initial mango trade desk"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 2. Create a Railway project
1. Sign in to Railway.
2. New Project -> Deploy from GitHub.
3. Choose the repo you just pushed.

Railway will detect the `Dockerfile` and build automatically.

## 3. Add Postgres
1. In the Railway project, click "Add" -> "Database" -> "PostgreSQL".
2. Railway will create `DATABASE_URL` automatically.

## 4. Set the service to use the Railway PORT
Railway already sets the `PORT` env var. The app reads it automatically.

## 5. Deploy
1. Wait for the build to finish.
2. Open the public Railway URL from the service page.

## 6. Use on mobile
Open the Railway URL in any phone browser. The same login and data are shared.

## Troubleshooting
- If you see a blank screen, open the service logs and confirm the container is running.
- If login fails, reset the PIN inside Settings after the first login.

## Data migration
Local data in `Database/mango.db` does not move to the cloud by default. Ask to add export/import if you want to move existing data.
