#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
WWW="$ROOT/www"

FILES=(
  app_3.js
  app_2.css
  app-mobile.css
  user-features.js
  maplibre-map.js
  maplibre-config.js
  index.html
  auth.js
  firebase-config.js
  capacitor-init.js
  mobile-auth.js
  admin.js
  admin-users.js
  admin-users.html
  admin-routes.js
  dev-route-editor.js
  route-drawing.js
  route-drawing.css
  route-photos.js
  sector-images.js
  offline.html
  sw.js
)

echo "🔄 Sincronizando archivos → www/"
for f in "${FILES[@]}"; do
  if [ -f "$ROOT/$f" ]; then
    cp "$ROOT/$f" "$WWW/$f"
    echo "  ✓ $f"
  else
    echo "  ⚠ $f no encontrado en raíz, omitido"
  fi
done

echo ""
echo "📦 Preparando commit..."
git -C "$ROOT" add www/
git -C "$ROOT" commit -m "sync: actualizar www con cambios de raíz" || echo "  (nada nuevo que commitear en www)"
git -C "$ROOT" push origin dev
echo ""
echo "✅ Sync completado"
