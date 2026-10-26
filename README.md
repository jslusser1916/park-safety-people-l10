# Park Safety & People Level 10 Dashboard

A shared, database-backed EOS workspace for Park Construction's Safety & People team. It includes the weekly Scorecard, quarterly Rocks and milestones, seven-day To-Dos, Headlines, IDS issues and resolutions, a Park-specific 60-minute Meeting Mode, permanent session history, and individual/team performance trends.

## Meeting workflow

- Meeting Mode follows the team's 60-minute agenda: Segue, Scorecard, Rocks, Headlines, To-Dos, IDS, and Conclude.
- Scorecard, Rock, and To-Do decisions are made in Meeting Mode against the same records shown in the review/editing sections. There is no duplicate meeting-only data.
- **Drop Down** creates an IDS issue without navigating away from the current meeting section.
- In Meeting Mode, open IDS items use three exclusive discussion slots: **1**, **2**, and **3**. Solving an item immediately frees its slot for the next round.
- The sidebar IDS page is for reviewing, adding, editing, and viewing solved history; prioritization and solving happen in Meeting Mode.
- Drop Down uses the original item title and never changes its On Track/Off Track or Done/Not Done status. Existing automatically generated status labels are removed from open linked IDS issues when they still match the original generated title.
- Segue, Headlines, and the review sections no longer contain section-notes inputs. IDS can be marked solved without a decision/solution input; saved historical resolutions remain intact.
- Scorecard, Rock Review, Headlines, To-Do Review, and IDS each provide a blank Add To-Do form. IDS-linked To-Dos also start with an empty commitment and owner rather than copying the issue wording.
- Conclude shows the exact saved To-Dos assigned during that meeting, including owner, due date, and current status. The completed meeting retains an immutable assignment snapshot for later review.
- Each IDS item supports multiple distinct To-Dos directly below the issue. The saved actions remain visible with individual edit controls, and saving leaves a blank form open for the next action. New actions always get new IDs rather than overwriting the first linked To-Do.
- To-Do owner menus include **All Team** in Meeting Mode and the sidebar editor. This saves one shared commitment with its own Open/Done status; it does not add a fictitious member to the meeting-rating roll call. Shared ownership is displayed in the To-Do list and meeting recap, and Meeting Mode can filter To-Dos by All Team.
- To-Dos have only **Open** and **Done** views, in both the sidebar and Meeting Mode. Previously archived records are classified by their saved completion status. Saving a meeting no longer archives incomplete commitments; they remain Open until checked Done.
- Moving between meeting sections resets the page to the top. The Conclude recap can recover the pending meeting link from saved To-Dos after refreshing or returning from another page.

### Regression checks

Run `node tests/meeting-workflow.cjs` for isolated component interaction checks covering status tabs, legacy archived records, neutral Drop Down behavior, blank forms in all five applicable sections, IDS solving, Conclude recap, rating requirements, save behavior, and failed-save retry. The checks do not access production data.

## Persistence

- Production records live in a Render-managed PostgreSQL database through `DATABASE_URL`; browser storage is not used.
- Every authorized device reads and writes the same database, so a refresh, new browser, or application redeploy does not erase team data.
- The table is created automatically at application startup. Seed data is inserted only when the database is empty.
- The former Sites records are supplied once through the private `MIGRATION_PAYLOAD_BASE64` Render secret. Operational data is never committed to the public source repository. After PostgreSQL has records, the payload is never reapplied and cannot overwrite live changes.
- Status changes append dated history events used by the Command Center graphs.
- Backups and retention are controlled by the Render PostgreSQL plan. Review that plan before using the dashboard as the system of record for sensitive or regulated information.

## Render deployment

`render.yaml` provisions both parts of the production environment:

1. A Node web service running the Next.js application.
2. A managed PostgreSQL database wired to the app as `DATABASE_URL` over Render's private network.

Deploy through a Render Blueprint after this repository is pushed to GitHub. Render will install the locked dependencies, run `pnpm build`, start the app with `pnpm start`, and verify `/api/health`. The Blueprint uses the free plans by default; review current Render limits, database expiration/retention, and upgrade options before relying on it for long-term production use.

Render assigns a public `onrender.com` URL, so this migration adds an application-level password gate. The username defaults to `park`; `DASHBOARD_PASSWORD` is a required Render secret and is never stored in Git. Organization single sign-on and named user auditing are recommended when the dashboard needs individual access control.

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

- The GitHub repository contains application source only. Existing operational records are transferred directly to Render as a temporary secret and are not published in Git history.
- Store the shared dashboard password in Park's approved password manager and rotate it in Render when team membership changes.
- Do not delete the PostgreSQL instance during a normal app redeploy. A replacement database starts empty and would reseed from the migration file.
- Before replacing or moving the database, create a PostgreSQL backup and restore it into the new instance.
- The old Sites deployment and its D1 database remain separate. Changes made there after this export do not automatically synchronize to Render.


