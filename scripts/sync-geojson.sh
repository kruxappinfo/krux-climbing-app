#!/bin/bash
# =============================================================================
# KRUX - GeoJSON Sync
# Sincroniza archivos GeoJSON de Cartografia/ a www/ y plataformas nativas.
# Soporta nuevas escuelas/carpetas automáticamente.
#
# Uso:
#   ./scripts/sync-geojson.sh              # Sincroniza todos los GeoJSON ahora
#   ./scripts/sync-geojson.sh --watch      # Vigila cambios continuamente
#   ./scripts/sync-geojson.sh --mobile     # Sincroniza + ejecuta cap sync (iOS/Android)
#   ./scripts/sync-geojson.sh --watch --mobile
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CARTOGRAFIA_SRC="$PROJECT_ROOT/Cartografia"
CARTOGRAFIA_WWW="$PROJECT_ROOT/www/Cartografia"
POLL_INTERVAL=2   # segundos entre comprobaciones en modo polling

# ── Colores ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
RED='\033[0;31m';   CYAN='\033[0;36m';  BOLD='\033[1m'; NC='\033[0m'

# ── Flags ────────────────────────────────────────────────────────────────────
MODE="sync"       # sync | watch
DO_MOBILE=false

# ── Ayuda ────────────────────────────────────────────────────────────────────
usage() {
  echo -e "${BOLD}KRUX GeoJSON Sync${NC}"
  echo ""
  echo "Sincroniza cualquier .geojson de Cartografia/ → www/Cartografia/ y"
  echo "opcionalmente lanza cap sync para iOS y Android."
  echo ""
  echo -e "${BOLD}Uso:${NC}"
  echo "  $0 [opciones]"
  echo ""
  echo -e "${BOLD}Opciones:${NC}"
  echo "  --watch     Vigila cambios continuamente (usa inotifywait, fswatch o polling)"
  echo "  --mobile    Ejecuta 'npx cap sync' tras cada sincronización (iOS/Android)"
  echo "  -h, --help  Muestra esta ayuda"
  echo ""
  echo -e "${BOLD}Ejemplos:${NC}"
  echo "  $0                        # Copia puntual de todos los GeoJSON"
  echo "  $0 --watch                # Modo vigía (solo web/PWA)"
  echo "  $0 --watch --mobile       # Modo vigía + sync nativo en cada cambio"
  echo "  $0 --mobile               # Copia puntual + cap sync completo"
}

# ── Parseo de argumentos ─────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --watch)   MODE="watch" ;;
    --mobile)  DO_MOBILE=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}Opción desconocida: $1${NC}"; usage; exit 1 ;;
  esac
  shift
done

# ── Funciones de utilidad ─────────────────────────────────────────────────────

log_header() {
  echo ""
  echo -e "${BOLD}${BLUE}🗺️  KRUX GeoJSON Sync${NC}"
  echo -e "${BLUE}════════════════════════════════${NC}"
}

# Copia un único archivo preservando la estructura de carpetas.
# Funciona con cualquier escuela nueva que se añada en el futuro.
sync_file() {
  local src_file="$1"
  local rel_path="${src_file#"$CARTOGRAFIA_SRC"/}"
  local dst_file="$CARTOGRAFIA_WWW/$rel_path"

  mkdir -p "$(dirname "$dst_file")"
  cp "$src_file" "$dst_file"
  echo -e "  ${GREEN}✓${NC} ${CYAN}${rel_path}${NC}"
}

# Sincroniza todos los .geojson de Cartografia/ (recursivo)
sync_all() {
  echo -e "${YELLOW}🔄 Sincronizando GeoJSON → www/Cartografia/${NC}"
  local count=0
  while IFS= read -r -d '' file; do
    sync_file "$file"
    ((count++)) || true
  done < <(find "$CARTOGRAFIA_SRC" -name "*.geojson" -print0 | sort -z)
  echo -e "  ${BOLD}${count} archivo(s) sincronizados${NC}"
}

# Ejecuta cap sync para iOS y Android
cap_sync() {
  echo ""
  echo -e "${YELLOW}📱 Ejecutando cap sync (iOS + Android)...${NC}"
  local cap_bin=""
  if [[ -x "$PROJECT_ROOT/node_modules/.bin/cap" ]]; then
    cap_bin="$PROJECT_ROOT/node_modules/.bin/cap"
  elif command -v npx &>/dev/null; then
    cap_bin="npx cap"
  fi

  if [[ -z "$cap_bin" ]]; then
    echo -e "  ${RED}⚠️  Capacitor no encontrado. Ejecuta manualmente: npx cap sync${NC}"
    return
  fi

  if $cap_bin sync 2>&1 | grep -E "(Sync|copy|update|error|Error)" | \
      sed "s/^/  /"; then
    echo -e "  ${GREEN}✓ cap sync completado${NC}"
  else
    echo -e "  ${RED}⚠️  cap sync terminó con errores. Revisa la salida anterior.${NC}"
  fi
}

# ── Detección del motor de vigilancia ────────────────────────────────────────

detect_watcher() {
  if command -v inotifywait &>/dev/null; then
    echo "inotifywait"
  elif command -v fswatch &>/dev/null; then
    echo "fswatch"
  else
    echo "poll"
  fi
}

# ── Modos de vigilancia ───────────────────────────────────────────────────────

# Procesa un archivo cuando se detecta un cambio
on_change() {
  local file="$1"
  if [[ "$file" == *.geojson ]]; then
    local rel="${file#"$PROJECT_ROOT"/}"
    echo ""
    echo -e "${YELLOW}🔔 Cambio detectado:${NC} ${CYAN}${rel}${NC}"
    sync_file "$file"
    if $DO_MOBILE; then
      cap_sync
    fi
    echo -e "${BLUE}────────────────────────────────${NC}"
    echo -e "  Esperando más cambios... (Ctrl+C para salir)"
  fi
}

watch_inotifywait() {
  echo -e "  Motor: ${CYAN}inotifywait${NC} (Linux nativo)"
  echo ""
  inotifywait -m -r \
    -e close_write -e moved_to -e create \
    --format '%w%f' \
    "$CARTOGRAFIA_SRC" 2>/dev/null \
  | while IFS= read -r file; do
      on_change "$file"
    done
}

watch_fswatch() {
  echo -e "  Motor: ${CYAN}fswatch${NC} (macOS)"
  echo ""
  fswatch -r --event Updated --event Created --event Renamed \
    "$CARTOGRAFIA_SRC" \
  | while IFS= read -r file; do
      on_change "$file"
    done
}

watch_poll() {
  echo -e "  Motor: ${CYAN}polling${NC} (cada ${POLL_INTERVAL}s — instala inotify-tools para mayor eficiencia)"
  echo ""
  # Snapshot inicial de fechas de modificación
  declare -A prev_mtimes
  while IFS= read -r -d '' f; do
    prev_mtimes["$f"]="$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)"
  done < <(find "$CARTOGRAFIA_SRC" -name "*.geojson" -print0)

  while true; do
    sleep "$POLL_INTERVAL"
    while IFS= read -r -d '' f; do
      local mtime
      mtime="$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)"
      if [[ "${prev_mtimes[$f]:-}" != "$mtime" ]]; then
        prev_mtimes["$f"]="$mtime"
        on_change "$f"
      fi
    done < <(find "$CARTOGRAFIA_SRC" -name "*.geojson" -print0)
  done
}

watch_mode() {
  local watcher
  watcher="$(detect_watcher)"

  echo -e "${YELLOW}👁️  Modo vigía activo — Cartografia/ (incluye escuelas futuras)${NC}"
  echo -e "${YELLOW}   Ctrl+C para detener${NC}"

  case "$watcher" in
    inotifywait) watch_inotifywait ;;
    fswatch)     watch_fswatch ;;
    poll)        watch_poll ;;
  esac
}

# ── Punto de entrada ──────────────────────────────────────────────────────────

log_header

if [[ "$MODE" == "watch" ]]; then
  # Sincronización inicial antes de activar el vigía
  sync_all
  if $DO_MOBILE; then
    cap_sync
  fi
  echo ""
  echo -e "${BLUE}════════════════════════════════${NC}"
  watch_mode
else
  sync_all
  if $DO_MOBILE; then
    cap_sync
  else
    echo ""
    echo -e "  ${YELLOW}💡 Para sincronizar también con iOS/Android:${NC}"
    echo -e "     $0 --mobile        (puntual)"
    echo -e "     $0 --watch --mobile  (continuo)"
  fi
fi

echo ""
