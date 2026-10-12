# Park Safety & People Level 10 Dashboard

A shared, database-backed EOS workspace for Park Construction's Safety & People team. It includes the weekly Scorecard, quarterly Rocks and milestones, seven-day To-Dos, Headlines, IDS issues and resolutions, a Park-specific 60-minute Meeting Mode, permanent session history, and individual/team performance trends.

## Meeting workflow

- Meeting Mode follows the team's 60-minute agenda: Segue, Scorecard, Rocks, Headlines, To-Dos, IDS, and Conclude.
- Scorecard, Rock, and To-Do decisions are made in Meeting Mode against the same records shown in the review/editing sections. There is no duplicate meeting-only data.
- **Drop Down** creates an IDS issue without navigating away from the current meeting section.
- In Meeting Mode, open IDS items use three exclusive discussion slots: **1**, **2**, and **3**. Solving an item immediately frees its slot for the next round.
- The sidebar IDS page is for reviewing, adding, editing, and viewing solved history; prioritization and solving happen in Meeting Mode.

## Persistence

- Production records live in a Render-managed PostgreSQL database through `DATABASE_URL`; browser storage is not used.
- Every authorized device reads and writes the same database, so a refresh, new browser, or application redeploy does not erase team data.
- The table is created automatically at application startup. Seed data is inserted only when the database is empty.
- The former Sites records are supplied once through the private `MIGRATION_PAYLOAD_BASE64` Render secret. Pilot data is never committed to the public source repository. After PostgreSQL has records, the payload is never reapplied and cannot overwrite live changes.
- Status changes append dated history events used by the Command Center graphs.
- Backups and retention are controlled by the Render PostgreSQL plan. Review that plan before using the dashboard as the system of record for sensitive or regulated information.

## Render deployment

`render.yaml` provisions both parts of the production environment:

1. A Node web service running the Next.js application.
2. A managed PostgreSQL database wired to the app as `DATABASE_URL` over Render's private network.

Deploy through a Render Blueprint after this repository is pushed to GitHub. Render will install the locked dependencies, run `pnpm build`, start the app with `pnpm start`, and verify `/api/health`. The Blueprint uses the free plans by default; review current Render limits, database expiration/retention, and upgrade options before relying on it for long-term production use.

Render assigns a public `onrender.com` URL, so this migration adds an application-level password gate. The username defaults to `park`; `DASHBOARD_PASSWORD` is a required Render secret and is never stored in Git. This is appropriate for a small pilot, but organization single sign-on and named user auditing should replace shared credentials before a broad rollout.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm
- A PostgreSQL database

Set `DATABASE_URL`, then run:

```sh
npm install
npm run dev
```

For a production check:

```sh
npm run build
npm start
```

Open `/api/health` to verify both the web application and database connection. A successful response is:

```json
{"status":"ok","database":"connected"}
```

## Operational notes

- The GitHub repository contains application source only. Existing pilot records are transferred directly to Render as a temporary secret and are not published in Git history.
- Store the shared dashboard password in Park's approved password manager and rotate it in Render when team membership changes.
- Do not delete the PostgreSQL instance during a normal app redeploy. A replacement database starts empty and would reseed from the migration file.
- Before replacing or moving the database, create a PostgreSQL backup and restore it into the new instance.
- The old Sites deployment and its D1 database remain separate. Changes made there after this export do not automatically synchronize to Render.

