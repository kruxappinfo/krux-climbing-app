#!/bin/bash
# =============================================================================
# KRUX - GeoJSON Sync
# Ejecuta este script en local y olvídate.
# Vigila Cartografia/ y sincroniza automáticamente a www/, iOS y Android.
# Detecta nuevas escuelas sin necesidad de cambiar el script.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
CARTOGRAFIA_SRC="$PROJECT_ROOT/Cartografia"
CARTOGRAFIA_WWW="$PROJECT_ROOT/www/Cartografia"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
CYAN='\033[0;36m';  BOLD='\033[1m';      NC='\033[0m'

# ── Copia un archivo a www/ preservando su ruta dentro de Cartografia/ ────────
sync_file() {
  local src="$1"
  local rel="${src#"$CARTOGRAFIA_SRC"/}"
  local dst="$CARTOGRAFIA_WWW/$rel"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo -e "  ${GREEN}✓${NC} ${CYAN}${rel}${NC}"
}

# ── Copia todos los GeoJSON actuales ──────────────────────────────────────────
sync_all() {
  echo -e "${YELLOW}🔄 Sincronizando todos los GeoJSON → www/${NC}"
  local n=0
  while IFS= read -r -d '' f; do
    sync_file "$f"; ((n++)) || true
  done < <(find "$CARTOGRAFIA_SRC" -name "*.geojson" -print0 | sort -z)
  echo -e "  ${BOLD}${n} archivo(s) listos${NC}"
}

# ── Lanza cap sync para iOS y Android ────────────────────────────────────────
cap_sync() {
  echo -e "${YELLOW}📱 Sincronizando iOS y Android...${NC}"
  local cap=""
  [[ -x "$PROJECT_ROOT/node_modules/.bin/cap" ]] && cap="$PROJECT_ROOT/node_modules/.bin/cap"
  command -v npx &>/dev/null && [[ -z "$cap" ]] && cap="npx cap"

  if [[ -z "$cap" ]]; then
    echo -e "  ⚠️  Capacitor no encontrado — ejecuta manualmente: npx cap sync"
    return
  fi
  $cap sync 2>&1 | grep -E "(Sync|copy|update|error|Error)" | sed "s/^/  /" || true
  echo -e "  ${GREEN}✓ cap sync completado${NC}"
}

# ── Reacción a un cambio detectado ───────────────────────────────────────────
on_change() {
  local file="$1"
  [[ "$file" != *.geojson ]] && return
  echo ""
  echo -e "${YELLOW}🔔 Cambio detectado:${NC} ${CYAN}${file#"$PROJECT_ROOT"/}${NC}"
  sync_file "$file"
  cap_sync
  echo -e "${BLUE}────────────────────────────────${NC}"
  echo -e "  Esperando cambios... (Ctrl+C para salir)"
}

# ── Motor de vigilancia ───────────────────────────────────────────────────────
start_watch() {
  if command -v inotifywait &>/dev/null; then
    echo -e "  Motor: ${CYAN}inotifywait${NC}"
    inotifywait -m -r -e close_write,moved_to,create \
      --format '%w%f' "$CARTOGRAFIA_SRC" 2>/dev/null \
    | while IFS= read -r f; do on_change "$f"; done

  elif command -v fswatch &>/dev/null; then
    echo -e "  Motor: ${CYAN}fswatch${NC}"
    fswatch -r --event Updated --event Created --event Renamed "$CARTOGRAFIA_SRC" \
    | while IFS= read -r f; do on_change "$f"; done

  else
    echo -e "  Motor: ${CYAN}polling${NC} (instala inotify-tools en Linux o fswatch en Mac para reactividad instantánea)"
    declare -A mtimes
    while IFS= read -r -d '' f; do
      mtimes["$f"]="$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)"
    done < <(find "$CARTOGRAFIA_SRC" -name "*.geojson" -print0)

    while true; do
      sleep 2
      while IFS= read -r -d '' f; do
        local m; m="$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null)"
        [[ "${mtimes[$f]:-}" != "$m" ]] && { mtimes["$f"]="$m"; on_change "$f"; }
      done < <(find "$CARTOGRAFIA_SRC" -name "*.geojson" -print0)
    done
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}🗺️  KRUX GeoJSON Sync${NC}"
echo -e "${BLUE}════════════════════════════════${NC}"

sync_all
cap_sync

echo ""
echo -e "${BLUE}════════════════════════════════${NC}"
echo -e "${YELLOW}👁️  Vigilando Cartografia/ — Ctrl+C para salir${NC}"
start_watch
