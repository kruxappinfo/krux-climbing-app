#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo ""
echo "Últimos commits:"
echo "────────────────────────────────────────────────"
git log --oneline -10
echo "────────────────────────────────────────────────"
echo ""
read -p "¿A qué commit quieres volver? (pega el hash): " COMMIT

if [ -z "$COMMIT" ]; then
  echo "No has introducido ningún hash. Abortando."
  exit 1
fi

# Verificar que el commit existe
if ! git cat-file -e "${COMMIT}^{commit}" 2>/dev/null; then
  echo "Error: el commit '$COMMIT' no existe. Abortando."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "Vas a revertir la rama '$BRANCH' al commit:"
git log --oneline -1 "$COMMIT"
echo ""
read -p "¿Confirmas? (s/n): " CONFIRM

if [ "$CONFIRM" != "s" ]; then
  echo "Operación cancelada."
  exit 0
fi

git reset --hard "$COMMIT"
git push --force origin "$BRANCH"

echo ""
echo "✓ Revertido correctamente a $COMMIT y subido a origin/$BRANCH."
