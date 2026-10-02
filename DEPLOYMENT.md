# Production deployment: Vercel + Render

The website is served by Vercel at `https://f1predict.dev` (also `https://f1-predictor-pro-six.vercel.app`). Its API is the existing Render web service at `https://f1-predictor-pro.onrender.com`. Changes land on `main`; this Vercel project currently deploys production from `prod`, so release by fast-forwarding `prod` to the same commit. Verify the connected branch of the existing Render service in its dashboard.

## 1. Vercel frontend

- Project root: repository root. Build command: `npm run build`. Output directory: `dist`.
- Production environment variable: `VITE_API_URL=https://f1-predictor-pro.onrender.com`. The tracked `.env.production` has the same value, but a Vercel dashboard override takes precedence. Check it if the deployed site still calls an old API.
- The Vercel Production Branch is currently `prod`. A push to `main` creates a preview; fast-forward `prod` to the release commit to update `f1predict.dev`.

## 2. Existing Render API web service

Keep the current `MONGODB_URI` and `JWT_SECRET` values. Changing `JWT_SECRET` signs out every user. In the Render Dashboard, confirm the `f1-predictor-pro` web service is connected to this repository, check its deployment branch, and manually deploy the release commit if automatic deployment has not happened. Set:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://f1predict.dev` |
| `CORS_ORIGINS` | `https://f1predict.dev,https://www.f1predict.dev,https://f1-predictor-pro-six.vercel.app` |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | Your Resend sending API key (`re_...`); store in Render, never Git |
| `SMTP_FROM` | `F1 Predictor Pro <noreply@f1predict.dev>` |

If the service root directory is `server`, use build command `npm ci --include=dev && npm run build` and start command `node dist/server.js`. If its root directory is the repository root, use `cd server && npm ci --include=dev && npm run build` and `cd server && node dist/server.js`. Set the HTTP health-check path to `/health`. Keep any existing `PORT` setting; Render supplies one automatically if omitted.

The API sends password-reset mail directly. Registration creates a welcome-mail job in MongoDB, so the job runner below is required to deliver it.

## 3. One-minute mail and reminder runner on Render

Create **one** Render Cron Job from this repository, branch `main`. A cron job is separate from the web service and runs even when the web service is asleep.

- Root directory: `server`
- Build command: `npm ci --include=dev && npm run build`
- Schedule: `* * * * *` (every minute; Render interprets cron schedules in UTC)
- Command: `npm run worker:once`
- Environment variables: the same `MONGODB_URI`, `NODE_ENV`, `APP_URL`, and five `SMTP_*` values as the API. A Render environment group can share these between the two services. Do **not** create a second cron job or run a continuous worker alongside it.

Each run queues due race notices, sends queued mail, and exits. MongoDB keys prevent duplicate notices. The Monday race-week email is scheduled at 09:00 India time. The qualifying emails and in-app notices are queued in the first two minutes of the one-hour-before-session window. A delayed or failed run outside that window skips the time-sensitive alert. Cancelled and completed races, sessions already started, and race times without a time zone are skipped. Make sure the race calendar is accurate before enabling the cron job.

Render does not provide Free instances for cron jobs or background workers. Its [cron pricing](https://render.com/docs/cronjobs) currently has a $1/month minimum per job plus runtime charges. An always-on Background Worker is an alternative: use root `server`, the same build command and environment variables, and start command `npm run start:worker`; it costs more because it runs continuously. Choose **one** runner.

## 4. Verify after deployment

1. Open `https://f1-predictor-pro.onrender.com/health` and confirm a success response.
2. Open `https://f1predict.dev` and confirm the frontend loads races and auth without CORS errors.
3. Request a password reset for an account you control. The email should come from `noreply@f1predict.dev` and link to `https://f1predict.dev/reset-password?...`.
4. Register a new test account, run the cron job manually once in Render, and check the welcome email. Existing accounts do not get a welcome email retroactively.
5. Check the Render Cron Job's run logs and the MongoDB `mailJobs` collection for `sent` or retrying `pending` jobs. Review the race calendar before the next scheduled race reminder.

Never put the Resend key, MongoDB URI, or JWT secret in the repository or Vercel frontend environment variables. Only the Render API and runner need them.
