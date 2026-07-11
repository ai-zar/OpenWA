#!/bin/bash
# OpenWA Smart Orchestration Script
# Reads .env and activates appropriate Docker profiles

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Log functions (write to stderr so $(...) capture doesn't swallow them)
log_info() { echo -e "${BLUE}ℹ${NC} $1" >&2; }
log_success() { echo -e "${GREEN}✓${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1" >&2; }
log_error() { echo -e "${RED}✗${NC} $1" >&2; }

# Load environment variables
load_env() {
    if [ -f "$PROJECT_DIR/.env" ]; then
        log_info "Loading .env file..."
        set -a
        source "$PROJECT_DIR/.env"
        set +a
    else
        log_warn ".env file not found, using defaults"
    fi
}

# Determine which profiles to activate
get_profiles() {
    local profiles=""

    # Dashboard (default: enabled)
    if [ "${DASHBOARD_ENABLED:-true}" = "true" ]; then
        profiles="$profiles --profile with-dashboard"
        log_info "Dashboard: enabled"
    fi

    # Proxy (default: enabled)
    if [ "${PROXY_ENABLED:-true}" = "true" ]; then
        profiles="$profiles --profile with-proxy"
        log_info "Proxy (Traefik): enabled"
    fi

    # PostgreSQL (built-in)
    if [ "${DATABASE_TYPE:-sqlite}" = "postgres" ] && [ "${POSTGRES_BUILTIN:-false}" = "true" ]; then
        profiles="$profiles --profile postgres"
        log_info "PostgreSQL: built-in container"
    elif [ "${DATABASE_TYPE:-sqlite}" = "postgres" ]; then
        log_info "PostgreSQL: external (${DATABASE_HOST:-localhost}:${DATABASE_PORT:-5432})"
    else
        log_info "Database: SQLite"
    fi

    # Redis (built-in)
    if [ "${REDIS_ENABLED:-false}" = "true" ] && [ "${REDIS_BUILTIN:-false}" = "true" ]; then
        profiles="$profiles --profile redis"
        log_info "Redis: built-in container"
    elif [ "${REDIS_ENABLED:-false}" = "true" ]; then
        log_info "Redis: external (${REDIS_HOST:-localhost}:${REDIS_PORT:-6379})"
    else
        log_info "Redis: disabled"
    fi

    # MinIO (built-in S3)
    if [ "${STORAGE_TYPE:-local}" = "s3" ] && [ "${MINIO_BUILTIN:-false}" = "true" ]; then
        profiles="$profiles --profile minio"
        log_info "Storage: built-in MinIO"
    elif [ "${STORAGE_TYPE:-local}" = "s3" ]; then
        log_info "Storage: external S3 (${S3_ENDPOINT})"
    else
        log_info "Storage: local filesystem"
    fi

    # Engine type
    log_info "Engine: ${ENGINE_TYPE:-whatsapp-web.js}"

    echo "$profiles"
}

# Validate engine type
validate_engine() {
    local engine="${ENGINE_TYPE:-whatsapp-web.js}"
    local valid_engines=("whatsapp-web.js" "baileys")

    for valid in "${valid_engines[@]}"; do
        if [ "$engine" = "$valid" ]; then
            return 0
        fi
    done

    log_error "Invalid ENGINE_TYPE: $engine"
    log_error "Valid options: ${valid_engines[*]}"
    exit 1
}

# Start OpenWA
cmd_start() {
    log_info "Starting OpenWA..."
    load_env
    validate_engine

    local profiles=$(get_profiles)

    echo ""
    log_info "Activating profiles:$profiles"
    echo ""

    cd "$PROJECT_DIR"
    docker compose $profiles up -d

    echo ""
    log_success "OpenWA started successfully!"
    echo ""
    log_info "Dashboard: http://localhost:${DASHBOARD_PORT:-2886}"
    log_info "API: http://localhost:${API_PORT:-2785}"
}

# Stop OpenWA
cmd_stop() {
    log_info "Stopping OpenWA..."
    cd "$PROJECT_DIR"
    docker compose --profile postgres --profile redis --profile minio --profile with-dashboard --profile with-proxy down
    log_success "OpenWA stopped"
}

# Restart OpenWA
cmd_restart() {
    cmd_stop
    cmd_start
}

# Show status
cmd_status() {
    log_info "OpenWA container status:"
    echo ""
    cd "$PROJECT_DIR"
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
}

# Show logs
cmd_logs() {
    local service="${1:-openwa-api}"
    local lines="${2:-100}"
    cd "$PROJECT_DIR"
    docker compose logs -f --tail="$lines" "$service"
}

# Build images
cmd_build() {
    log_info "Building OpenWA images..."
    load_env
    local profiles=$(get_profiles)
    cd "$PROJECT_DIR"
    docker compose $profiles build
    log_success "Build complete"
}

# Update (pull + build + restart + prune)
cmd_update() {
    log_info "Updating OpenWA..."
    cd "$PROJECT_DIR"
    git pull
    cmd_build
    cmd_restart
    # Reclaim disk: each rebuild leaves the previous image untagged (dangling).
    # `-f` = no prompt; NOT `-a` (that would remove images of stopped/optional
    # profiles like minio/redis that aren't running right now).
    log_info "Pruning dangling images..."
    docker image prune -f
    log_success "Update complete"
}

# Clean a corrupt Chromium profile and restart (fixes "stuck at loading, no QR")
# When wwebjs' session profile gets corrupted (e.g. after a Chromium crash-loop),
# initialize() hangs with no QR and no error. Nuking the profile forces a fresh
# QR. Deletes auth → you must re-scan. Usage: clean-restore [session-name] [--yes]
cmd_clean_restore() {
    local session_name=""
    local assume_yes="false"
    for arg in "$@"; do
        case "$arg" in
            --yes|-y) assume_yes="true" ;;
            *) session_name="$arg" ;;
        esac
    done

    cd "$PROJECT_DIR"
    load_env

    local sessions_path="/app/data/sessions"
    local target
    if [ -n "$session_name" ]; then
        target="$sessions_path/session-$session_name"
        log_warn "Se borrará el perfil de la sesión '$session_name' ($target)"
    else
        target="$sessions_path/session-*"
        log_warn "Se borrarán TODOS los perfiles de sesión en $sessions_path"
    fi
    log_warn "La sesión quedará deslogueada → habrá que re-escanear el QR."

    if [ "$assume_yes" != "true" ]; then
        read -r -p "¿Continuar? [y/N] " ans
        case "$ans" in
            y|Y) ;;
            *) log_info "Cancelado"; return 0 ;;
        esac
    fi

    log_info "Borrando perfil(es) de Chromium y cache de wwebjs..."
    # Preferimos exec (contenedor vivo, que es el caso normal cuando se cuelga).
    # Fallback a un contenedor temporal que monta el volumen si el api está caído.
    if docker compose exec -T openwa-api sh -c "rm -rf $target /app/.wwebjs_cache" 2>/dev/null; then
        log_success "Perfil(es) borrado(s)"
    else
        log_warn "No se pudo via exec (¿contenedor caído?); intento con contenedor temporal..."
        if docker compose run --rm --no-deps -T --entrypoint sh openwa-api -c "rm -rf $target"; then
            log_success "Perfil(es) borrado(s) (volumen)"
        else
            log_error "No se pudo borrar el perfil"
            return 1
        fi
    fi

    log_info "Reiniciando openwa-api con perfil limpio..."
    docker compose restart openwa-api

    echo ""
    log_success "Listo. Andá al dashboard y dale Start → debería mostrar un QR limpio."
    log_info "Dashboard: http://localhost:${DASHBOARD_PORT:-2886}"
}

# Show help
cmd_help() {
    echo ""
    echo "OpenWA Smart Orchestration Script"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start       Start OpenWA with auto-detected profiles"
    echo "  stop        Stop all OpenWA containers"
    echo "  restart     Restart OpenWA"
    echo "  status      Show container status"
    echo "  logs        Show logs (default: openwa-api)"
    echo "  build       Build Docker images"
    echo "  update      Pull latest code and restart"
    echo "  clean-restore [session] [--yes]  Borra el perfil de Chromium corrupto y reinicia"
    echo "                                   (arregla 'stuck loading / sin QR'; requiere re-escanear)"
    echo "  help        Show this help"
    echo ""
    echo "Profile activation is automatic based on .env:"
    echo "  POSTGRES_BUILTIN=true  → activates postgres profile"
    echo "  REDIS_BUILTIN=true     → activates redis profile"
    echo "  MINIO_BUILTIN=true     → activates minio profile"
    echo ""
}

# Main
case "${1:-help}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    status)  cmd_status ;;
    logs)    cmd_logs "${2:-}" "${3:-}" ;;
    build)   cmd_build ;;
    update)  cmd_update ;;
    clean-restore|cleanrestore) cmd_clean_restore "${@:2}" ;;
    help)    cmd_help ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
