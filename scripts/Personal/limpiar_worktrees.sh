#!/bin/bash

# ─────────────────────────────────────────
#  LIMPIADOR DE WORKTREES DE CLAUDE
#  Elimina todos los worktrees en .claude/worktrees/
#  manteniendo intacto el repositorio principal
# ─────────────────────────────────────────

REPO="/Users/jaimelillo/krux-climbing-app"
WORKTREES_DIR="$REPO/.claude/worktrees"

cd "$REPO" || { echo "❌ No se encuentra el repositorio en $REPO"; exit 1; }

echo "🔍 Buscando worktrees en: $WORKTREES_DIR"
echo ""

# Obtener lista de worktrees (excluye el principal)
WORKTREES=$(git worktree list | tail -n +2 | awk '{print $1}')
TOTAL=$(echo "$WORKTREES" | grep -c "$WORKTREES_DIR" || true)

if [ "$TOTAL" -eq 0 ]; then
    echo "✅ No hay worktrees que limpiar."
    exit 0
fi

echo "📋 Se encontraron $TOTAL worktrees:"
git worktree list | tail -n +2 | grep "$WORKTREES_DIR" | awk '{printf "   • %-55s %s\n", $1, $3}'
echo ""
echo "⚠️  ¿Eliminar todos estos worktrees? (s/n):"
read confirm

if [ "$confirm" != "s" ]; then
    echo "Operación cancelada."
    exit 0
fi

echo ""
ELIMINADOS=0
ERRORES=0

# Eliminar cada worktree
while IFS= read -r worktree_path; do
    if [[ "$worktree_path" == "$WORKTREES_DIR"* ]]; then
        BRANCH=$(git worktree list | grep "$worktree_path" | awk '{print $3}' | tr -d '[]')
        echo -n "   🗑️  Eliminando $worktree_path... "

        if git worktree remove "$worktree_path" --force 2>/dev/null; then
            echo "✅"
            ((ELIMINADOS++))
        else
            echo "❌ (error)"
            ((ERRORES++))
        fi
    fi
done <<< "$WORKTREES"

# Limpiar referencias huérfanas
echo ""
echo "🧹 Limpiando referencias huérfanas..."
git worktree prune

echo ""
echo "────────────────────────────────────"
echo "✅ Eliminados: $ELIMINADOS worktrees"
[ "$ERRORES" -gt 0 ] && echo "❌ Errores:    $ERRORES worktrees (puede que tengan cambios sin guardar)"
echo ""
echo "📊 Estado actual:"
git worktree list
echo "────────────────────────────────────"
