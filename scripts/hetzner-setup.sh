#!/bin/bash
# =============================================================================
# OpenWA — One-shot Hetzner / Ubuntu deploy script
# =============================================================================
# Provisions a fresh Ubuntu 24.04/26.04 server to run OpenWA behind Caddy:
#   - System update + utilities (git, ufw, fail2ban, htop, curl)
#   - Docker + Compose plugin (official get.docker.com)
#   - UFW firewall (22/80/443)
#   - fail2ban
#   - Caddy (native, auto-SSL via Let's Encrypt)
#   - Clones OpenWA into /opt/OpenWA (or uses existing checkout)
#   - Generates .env with random secrets (idempotent: keeps existing)
#   - Patches docker-compose.yml to expose dashboard to 127.0.0.1:2886
#   - Writes Caddyfile (path-based routing for single subdomain)
#   - Builds and brings up the stack
#   - Reloads Caddy
#
# Usage (run as root or via sudo):
#   DOMAIN_FULL=wa.chancletazo.es LE_EMAIL=you@example.com bash hetzner-setup.sh
#
# Optional vars:
#   REPO_URL              Default: https://github.com/ai-zar/OpenWA.git
#   INSTALL_DIR           Default: /opt/OpenWA
#   API_MASTER_KEY        If unset, a random 64-char hex is generated
#   DATABASE_PASSWORD     If unset, a random base64 password is generated
#   SKIP_SSH_HARDENING    Set to 1 to skip disabling password auth
#   SKIP_BUILD            Set to 1 to skip docker compose build/up (only setup)
#
# Idempotent: re-running re-uses existing .env, skips already-installed pkgs.
# =============================================================================

set -euo pipefail

# ----- Colors -----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()    { echo -e "${BLUE}ℹ${NC} $*"; }
ok()     { echo -e "${GREEN}✓${NC} $*"; }
warn()   { echo -e "${YELLOW}⚠${NC} $*"; }
fail()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ----- Required vars -----
: "${DOMAIN_FULL:?Set DOMAIN_FULL (e.g. wa.chancletazo.es)}"
: "${LE_EMAIL:?Set LE_EMAIL (email for Lets Encrypt cert issuance)}"

REPO_URL="${REPO_URL:-https://github.com/ai-zar/OpenWA.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/OpenWA}"
SKIP_SSH_HARDENING="${SKIP_SSH_HARDENING:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"

[[ $EUID -eq 0 ]] || fail "Run as root (or via sudo)."

log "Domain:       $DOMAIN_FULL"
log "Install dir:  $INSTALL_DIR"
log "Repo:         $REPO_URL"

# =============================================================================
# 1. System update
# =============================================================================
log "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
ok "System up to date."

# =============================================================================
# 2. Base utilities
# =============================================================================
log "Installing base utilities..."
apt-get install -y -qq \
    git ufw fail2ban htop curl ca-certificates \
    debian-keyring debian-archive-keyring apt-transport-https gnupg
ok "Utilities installed."

# =============================================================================
# 3. Docker
# =============================================================================
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    ok "Docker installed: $(docker --version)"
else
    ok "Docker already installed: $(docker --version)"
fi

# =============================================================================
# 4. UFW firewall
# =============================================================================
log "Configuring UFW firewall..."
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable
ok "UFW active: 22, 80, 443 open."

# =============================================================================
# 5. fail2ban
# =============================================================================
log "Enabling fail2ban..."
systemctl enable --now fail2ban
ok "fail2ban running."

# =============================================================================
# 6. SSH hardening (optional)
# =============================================================================
if [[ "$SKIP_SSH_HARDENING" != "1" ]]; then
    log "Hardening SSH (disabling password auth)..."
    sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
    sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
    systemctl restart ssh
    ok "SSH hardened. (Set SKIP_SSH_HARDENING=1 to disable.)"
fi

# =============================================================================
# 7. Caddy
# =============================================================================
if ! command -v caddy &>/dev/null; then
    log "Installing Caddy..."
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
    ok "Caddy installed: $(caddy version | head -1)"
else
    ok "Caddy already installed: $(caddy version | head -1)"
fi

# =============================================================================
# 8. Clone or update OpenWA repo
# =============================================================================
if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Updating existing OpenWA checkout at $INSTALL_DIR..."
    git -C "$INSTALL_DIR" pull --ff-only || warn "git pull failed; keeping local state."
else
    log "Cloning OpenWA into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
ok "Repo ready at $INSTALL_DIR."

# =============================================================================
# 9. Generate .env (idempotent)
# =============================================================================
if [[ -f .env ]]; then
    ok ".env already exists — keeping it. (Delete to regenerate.)"
else
    log "Generating .env with random secrets..."
    : "${API_MASTER_KEY:=$(openssl rand -hex 32)}"
    : "${DATABASE_PASSWORD:=$(openssl rand -base64 24)}"

    DOMAIN_ROOT="${DOMAIN_FULL#*.}"

    cat > .env <<EOF
# Generated by hetzner-setup.sh on $(date -Iseconds)
NODE_ENV=production
API_PORT=2785
LOG_LEVEL=info

DOMAIN=$DOMAIN_ROOT
DASHBOARD_PORT=2886
BASE_URL=https://$DOMAIN_FULL
DASHBOARD_URL=https://$DOMAIN_FULL
CORS_ORIGINS=https://$DOMAIN_FULL

DASHBOARD_ENABLED=true
PROXY_ENABLED=false

ENGINE_TYPE=whatsapp-web.js
SESSION_DATA_PATH=./data/sessions
PUPPETEER_HEADLESS=true
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu

DATABASE_TYPE=postgres
POSTGRES_BUILTIN=true
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=openwa
DATABASE_USERNAME=openwa
DATABASE_PASSWORD=$DATABASE_PASSWORD
DATABASE_SYNCHRONIZE=false
DATABASE_LOGGING=false

REDIS_ENABLED=false
REDIS_BUILTIN=false

STORAGE_TYPE=local
MINIO_BUILTIN=false
STORAGE_LOCAL_PATH=./data/media

WEBHOOK_TIMEOUT=10000
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_DELAY=5000

RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100

PLUGINS_ENABLED=true
PLUGINS_DIR=./data/plugins

API_MASTER_KEY=$API_MASTER_KEY

ENABLE_SWAGGER=true
EOF
    chmod 600 .env
    ok ".env generated."
    warn "Save these secrets in a password manager:"
    echo    "    API_MASTER_KEY=$API_MASTER_KEY"
    echo    "    DATABASE_PASSWORD=$DATABASE_PASSWORD"
fi

# =============================================================================
# 10. Patch docker-compose.yml to expose dashboard to 127.0.0.1:2886
# =============================================================================
if ! grep -q "127.0.0.1:2886:80" docker-compose.yml; then
    log "Patching docker-compose.yml to expose dashboard..."
    sed -i '/container_name: openwa-dashboard/a\    ports:\n      - "127.0.0.1:2886:80"' docker-compose.yml
    ok "docker-compose.yml patched."
else
    ok "docker-compose.yml already patched."
fi

# =============================================================================
# 11. Caddyfile
# =============================================================================
log "Writing /etc/caddy/Caddyfile..."
cat > /etc/caddy/Caddyfile <<EOF
{
    email $LE_EMAIL
}

$DOMAIN_FULL {
    encode gzip

    # NestJS API (already prefixed with /api in code)
    handle /api/* {
        reverse_proxy 127.0.0.1:2785
    }

    # Socket.IO (used by dashboard for live updates)
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:2785
    }

    # React dashboard
    handle {
        reverse_proxy 127.0.0.1:2886
    }

    log {
        output file /var/log/caddy/$DOMAIN_FULL.log {
            roll_size 50mb
            roll_keep 5
        }
    }
}
EOF

mkdir -p /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile >/dev/null
ok "Caddyfile valid."

# =============================================================================
# 12. Docker Log rotation (avoid disk fill from container logs)
# =============================================================================
if [[ ! -f /etc/docker/daemon.json ]]; then
    log "Configuring Docker log rotation..."
    cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
EOF
    systemctl restart docker
    ok "Docker log rotation enabled."
else
    ok "/etc/docker/daemon.json already exists — skipping."
fi

# =============================================================================
# 13. Build & start stack
# =============================================================================
if [[ "$SKIP_BUILD" == "1" ]]; then
    warn "SKIP_BUILD=1 — skipping docker compose build/up. Run manually:"
    echo  "  cd $INSTALL_DIR"
    echo  "  docker compose --profile postgres --profile with-dashboard up -d --build"
    echo  "  systemctl reload caddy"
else
    log "Pulling base images..."
    docker compose --profile postgres --profile with-dashboard pull --ignore-pull-failures || true

    log "Building OpenWA image (this takes ~5–8 min: Chromium + deps)..."
    docker compose --profile postgres --profile with-dashboard build

    log "Starting stack..."
    docker compose --profile postgres --profile with-dashboard up -d

    log "Reloading Caddy..."
    systemctl reload caddy

    sleep 3
    ok "Stack up. Container status:"
    docker compose ps
fi

# =============================================================================
# Done
# =============================================================================
echo
ok "Deploy finished."
echo "  Dashboard: https://$DOMAIN_FULL"
echo "  API base:  https://$DOMAIN_FULL/api"
echo "  Swagger:   https://$DOMAIN_FULL/api/docs"
echo
echo "Next steps:"
echo "  1. Open https://$DOMAIN_FULL in browser"
echo "  2. Login with API_MASTER_KEY (see $INSTALL_DIR/.env)"
echo "  3. Create session → scan QR with WhatsApp mobile"
echo
echo "Logs:"
echo "  docker compose -f $INSTALL_DIR/docker-compose.yml logs -f openwa-api"
echo "  journalctl -u caddy -f"
