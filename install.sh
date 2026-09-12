#!/usr/bin/env bash
# One-shot installer: dependencies + interactive setup (site name, database, Microsoft 365).
set -euo pipefail
cd "$(dirname "$0")"

PHP="${PHP:-php}"
if ! command -v "$PHP" >/dev/null 2>&1; then
  echo "PHP was not found. Install PHP 8.3+ or run: PHP=/usr/bin/php8.5 ./install.sh" >&2
  exit 1
fi
if ! command -v composer >/dev/null 2>&1; then
  echo "Composer was not found: https://getcomposer.org/download/" >&2
  exit 1
fi

"$PHP" "$(command -v composer)" install --no-dev --optimize-autoloader --no-interaction
[ -f .env ] || cp .env.example .env
"$PHP" artisan calendar:install "$@"
"$PHP" artisan config:cache >/dev/null
"$PHP" artisan route:cache >/dev/null
"$PHP" artisan view:cache >/dev/null

echo
echo "Done. Point your web server at $(pwd)/public (or run: $PHP artisan calendar:link-webroot /path/to/document-root)."
