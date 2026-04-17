#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# LexiCounsel — Production Deploy Script
#
# Usage:
#   ./deploy.sh          # first-time setup + deploy
#   ./deploy.sh update   # pull latest code and restart
# ─────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# ── Helpers ───────────────────────────────────────────────────
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }
err()   { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; exit 1; }

# ── Load .env ─────────────────────────────────────────────────
[ -f .env ] || err ".env not found. Copy .env.example to .env and fill in your values."
set -a; source .env; set +a

DOMAIN="${DOMAIN:-}"
[ -z "$DOMAIN" ] && err "DOMAIN is not set in .env. Add: DOMAIN=yourdomain.com"

# ── Update mode ───────────────────────────────────────────────
if [ "${1:-}" = "update" ]; then
    info "Pulling latest code..."
    git pull origin main

    info "Rebuilding images..."
    $COMPOSE build --no-cache backend frontend

    info "Restarting services..."
    $COMPOSE up -d --no-deps backend frontend nginx

    info "Running database migrations..."
    $COMPOSE exec backend python -m alembic upgrade head

    ok "Update complete."
    exit 0
fi

# ── First-time setup ──────────────────────────────────────────
info "Starting first-time deployment for domain: $DOMAIN"

# 1. Create certbot directories
mkdir -p infra/certbot/www infra/certbot/conf

# 2. Render nginx config (HTTP-only first, for ACME challenge)
info "Configuring nginx (HTTP only) for ACME challenge..."
DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < infra/nginx/http.conf > infra/nginx/rendered.conf

# 3. Build images
info "Building Docker images..."
$COMPOSE build

# 4. Start services (HTTP only for now)
info "Starting services..."
$COMPOSE up -d postgres backend frontend nginx

# 5. Wait for nginx to be ready
sleep 5

# 6. Obtain SSL certificate
info "Requesting Let's Encrypt certificate for $DOMAIN..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
    certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "${CERTBOT_EMAIL:-admin@${DOMAIN}}" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# 7. Switch nginx to HTTPS config
info "Switching nginx to HTTPS config..."
DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < infra/nginx/https.conf > infra/nginx/rendered.conf

# 8. Reload nginx
$COMPOSE exec nginx nginx -s reload

# 9. Start certbot renewal loop
$COMPOSE up -d certbot

# 10. Run database migrations
info "Running database migrations..."
$COMPOSE exec backend python -m alembic upgrade head

ok "Deployment complete!"
echo ""
echo "  Your app is live at: https://${DOMAIN}"
echo ""
echo "  Useful commands:"
echo "    View logs:      docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "    Update deploy:  ./deploy.sh update"
echo "    Stop all:       docker compose -f docker-compose.yml -f docker-compose.prod.yml down"
