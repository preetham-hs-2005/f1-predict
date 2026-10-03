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
| `RESEND_API_KEY` | Your Resend sending API key (`re_...`); store in Render, never Git. The existing `SMTP_PASS` value is also accepted. |
| `SMTP_FROM` | `F1 Predictor Pro <noreply@f1predict.dev>` |
| `REMINDER_JOB_SECRET` | A unique random value of at least 32 characters, shared only with GitHub Actions |

If the service root directory is `server`, use build command `npm ci --include=dev && npm run build` and start command `node dist/server.js`. If its root directory is the repository root, use `cd server && npm ci --include=dev && npm run build` and `cd server && node dist/server.js`. Set the HTTP health-check path to `/health`. Keep any existing `PORT` setting; Render supplies one automatically if omitted.

The API sends mail through Resend's HTTPS API. Render Free blocks outgoing SMTP ports, so SMTP transport cannot deliver production mail. Password-reset mail is sent directly; registration creates a welcome-mail job in MongoDB, so the job runner below is required to deliver it.

## 3. Free mail and reminder runner with GitHub Actions

This repository is public, so standard GitHub-hosted Actions runners are free. The workflow in `.github/workflows/race-reminders.yml` runs every five minutes on the default `main` branch and can also be started manually. It calls the Render API's protected reminder endpoint, which queues due notices and sends pending mail. The existing Render web service wakes if asleep; the workflow allows four minutes for this request.

- Generate a unique random `REMINDER_JOB_SECRET` of at least 32 characters. Add it to the **Render web service** Environment and to this GitHub repository's **Actions repository secrets** with exactly the same name and value. Never add it to Git, Vercel, or browser code.
- In GitHub Actions, enable the `Race reminders` workflow and use **Run workflow** once to verify its response is `{"success":true}`. The workflow uses a `2/5 * * * *` UTC schedule. Leave the Render web service's health-check path at `/health`.
- The API also checks reminders once per minute while its process is awake. MongoDB keys and mail leases make overlapping runs safe. Render Free can sleep when idle, so this check cannot replace an external schedule.

MongoDB keys prevent duplicate notices. The Monday race-week email is scheduled at 09:00 India time. Qualifying emails and in-app notices are queued during the full hour before the session. A delayed or failed run after the session starts skips the time-sensitive alert. Cancelled and completed races, sessions already started, and race times without a time zone are skipped. Admin race times are entered in India time and saved with an explicit UTC offset. Make sure the race calendar is accurate before enabling the workflow.

GitHub scheduled runs can be delayed or dropped during high load, and public-repository schedules are disabled after 60 days without repository activity. This free setup cannot guarantee exact one-hour timing; check Actions run history before race weekends. Render Cron Jobs or an always-on worker provide more predictable timing but require a paid plan.

## 4. Verify after deployment

1. Open `https://f1-predictor-pro.onrender.com/health` and confirm a success response.
2. Open `https://f1predict.dev` and confirm the frontend loads races and auth without CORS errors.
3. Request a password reset for an account you control. The email should come from `noreply@f1predict.dev` and link to `https://f1predict.dev/reset-password?...`.
4. Register a new test account, manually run `Race reminders` in GitHub Actions, and check the welcome email. Existing accounts do not get a welcome email retroactively.
5. Check the workflow run logs and the MongoDB `mailJobs` collection for `sent` or retrying `pending` jobs. Review the race calendar before the next scheduled race reminder.

Never put the Resend key, MongoDB URI, or JWT secret in the repository, GitHub Actions, or Vercel frontend environment variables. Only the Render API needs them; GitHub Actions holds the narrow reminder-job token.
