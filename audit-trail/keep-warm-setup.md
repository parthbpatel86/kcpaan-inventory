# Keep-warm setup — eliminating the first-load wait for shop staff

Purpose: document why the backend is slow on first use, what the constraints
are, and the exact (free) configuration that fixes it. Evidence from 2026-08-14.

## 1. The problem, measured
Render free web services spin down after **15 minutes** without inbound traffic;
spin-up takes ~1 minute (Render docs, /docs/free). Measured on the live service:

```
cold first request : ~50s   (staff waiting at the counter)
warm request       : 0.117s
warm /api/products : 0.149s
```
~400x difference. Fixed by keeping the service warm during shop hours.

## 2. The hard constraint: 750 instance-hours/month
Render grants **750 free instance hours per WORKSPACE per month**, shared across
ALL free web services. This workspace has TWO free web services:
  - kcpaan-inventory-api   (the POS/stock backend)
  - kcpaan-website
When the pool is exhausted, ALL free web services suspend until next month.

Budget math (31-day month, api service only):
```
24/7 always-on   -> 744h   leaves   6h for website   <-- DANGEROUS
7am-11pm (16h/d) -> 496h   leaves 254h for website   <-- CHOSEN
8am-10pm (14h/d) -> 434h   leaves 316h for website
9am-9pm  (12h/d) -> 372h   leaves 378h for website
```
Conclusion: DO NOT ping 24/7. Ping only during shop hours.

## 3. Why not the local Mac cron
This Mac's power settings are `sleep 1` (sleeps after 1 min idle) and `womp 0`
(does not wake for network). A launchd/cron ping here would not fire reliably
while the shop is open and Parth is away. Must be a cloud pinger.

## 4. Chosen solution: cron-job.org (free)
Free, unlimited jobs, min interval 1 min, no credit card. Ping target:

```
URL      : https://kcpaan-inventory-api.onrender.com/api/health
Method   : GET
Schedule : every 10 minutes, 07:00-23:00, America/Los_Angeles
Response : {"ok":true,"service":"kcpaan-inventory"}   (41 bytes)
```
Ping every 10 min beats the 15-min spin-down with margin. `/api/health` does NOT
touch the database, so it burns no Neon compute hours.

cron-job.org caveats to respect: job auto-disables after 25 consecutive
failures; response must stay under 1024 bytes and 30s (health is 41 bytes).
Render policy note: they may suspend a free service that generates "an
uncommonly high volume of traffic" — 6 pings/hour is ordinary monitoring
traffic, not high volume.

Alternative: UptimeRobot free (50 monitors, 5-min interval) — rejected as the
primary because it pings 24/7, which would exceed the 750h pool.

## 5. What this does NOT fix
The Neon database also scales to zero after 5 min idle, but it resumes in
well under a second and is not the source of the ~50s wait. Not worth pinging.

## 6. If the 750h pool ever becomes the binding constraint
Options, cheapest first:
  - Narrow the ping window to real shop hours only.
  - Move kcpaan-website off Render (it is a static site candidate; a static
    site does not consume instance hours), freeing the whole pool for the API.
  - Render Starter plan (~$7/mo) = no spin-down at all, no ping needed.
