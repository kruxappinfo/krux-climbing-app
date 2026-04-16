# Flujo de Trabajo - KRUX App

---

## Arrancar el entorno

```bash
krux
```

Esto hace dos cosas a la vez:
- **Nueva ventana Terminal** → arranca el servidor en `localhost:8080`
- **Terminal actual** → te deja en la carpeta del proyecto lista para git

---

## Flujo diario

### 1. Trabajar con Claude Code
Claude Code crea un worktree automáticamente para cada tarea.

### 2. Cuando tengas un cambio listo:

**Si te gusta → merge a dev**
```bash
git checkout dev
git merge fix/nombre-del-cambio
```

**Si no te gusta → borrar el worktree**
```bash
git worktree remove nombre-del-worktree
# O forzar el borrado:
git worktree remove --force nombre-del-worktree
```

### 3. Publicar en producción
```bash
bash /Users/jaimelillo/Downloads/APP/prod_actualizar.sh
```

---

## Recuperar una versión anterior

Cada commit es una "foto" completa del proyecto.

```bash
# 1. Ver el historial de commits
git log --oneline

# 2. Volver TODO el proyecto a un commit anterior
git checkout c217ae2   # sustituye por el hash que necesites
```

> ⚠️ Git te avisará de "detached HEAD". Para volver al presente:
> ```bash
> git checkout dev
> ```

---

## Referencia rápida de ramas

| Rama | Uso |
|------|-----|
| `main` | Versión oficial, lo que ven los usuarios |
| `dev` | Desarrollo y pruebas |
| `fix/...` | Cambios puntuales, se borran cuando terminan |
