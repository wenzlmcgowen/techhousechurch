# DNS setup — techhousechurch.org

**This is the only step Claude cannot do.** GoDaddy needs your login and SMS
verification, and Claude does not enter credentials or verification codes on any
account. Same as when you launched papilio.center.

Everything else is already done: repo created, site built, GitHub Pages enabled,
custom domain registered. The site is waiting on DNS and nothing else.

## What to do (about 5 minutes)

GoDaddy → **My Products** → techhousechurch.org → **DNS** → **Manage Zones**

### ⚠️ Do not touch the email records

The order included **Microsoft 365 Email Essentials**, so GoDaddy will add records for
it: `MX`, plus `TXT` records for SPF/DKIM, plus `autodiscover` and `_domainconnect`
CNAMEs. **Leave every one of them alone.** Deleting them breaks email at this domain.

Only the records named below get changed.

### 1. Delete the parking record

There will be an existing **A record** for `@` pointing at a GoDaddy parking IP
(something like `Parked` or an IP starting `76.` / `13.`). **Delete it.** If you leave
it, the domain will keep showing GoDaddy's "future home of..." page.

### 2. Add four A records

All with **Name: `@`** — these are GitHub's Pages servers. Exactly the four your
papilio.center already uses, verified 2026-09-07:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | @ | `185.199.108.153` | 1 hour |
| A | @ | `185.199.109.153` | 1 hour |
| A | @ | `185.199.110.153` | 1 hour |
| A | @ | `185.199.111.153` | 1 hour |

### 3. Add one CNAME

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | www | `wenzlmcgowen.github.io` | 1 hour |

(Note the trailing dot GoDaddy may add automatically — that's fine.)

### 4. Save, then wait

DNS takes anywhere from ten minutes to a couple of hours. Then tell Claude and it will:

- confirm the records propagated,
- turn on **HTTPS enforcement** in GitHub Pages (it can only be enabled *after* DNS
  resolves — that is why it is off right now),
- verify the site loads and the `noindex` tag is still in place.

## What's already live behind it

- **Repo:** https://github.com/wenzlmcgowen/techhousechurch — public, and contains
  **only** the site: `index.html`, `adopt.html`, `CONTRIBUTING.md`, `CNAME`.
- **founder-os stays private.** The research, the database, your notes and finances are
  in a separate private repo and must never be published here.
- **Quiet launch:** `<meta name="robots" content="noindex, nofollow">` is on both pages.
  The site works and is shareable by link, but search engines will skip it. Say the word
  and it comes off.

## If something looks wrong

- **GoDaddy parking page still showing** → the old A record wasn't deleted.
- **404 from GitHub** → DNS is right but Pages hasn't picked it up; give it 10 minutes.
- **"Not secure" warning** → normal until HTTPS is enforced, which needs DNS first.
