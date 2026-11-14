# Flow

Flow lets people in Nairobi report water leaks from their phones, and helps the water utility decide which leaks to fix first.

A citizen takes a photo, confirms the location and sends the report. Flow then:
- groups duplicate reports of the same leak
- estimates how serious each leak is
- gives dispatchers a ranked repair list, with the reasons behind every score

The citizen follows their report, by SMS or on the status page, until it's **Fixed**.

The citizen side is a mobile-first **progressive web app (PWA)**. It can be added to the home screen, works on weak connections, and keeps unsent reports on the phone until the connection comes back.

---

## Run it

```bash
docker compose up --build
```

| What | Where |
|---|---|
| Citizen app (PWA) and staff screens | http://localhost:8080 |
| API (direct) | http://localhost:8081/healthz |
| MinIO console | http://localhost:9001 (`flowminio` / `flowminio-secret`) |
| Postgres + PostGIS | `localhost:5433` (`flow` / `flow`) |

The first start runs the migrations and loads Nairobi demo data:
- one utility, with its service area and 17 sub-county zones
- 15 hospitals, schools and markets
- about 50 reports with realistic history, including merged duplicates and pending merge suggestions

**Demo accounts** (password `flowdemo123`, local only):

| Role | Email |
|---|---|
| Dispatcher | `dispatcher@flow.local` |
| Technician | `tech1@flow.local`, `tech2@flow.local` |
| Admin | `admin@flow.local` |

Citizens sign in with a phone number and a one-time code. Locally, SMS goes to the worker's log (`docker compose logs -f worker`), and `DEV_OTP_ECHO=true` also shows the code on screen.

`make reset` wipes the data volumes and starts fresh.

### Trying it on a real phone

GPS and "Add to home screen" need a secure origin (HTTPS, or `localhost`).
- On your Wi-Fi, start with `PUBLIC_HOST=<your-LAN-IP> docker compose up` so photo links point at your machine. The app works, but the browser won't share GPS over plain http. The pin-drag fallback covers that case.
- For the full PWA experience, put an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:8080`) in front of port 8080. Add its origin to `ALLOWED_ORIGINS`, and set `S3_PUBLIC_ENDPOINT` to the tunnel host and `S3_PUBLIC_SECURE=true`.

### Without Docker (backend dev loop)

```bash
make deps        # Postgres + MinIO only
make env         # copies app.env.example to app.env
make run         # API on :8081 (runs migrations + seed)
make worker      # background worker
make web         # Vite dev server on :5173 (proxies /api)
```

### Tests

```bash
make test                         # Go: unit tests + store/service integration tests (testcontainers, real PostGIS)
cd web && npm test                # React component tests (Vitest + Testing Library)
docker compose up -d && make e2e  # Playwright end-to-end + axe accessibility checks
```

The Go integration tests need Docker. Set `SKIP_DB_TESTS=1` to run only the unit tests.

Playwright downloads Chromium on `npx playwright install chromium`. Or run `PW_CHANNEL=chrome npm test` in `e2e/` to use an installed Google Chrome.

The end-to-end suite runs the full story:
1. A citizen reports a leak on a Pixel 5–sized screen in three steps.
2. A dispatcher finds it and assigns it with the `A` shortcut.
3. A technician starts the job and marks it fixed on their phone.
4. The citizen's status page shows **Fixed**.

It also checks the app in Swahili. Every screen is scanned with axe (WCAG 2.2 A/AA), and any *serious* or *critical* issue fails the build.

---

## Architecture

```
            ┌──────────── web (nginx) :8080 ────────────┐
 phone ───▶ │  React PWA (static)   /api → api           │
 browser    │                       /flow-photos → MinIO │  (signed URLs)
            └────────────────────────────────────────────┘
                         │
               api (Go, Gin) :8081 ──── Postgres 16 + PostGIS
                         │                    ▲
                         │  jobs table        │ SKIP LOCKED
                         └──────────▶ worker (Go) ──▶ AI classifiers, SMS
                                       MinIO (private bucket)
```

The backend follows the same layout as `twende-svc`:

```
main.go             API entry: config, migrations, seed, HTTP server
cmd/worker/         Background worker entry
api/                Gin handlers, routes, auth middleware, rate limits (thin)
report/             Domain service: reporting, duplicates, scoring, dispatch, technician jobs, stats
account/            Sign-in: phone + one-time code, staff email + password, refresh tokens
admin/              Utilities, service areas, staff, sensitive sites, priority settings
workers/            Postgres-backed task distributor + processor, one file per task
db/migrations/      golang-migrate SQL
db/queries/         SQL for sqlc
db/sqlc/            Generated queries + Store interface + ExecTx (the only place SQL runs)
db_migrator/        Runs migrations on start
ai/                 ImageClassifier / TextClassifier interfaces: stub, keyword, Claude, off
sms/                SmsSender interface: console (dev), Africa's Talking
storage/            PhotoStore interface: S3/MinIO with short-lived signed URLs
imaging/            Upload checks, EXIF GPS read, re-encode (strips all metadata)
token/              Token Maker interface (JWT, HS256)
config/             viper: app.env or environment variables
seed/               Nairobi demo data
web/                React 18 + TypeScript + Vite PWA
e2e/                Playwright + axe
```

**Rules the code follows:**
- **Handlers stay thin.** Business rules live in `report/`, `account/` and `admin/`. No SQL runs outside `db/`.
- **`context.Context` is passed everywhere.** Logs are structured (slog, JSON), and all config comes from environment variables or `app.env`.
- **Access control happens twice.** Role checks run in middleware (`requireRoles`), and the services check again. Dispatchers and technicians can only see their own utility's reports. A report from another utility answers "not found".
- **Background jobs use the Postgres `jobs` table** (`FOR UPDATE SKIP LOCKED`). Jobs have retries with backoff, re-queue if a worker dies, and identical waiting jobs are skipped. Job types: AI analysis, rescoring one report, the hourly rescore of all open reports, and SMS on status change.
- **Every SMS goes through the `sms.SmsSender` interface.** `SMS_PROVIDER=console` logs messages; `africastalking` sends them for real. Messages go out in the reporter's chosen language.

### Citizen app layout

Every citizen screen uses one phone-shaped layout (`CitizenShell`).
- **Phones:** full screen. The page scrolls normally and the main action stays pinned at the bottom.
- **Tablets and desktops:** the same layout sits in a centred, rounded "phone" frame that scrolls inside, so it looks the same everywhere.

The header has the logo (or a back arrow), a title on inner pages, and a **⋯** menu. The menu holds Track a report, My reports, the language switch (English / Kiswahili), Install the app (when the browser offers it), and staff sign-in.

The end-to-end suite checks a 360 px phone: no sideways scrolling, the main button visible without scrolling, and touch targets at least 44 px.

### Street address for the pin

The location card shows where the pin is in words, e.g. "Ngong Road, near Prestige Plaza · Kilimani, Nairobi". It also prefills the report's landmark field.
- The **server** looks this up through the `geocode.Reverser` interface. The default is OpenStreetMap's Nominatim, called with an identifying User-Agent, at most 1 request a second, with a 2,000-entry cache. `GEOCODER=off` disables it, and `NOMINATIM_URL` points at your own instance (needed for real traffic under OSM's usage policy).
- **Privacy:** only the pin's coordinates are sent, never the photo or phone number, and they go from the server, not the citizen's phone.
- If the lookup fails, the card says "Pinned on the map" and reporting carries on.

### "Was it fixed properly?"

Once a report is **Fixed**, its status page shows the before and after photos and asks the reporter whether the repair worked.
- **"No, not yet"** flags the group for review. It shows up under **Needs review** on the dashboard, and the reason names the reference. The report is **not** reopened automatically; a dispatcher decides.
- The answer is stored on the report (`citizen_feedback`) and in the audit log.
- The status page shows only the reporter's own photo and the technician's after photo, never other reporters' photos.

### Data model

The tables follow the spec, with a few additions:
- `zones`: named sub-county areas, used for the area filter and per-area stats
- `report_audit`: an append-only log of overrides, merges and splits
- `refresh_tokens` and `otp_codes` for sign-in
- `report_view`: a view that gives every report read the same shape

`status_events` is only ever inserted into, never updated. Every geography column has a GIST index.

A **cluster** is a group of reports of the same leak. Each cluster has one *primary* report, and the dashboard shows one row per cluster. A status change applies to every report in the cluster, so every citizen who reported that leak gets the same updates.

### AI

Every AI piece sits behind an interface and can be swapped or turned off with config.

| Setting | Options |
|---|---|
| `AI_IMAGE_CLASSIFIER` | `stub` (default; deterministic, plausible labels), `claude` (Claude vision via the official Go SDK, structured JSON output), `off` |
| `AI_TEXT_CLASSIFIER` | `keyword` (default; English + Swahili rules), `claude`, `off` |

The Claude adapter defaults to `claude-opus-5-5` (`ANTHROPIC_MODEL` to change it). It needs `ANTHROPIC_API_KEY`. It enables server-side refusal fallback.

The worker uses the AI results in four ways:
- It fills in the leak type or size only when the citizen left them blank.
- It flags a report **for human review** when photo confidence is below `review_confidence` (default 0.6), when the photo looks like "not a leak", or when the photo and the citizen disagree.
- It **suggests** a likely duplicate.
- It **never merges** on its own. A dispatcher confirms every merge.

**Duplicate detection** is a PostGIS query. It looks for open clusters whose centre is within `duplicate_radius_m` (default 50 m) and that were active within `duplicate_window_days` (default 7). The leak types must match, but an unknown type on either side matches anything. The test `TestDuplicateDetectionRadius` proves that a report 40 m away matches and one 60 m away doesn't.

---

## The priority formula

Each score runs from 0 to 100. It's a plain weighted sum, with no black box. Weights and limits live in `priority_settings` and are editable on **Admin → Priority settings**. Changes rescore every open report in the background.

| Factor | Default max points | How it scales |
|---|---|---|
| Severity | 40 | low ×0.25, medium ×0.5, high ×0.75, critical ×1 (unknown ×0.4) |
| Duplicate reports | 15 | linear up to 10 duplicates |
| Time open | 10 | linear up to 168 h (stops when fixed) |
| Near a sensitive place | 15 | full at 0 m, falling to 0 at 500 m (nearest hospital/school/clinic/market) |
| Water lost | 10 | linear up to 50,000 L/day (estimated from leak type × size) |
| Main pipe | 10 | added when the leak is on a main |

Severity is worked out from leak type and size. For example, a burst pipe that's gushing is critical, and a dripping meter is low. A dispatcher can override severity, with a reason.

Each factor's points are rounded **before** they're added up, so the breakdown always sums exactly to the score. If the total passes 100, a "Capped at 100" line is shown.

A dispatcher can also override the whole score (0–100). A **reason is required**. The breakdown keeps the computed lines and adds "Dispatcher override: *reason*" for the difference, and **Use the worked-out score** removes the override.

The breakdown is stored as JSON with each score (`priority_breakdown`), so the UI shows the reasons in the reader's language, for example:

> Severity: Critical **+40** · Burst main **+10** · Near Olympic Primary School (96 m) **+12** · About 192,000 litres lost a day **+10** · Open 15 hours **+1** → **73**

Scores are recalculated when a report changes and every hour (`RESCORE_INTERVAL`).

---

## How each UI/UX principle shows up

1. **Make the main task short.** Reporting is three screens: photo → location → details. The location card fills in the street address from the pin. Only a photo *or* a description, plus a location, is required. Leak type, size, duration, landmark and phone are all marked optional. GPS fills the location, and a phone number is prefilled for signed-in citizens. The "Report a leak" button is pinned at the bottom of the home screen, and the report flow is fetched in the background while the home page is open.
2. **One thing at a time.** Each step is its own screen with "Step 2 of 3" and a progress bar. On the dashboard, the four most-used filters are visible and the rest sit behind **More filters**. Override forms and reasons only appear in a dialog when the dispatcher chooses to change something.
3. **Always show what's happening.** "Preparing your photo…" while it's compressed, then the final size. "Finding your location…" with accuracy in metres. A real upload progress bar ("Uploading… 42%"). A success screen with the reference number and a status timeline. An offline banner, and "N reports waiting to send". The status page shows when it was last checked.
4. **Prevent mistakes.**
   - A draggable pin, which also moves with the arrow keys, plus tap-to-move to fix wrong GPS.
   - A coverage check stops a pin outside Nairobi before sending.
   - "Others have reported a leak near here" before submitting, with the choice to add to it.
   - Confirmations for marking invalid, merging and splitting.
   - **Undo** in the toast after status changes, overrides, accepting the AI, and merges. Undoing a merge splits the reports back out.
   - Technicians are asked before marking a job fixed without an after photo.
5. **Recognition over recall.** Leak types are picture cards (burst pipe, pooling, dripping, sewage, not sure) with one-line descriptions. Sizes use drop icons. Everything the system knows is prefilled: GPS location, signed-in phone number, and the leak type when the AI or keywords can fill it.
6. **Fewer choices (Hick's law).** Every citizen question has 3–5 options. Dashboard filters are grouped, and the rare ones are hidden.
7. **Big, easy targets (Fitts's law).** Every control is at least 44×44 px (the `touch` token). The main action is full-width at the bottom, in thumb reach, and respects the safe area. Choice cards are at least 64 px tall.
8. **Clear visual order.** One primary button per screen. On the dashboard, the bold priority number and severity badge lead each row. The reference, area and age are smaller and lighter.
9. **Consistency.** A shared component library (`web/src/components/ui`) is used everywhere: Button, badges, Field, ChoiceCards, ProgressSteps, Timeline, Dialog, Toast, and the skeleton, empty and error states. Status words and colours come from one map (`design/tokens.ts`): "Fixed" is always "Fixed", in the UI and in SMS.
10. **Plain language.** Copy is written for someone reading quickly on a phone. Errors say what happened and what to do next ("We couldn't get your location. Drag the pin to where the leak is."). The server's error messages follow the same style, and known error codes are translated.
11. **Accessible (WCAG 2.2 AA).**
    - Token colours are checked for 4.5:1 contrast.
    - Severity always shows an icon and a word, never colour alone. Map markers show the priority number.
    - Every input has a visible label, with hints and errors linked through `aria-describedby`.
    - The timeline uses `aria-current="step"`, and progress bars, toasts and status messages use ARIA so screen readers announce them.
    - There's a skip link, visible focus rings, and reduced-motion support.
    - Photos have alt text that includes the AI label.
    - The dashboard works fully from the keyboard: J/K to move, Enter to open, A assign, V verify, M merge, Esc to close, ? for help.
    - axe runs in every end-to-end test and fails the build on serious issues. It caught a progress bar with no name and map markers below the 24 px target size. Markers are now pointer-only shortcuts, because every report is also a full-size row in the list.
12. **Mobile-first and built for weak connections.**
    - Designed at Pixel 5 size first.
    - Photos are compressed in the browser to under 500 KB.
    - Drafts are saved on the device (IndexedDB) after every change.
    - A failed upload goes to an outbox and is retried automatically when the phone is back online.
    - Only the home screen is in the first download (about 105 KB gzipped of JavaScript). The map, report flow and status pages load on demand, and staff screens are never precached on citizens' phones.
    - The service worker precaches the citizen app and keeps a small map-tile cache, plus the last known report status.
13. **Build trust by being open.**
    - Citizens see the full status timeline and roughly how long leaks like theirs usually take. That's the median from the last 90 days, with a sensible fallback when there's little history.
    - The details step says plainly that the photo and exact location go to the utility, and that other photo metadata is removed. The server re-encodes every photo, so no EXIF survives.
    - Dispatchers see why each score is what it is, can disagree (with a reason), and every override is in the report's history.
14. **Design every state.** Lists show skeletons, not spinners. Empty states say what to do next ("Nothing matches these filters. Try clearing some."). Errors show a **Try again** button. Every action ends in a success toast or screen.
15. **Dense but scannable for staff.** A compact table with a sticky header, aligned numeric columns and tabular figures. The map and list share one selection, and clicking either highlights the other, with the map flying to the selected report. Keyboard shortcuts cover the common actions.
16. **Language support.** All text comes from `web/src/i18n/locales/en.json` and `sw.json`, with plurals and placeholders. A check confirms both files have the same keys and the same placeholders. The language switch is on every screen, the choice is remembered, and `<html lang>` is updated. SMS updates use the language the citizen reported in.

---

## Security and privacy

- **Rate limits.** Report submission is limited per IP. One-time code requests are limited per IP *and* per phone number, and staff login per IP. The limits are in memory, so move them to Redis or Postgres before running more than one API instance.
- **Uploads are checked on the server, never trusted from the browser.** Size is capped at 10 MB, the type is detected from the file content, and the photo is re-encoded as JPEG, which removes EXIF and GPS.
- **Photos are stored privately.** They're only served through 15-minute pre-signed URLs, and a tampered signature returns 403.
- **Sessions use httpOnly cookies.** The JWT access token lives 15 minutes. The refresh token rotates on every use, is stored hashed, and is scoped to `/api/v1/auth`. Cookies are `SameSite=Lax`, and there's an Origin check on every request that changes data.
- **Passwords are hashed with bcrypt.** Logins with unknown emails take the same time as wrong passwords, so they can't be used to find accounts.
- **One-time codes** are stored hashed and tied to the phone number. They expire after 5 minutes and allow 5 tries.
- **Config refuses unsafe production settings.** Outside `ENVIRONMENT=local`, the API won't start with the public dev token key or with `DEV_OTP_ECHO`.

## Not done yet / next steps

- **Storage image:** MinIO no longer publishes community images to Docker Hub, so compose uses Bitnami's legacy MinIO build. Use managed S3 or your own MinIO image in production.
- **Areas:** zones are seeded points (sub-county centres); admins draw service-area polygons, but zones can't be edited in the UI yet.
- **Undo:** reassignment has no undo; assigning someone else changes it.
- **Geocoding at scale:** the public Nominatim server is fine for a pilot; run your own instance (or a paid provider behind the same interface) before launch.
- **Notifications:** SMS uses a console logger by default; Africa's Talking is wired up but untested against a live account.
