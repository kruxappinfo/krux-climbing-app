#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

PROTECTED="origin/HEAD origin/dev origin/main"

# Obtener ramas remotas a borrar
BRANCHES=$(git branch -r | grep -v "origin/HEAD\|origin/dev\|origin/main" | sed 's/origin\///' | sed 's/^[[:space:]]*//')

if [ -z "$BRANCHES" ]; then
  echo "No hay ramas que borrar. Solo existen dev y main."
  exit 0
fi

echo ""
echo "Ramas remotas que se eliminarán:"
echo "────────────────────────────────────────────────"
echo "$BRANCHES"
echo "────────────────────────────────────────────────"
echo "Total: $(echo "$BRANCHES" | wc -l | tr -d ' ') ramas"
echo ""
read -p "¿Confirmas el borrado? (s/n): " CONFIRM

if [ "$CONFIRM" != "s" ]; then
  echo "Operación cancelada."
  exit 0
fi

echo ""
echo "$BRANCHES" | xargs -I{} git push origin --delete {}

echo ""
echo "✓ Hecho. Solo quedan dev y main en el repositorio remoto."
