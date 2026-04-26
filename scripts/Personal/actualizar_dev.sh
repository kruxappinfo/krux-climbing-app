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

# 3. Pedir al usuario el mensaje del commit
echo "📦 ¿Qué cambios has hecho? (Escribe el mensaje del commit):"
read message

if [ -z "$message" ]; then
    message="Dev: actualización $(date +'%d/%m/%Y %H:%M')"
fi

# 4. Ejecutar el ciclo de Git
echo "🚀 Iniciando actualización en dev..."

git add .

if git commit -m "$message"; then
    echo "✅ Cambios guardados localmente."
else
    echo "⚠️ No había cambios nuevos para guardar."
fi

# 5. Guardar cambios residuales antes del rebase
STASH_OUTPUT=$(git stash 2>&1)
STASHED=false
if echo "$STASH_OUTPUT" | grep -q "Saved working directory"; then
    STASHED=true
    echo "📦 Cambios residuales guardados temporalmente."
fi

# 6. Sincronización con rebase para evitar el error de ramas divergentes
echo "🔄 Syncing con GitHub (dev)..."

git pull --rebase origin dev || {
    echo "❌ CONFLICTO DETECTADO en dev.";
    echo "   Resuelve los conflictos y luego ejecuta: git rebase --continue";
    exit 1;
}

# 7. Restaurar cambios residuales si los había
if [ "$STASHED" = true ]; then
    git stash pop || echo "⚠️ No se pudieron restaurar los cambios del stash."
fi

# 8. Subir a dev
echo "⬆️ Subiendo cambios a dev..."
if git push origin dev; then
    echo "✅ Rama dev actualizada en GitHub."
    echo ""
    echo "👉 Cuando estés listo para producción, ejecuta: actualizar_prod.sh"
else
    echo "❌ Error al subir a GitHub."
    exit 1
fi