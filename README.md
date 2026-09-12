# Team Calendar Overview

A modern, self-hosted web app that shows your colleagues' Microsoft 365 calendars side by side, like a wall planner. Sign in with Microsoft 365, pick the people you care about, and see at a glance who is busy when.

- **Read-only.** Uses delegated Microsoft Graph permissions only; the app can never change a calendar. No application-level (tenant-wide) permissions.
- **Groups.** A built-in *My team* (everyone with the same manager as you), manual groups (pick people, or "everyone reporting to …"), and Entra ID groups.
- **Colour rules.** "Red if the subject contains Vacation", "orange when out of office", regex supported, first match wins.
- **Find a time.** Select people, open the availability heatmap, pick a slot and open a pre-filled meeting in Outlook.
- **Your settings follow you.** Theme, language (English/Danish), row height, days shown, rows per page, groups and rules are stored on the server.
- **Demo data.** Flip a switch to explore the app with 150 fictional people.
- **Zero build step.** PHP (Laravel) + Vue 3 loaded as plain ES modules, fonts and scripts self-hosted. No Node, no npm, no CDN calls.

## Requirements

- PHP 8.3 or newer with `curl`, `mbstring`, `intl`, `openssl`, `pdo_sqlite` (or `pdo_mysql` / `pdo_pgsql`)
- Composer
- A web server (nginx, Apache, Caddy, …) with HTTPS
- A Microsoft Entra ID tenant where you (or an admin) can create an app registration

Any host that runs Laravel runs this app: a small VPS, shared hosting with SSH, CloudPanel, Plesk, Forge, Docker.

## Install

```bash
git clone https://github.com/<you>/team-calendar-overview.git
cd team-calendar-overview
./install.sh            # or: PHP=/usr/bin/php8.5 ./install.sh
```

`install.sh` installs the PHP dependencies and runs the interactive setup, which asks for:

1. **Site** – site name, public URL, default language
2. **Database** – SQLite (default, nothing to configure) or MySQL / MariaDB / PostgreSQL
3. **Microsoft 365** – tenant id, client id, client secret (can be added later)

Prefer clicking? Skip `calendar:install`, point the web server at the app and open the site: the first visit shows the same wizard at `/setup` (it locks itself once the setup is complete).

### Web server

Point the document root at the `public/` directory. A standard Laravel nginx block works:

```nginx
server {
    server_name calendar.example.com;
    root /var/www/team-calendar-overview/public;
    index index.php;
    location / { try_files $uri $uri/ /index.php?$query_string; }
    location ~ \.php$ { include fastcgi_params; fastcgi_pass unix:/run/php/php8.3-fpm.sock; fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name; }
}
```

**Cannot change the document root?** (some control panels fix it to `htdocs/<domain>`) Keep the project outside the document root and link it in:

```bash
php artisan calendar:link-webroot /path/to/htdocs/calendar.example.com
```

This writes a two-line `index.php` and symlinks `assets/` into the existing document root. Use `--copy` if symlinks are not allowed.

Disable any full-page cache (Varnish, "static page caching") for the site: the app is authenticated and must not be cached.

### Microsoft Entra ID app registration

1. In the [Microsoft Entra admin center](https://entra.microsoft.com) open **App registrations → New registration**.
   Name it (e.g. "Calendar overview"), choose **Accounts in this organizational directory only**, and add a **Web** redirect URI: `https://calendar.example.com/auth/callback`.
2. **Certificates & secrets → New client secret.** Copy the value.
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add:

   | Permission | Used for | Admin consent |
   |---|---|---|
   | `openid`, `profile`, `email`, `offline_access`, `User.Read` | Sign-in, silent token refresh | no |
   | `User.ReadBasic.All` | People directory, profile photos, direct reports | no |
   | `User.Read.All` | Your manager (for *My team*) | **yes** |
   | `GroupMember.Read.All` | Entra ID groups and their members | **yes** |
   | `Calendars.Read` | Free/busy of colleagues (`getSchedule`), your own calendar | no |

   Click **Grant admin consent for <tenant>**. (The sign-in page also offers a "Grant admin consent" link for global admins.)
4. Copy **Directory (tenant) ID** and **Application (client) ID** from the Overview page into the setup wizard or `.env`.

No application permissions are needed. Colleagues' appointment subjects and locations are visible only when their calendar's default sharing level in Outlook allows it ("Can view titles and locations", which is the Microsoft 365 default); otherwise the overview shows "Busy".

### Configuration (`.env`)

| Key | Meaning |
|---|---|
| `APP_NAME`, `APP_URL`, `APP_LOCALE` | Site name, public URL, default language (`en` or `da`) |
| `DB_CONNECTION` … | `sqlite` (default) or `mysql` / `mariadb` / `pgsql` with `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | App registration |
| `MS_ALLOWED_DOMAINS` | Optional comma-separated e-mail domains allowed to sign in |
| `CALENDAR_SCHEDULE_TTL_MINUTES` | How long free/busy data is reused before Graph is asked again (default 10) |
| `CALENDAR_DIRECTORY_SYNC_HOURS` | Directory refresh interval (24) |
| `CALENDAR_PHOTO_SYNC_DAYS` | Photo refresh interval (7) |
| `CALENDAR_GROUP_SYNC_HOURS` | Entra group membership refresh interval (24) |

After editing `.env` on a production install run `php artisan config:cache`.

### Optional: background sync

The app fetches what it needs on demand and caches it. To keep the directory, photos and the next two weeks of availability warm in the background, add one cron line:

```
* * * * * php /var/www/team-calendar-overview/artisan schedule:run >> /dev/null 2>&1
```

The scheduler uses the stored (delegated) Microsoft session of recently active users; nothing runs until someone has signed in.

## How it works

- **Sign-in:** OAuth 2.0 authorization-code flow with PKCE against your tenant. Tokens are encrypted at rest; sessions last 30 days with silent refresh.
- **Directory:** `GET /users` (with manager) is cached in the database and refreshed daily or via "Sync directory now".
- **Photos:** 96×96 profile photos are fetched in Graph batches and stored under `storage/app/photos`, served through an authenticated route. People without a photo get a generated initials avatar.
- **Availability:** `POST /me/calendar/getSchedule`, 20 people per call, cached per person and day for `CALENDAR_SCHEDULE_TTL_MINUTES`. Your own calendar uses `calendarView` for full details. "Refresh" forces a new fetch.
- **Editing modals** never close on an outside click or Esc; confirmation dialogs do.

## Updating

```bash
git pull
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
```

## Development

```bash
composer install
cp .env.example .env && php artisan key:generate
php artisan calendar:demo on        # 150 demo users
php artisan test
php artisan serve
```

There is no frontend build: edit the files under `public/assets` and reload. An optional runtime smoke test of the Vue app exists in `tests/js/smoke.mjs` (needs Node and the `jsdom` package: `cd tests/js && npm install jsdom && node smoke.mjs`).

## Troubleshooting

- **502 / blank page behind a control panel:** make sure the PHP-FPM pool for the site runs PHP ≥ 8.3 and that any page cache (Varnish) is off for this site.
- **"Consent needed" on rows:** an admin must grant consent for `User.Read.All` and `GroupMember.Read.All`, or the colleague's mailbox does not allow free/busy lookups.
- **"No mailbox":** the person has no Exchange mailbox (e.g. a cloud-only account without a licence).
- **Photos missing:** they are fetched lazily for the rows on screen; use *Settings → Sync photos* to force it.
- **Reset the setup wizard:** delete `storage/app/installed.json`.

## License

MIT
