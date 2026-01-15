#!/bin/bash

# Script rápido para sincronizar cambios con iOS
echo "🔄 Sincronizando cambios con iOS..."
echo ""

# Sincronizar con Capacitor
echo "📱 Sincronizando con Capacitor..."
npx cap sync ios

echo ""
echo "✅ Sincronización completada!"
echo ""
echo "📱 Ahora en Xcode:"
echo "   1. Product → Clean Build Folder (⇧⌘K)"
echo "   2. Product → Build (⌘B)"
echo "   3. Product → Run (⌘R)"
echo ""
echo "💡 Tip: Si los cambios no aparecen, limpia el build y reinstala la app"
