# Multi-tenant cinema ticketing

One platform, many theatres. A platform admin creates **organizations** (each one a theatre). Each theatre gets:

- **Customer website** at `/<slug>`: pick a day, show and seats (live seat map, best-seat suggestions, view-from-seat), pay, then get a ticket with a QR code.
- **Box office** at `/<slug>/staff/counter`: sell at the counter for cash or UPI and print a receipt.
- **Entry gate** at `/<slug>/staff/gate`: scan the QR with a phone camera or type the booking ID.
- **Owner console** at `/<slug>/staff/owner`: today's dashboard, shows, movies, seat layout, blocked seats, bookings and refunds, staff logins, change history, reports, and settings.

The design follows the *Hari Shankar Picture Palace* mockup. Its CSS is used as the design system, including the Marquee, Poster and Calm looks, which the admin chooses per theatre.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16** (App Router, React 19, TypeScript) | One codebase for the customer site, staff consoles and JSON API; server components keep most pages free of client JS. |
| Database | **PostgreSQL** + **Drizzle ORM** | Row locks, transactions and partial unique indexes give a hard no-double-booking guarantee. Drizzle keeps the SQL visible. |
| Dev DB | **PGlite** (embedded Postgres) | `npm run dev` works with zero setup. Use real Postgres everywhere else. |
| Auth | Signed JWT cookies (`jose`), `bcrypt` hashes | Platform admins use email and password. Theatre staff use mobile number and PIN, with role checks on every request. |
| Payments | `PaymentGateway` interface, mock implementation | Swap in Razorpay, Cashfree or PayU in `src/lib/payments.ts`. |

## How a seat can never be sold twice

1. **One row per seat per show** (`show_seats`, primary key `(show_id, seat_id)`). A seat is `available`, `held` (with an expiry), `booked`, or `blocked`.
2. **Holding seats** (online checkout or a box office cart) is a transaction that runs `SELECT … ORDER BY seat_id FOR UPDATE` and checks every seat is free. Free means available, or held by a hold that has expired. It then flips them with a conditional `UPDATE … RETURNING`. A second buyer blocks on the row lock, re-reads the row after the first commits, and gets `SEATS_TAKEN`. The fixed lock order prevents deadlocks.
3. **Confirming** only converts seats still `held` by *that* booking with an unexpired hold. If the hold has run out and someone else took the seat, the confirm is refused. Money that arrives after a hold expired is recorded as `needs_refund` and shown to the owner under "Needs your attention".
4. **A database backstop:** `tickets` has a partial unique index `(show_id, seat_id) WHERE status = 'valid'`. Postgres itself rejects a second valid ticket for a seat, even if application code had a bug.
5. **Gate check-in** is one atomic `UPDATE … WHERE checked_in_at IS NULL`, so one ticket can't get two people in.

`npm run test:race` proves this against a real database:

- 100 simultaneous buyers (online and counter) for one seat produce exactly 1 winner.
- 60 overlapping group bookings leave no seat in two holds.
- Opposite-order requests cause no deadlocks.
- An expired hold is resold, and the late confirm is refused.
- 20 simultaneous confirms of one booking produce 1 set of tickets.
- A raw duplicate ticket `INSERT` is rejected by Postgres.
- 10 simultaneous gate scans let in 1 entry.
- Booked seats and valid tickets match one-to-one.

## Run it

```bash
npm install
cp .env.example .env          # optional for dev
npm run dev                   # embedded DB, migrates and seeds itself on first start
```

Open http://localhost:3000. Demo logins come from the seed in `src/db/seed.ts` and `.env.example`:

- **Platform admin:** `/admin`, using `ADMIN_EMAIL` / `ADMIN_PASSWORD` (default `admin@example.com` / `admin12345`)
- **Theatre staff:** `/harishankar/staff/login`, PIN `1234` for every seeded staff member:
  - Owner: 9848012345
  - Manager: 9848023456
  - Box office: 9848034567
  - Gate: 9848056789

### With real Postgres (recommended, and required for production)

```bash
docker compose up -d
export DATABASE_URL=postgres://tickets:tickets@localhost:5432/tickets
npm run db:migrate && npm run db:seed
npm run test:race             # concurrency proof
npm run build && npm start
```

### Changing the schema

Edit `src/db/schema.ts`, run `npm run db:generate`, and commit the new file in `drizzle/`.

## Multi-tenancy

All theatres share one database. Every tenant-owned table has `org_id`, and every query and API route resolves the theatre from the URL slug and filters by it. Staff sessions are bound to one organization, and an id from another theatre returns 404. Theatres live at `/<slug>`. Set `ROOT_DOMAIN` to also serve each theatre at `<slug>.<ROOT_DOMAIN>` (see `src/proxy.ts`).

## Layout

```
src/db/          schema, connection (Postgres or PGlite), seed
src/lib/         booking engine, payments, auth, tenant lookup, queries, formatting
src/app/admin/   platform admin console
src/app/[slug]/  customer site ((public)) and staff consoles (staff/counter, staff/gate, staff/owner)
src/app/api/t/[slug]/  JSON API: seat map, holds, pay, counter confirm, gate check
scripts/         migrate, seed, race-test
```

## Before going live

- Real payment gateway: implement `PaymentGateway`, and confirm bookings from the provider's verified **webhook**, not the browser.
- Customer identity: phone OTP login so "My tickets" works across devices (today it is remembered per browser).
- SMS or WhatsApp delivery of tickets, PINs and refund notices.
- Move the PIN brute-force guard from process memory to Redis or a table when running more than one server.
- Offline gate scanning, snack ordering and multiple screens per theatre: the schema already has `screens`, but the UI uses the first one.
