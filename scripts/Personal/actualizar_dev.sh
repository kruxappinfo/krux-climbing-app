#!/bin/bash

# 1. Navegar a la carpeta del proyecto
cd /Users/jaimelillo/krux/scripts/Personal || { echo "❌ Error: No se encuentra la carpeta"; exit 1; }

# 2. Asegurarse de estar en la rama dev
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "dev" ]; then
    echo "⚠️  Estás en la rama '$CURRENT_BRANCH'. Cambiando a 'dev'..."
    git checkout dev || { echo "❌ Error al cambiar a la rama dev"; exit 1; }
fi

echo "🌿 Rama activa: dev"

# 3. Fetch para tener el estado real del remoto
echo "🔄 Obteniendo estado del remoto..."
git fetch origin || { echo "❌ Error al conectar con GitHub"; exit 1; }

# 4. Guardar cambios no commiteados si los hay
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "📦 ¿Qué cambios has hecho? (Escribe el mensaje del commit):"
    read message
    [ -z "$message" ] && message="Dev: actualización $(date +'%d/%m/%Y %H:%M')"

    echo "📝 Staging all changes..."
    git add -A  # Use -A instead of . for better coverage
    
    # Better error handling for commit
    if ! git commit -m "$message"; then
        echo "❌ Error al hacer commit. Detalles:"
        git status
        exit 1
    fi
    echo "✅ Cambios guardados localmente."
else
    echo "ℹ️  No hay cambios nuevos para commitear."
fi

# 5. Rebase contra origin/dev
echo "🔄 Aplicando rebase contra origin/dev..."
git rebase origin/dev || {
    echo "❌ CONFLICTO DETECTADO. Resuélvelos y ejecuta: git rebase --continue"
    exit 1
}

# 6. Subir a dev
echo "⬆️  Subiendo cambios a dev..."
if git push origin dev; then
    echo "✅ Rama dev actualizada en GitHub."
    echo ""
    echo "👉 Cuando estés listo para producción, ejecuta: actualizar_prod.sh"
else
    echo "❌ Error al subir a GitHub. ¿Necesitas --force-with-lease?"
    exit 1
fi
