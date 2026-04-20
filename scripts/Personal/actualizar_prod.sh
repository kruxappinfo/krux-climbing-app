#!/bin/bash

# 1. Navegar a la carpeta del proyecto
cd /Users/jaimelillo/krux-climbing-app/scripts/Personal || { echo "❌ Error: No se encuentra la carpeta"; exit 1; }

# 2. Verificar que estamos en main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Estás en '$CURRENT_BRANCH'. Para subir a producción debes estar en 'main'."
    echo "   ¿Cambiar a main y continuar? (s/n):"
    read confirm
    if [ "$confirm" = "s" ]; then
        git checkout main || { echo "❌ Error al cambiar a main"; exit 1; }
    else
        echo "Operación cancelada."
        exit 0
    fi
fi

echo "🚀 Rama activa: main (PRODUCCIÓN)"
echo "⚠️  Los cambios que subas aquí se desplegarán en Netlify."
echo "   ¿Continuar? (s/n):"
read confirm
if [ "$confirm" != "s" ]; then
    echo "Operación cancelada."
    exit 0
fi

# 3. Pedir mensaje del commit
echo "📦 ¿Qué cambios has hecho? (Escribe el mensaje del commit):"
read message

if [ -z "$message" ]; then
    message="Actualización producción $(date +'%d/%m/%Y')"
fi

# 4. Ejecutar el ciclo de Git
echo "🚀 Iniciando actualización en main..."

git add .

if git commit -m "$message"; then
    echo "✅ Cambios guardados localmente."
else
    echo "⚠️ No había cambios nuevos para guardar."
fi

# 5. Sincronización
echo "🔄 Syncing con GitHub (main)..."

git pull origin main || {
    echo "❌ CONFLICTO DETECTADO.";
    echo "   Resuelve los conflictos antes de continuar.";
    exit 1;
}

# 6. Subir a main → dispara Netlify
echo "⬆️ Subiendo cambios a producción..."
if git push origin main; then
    echo "✅ ¡Producción actualizada! Netlify está desplegando los cambios."
else
    echo "❌ Error al subir a GitHub."
    exit 1
fi
