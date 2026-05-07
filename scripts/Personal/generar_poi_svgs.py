#!/usr/bin/env python3
"""
Genera SVGs profesionales de POIs estilo Google Maps / Material Design.
Cada SVG tiene un pin con sombra, círculo blanco interior, e icono específico.

Uso:
  python3 generar_poi_svgs.py
"""
import os
import sys

# Carpetas destino (proyecto principal y www/ para Capacitor)
TARGETS = [
    "/Users/jaimelillo/krux/assets/poi-icons",
    "/Users/jaimelillo/krux/www/assets/poi-icons",
]

# Paleta de colores por categoría (más vivos y modernos)
COLORS = {
    "alojamientos": "#1976D2",   # Azul
    "estado":       "#D32F2F",   # Rojo
    "naturaleza":   "#388E3C",   # Verde
    "servicios":    "#F57C00",   # Naranja
    "infra":        "#455A64",   # Gris azulado
    "patrimonio":   "#7B1FA2",   # Morado
    "instalaciones":"#00838F",   # Verde-azul
}

# ViewBox 64x80: pin centrado, base en 76, icono dentro de círculo de radio 16 en (32, 28)
VIEWBOX = "0 0 64 80"

def pin_template(color, icon_paths):
    """Template del pin: sombra, cuerpo, círculo blanco e icono interior."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VIEWBOX}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2"/>
      <feOffset dy="1.5"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#s)">
    <path d="M32 2 C17 2 6 13 6 28 C6 42 18 56 32 76 C46 56 58 42 58 28 C58 13 47 2 32 2 Z" fill="{color}"/>
    <circle cx="32" cy="28" r="17" fill="#FFFFFF"/>
  </g>
  <g transform="translate(32 28)" fill="{color}" stroke="{color}" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
    {icon_paths}
  </g>
</svg>
'''

# ICONOS — coordenadas relativas al centro del círculo (0,0), área útil ≈ ±11
# Los iconos usan paths SVG limpios diseñados a mano. Stroke=2 con linecap round.
ICONS = {
    # ALOJAMIENTOS — azul
    "camping": ("alojamientos", '''
        <path d="M-10 8 L0 -10 L10 8 Z" fill="none"/>
        <path d="M-3 8 L0 -2 L3 8 Z" fill="{c}" stroke="none"/>
    '''),
    "hotel": ("alojamientos", '''
        <rect x="-9" y="-9" width="18" height="18" rx="1" fill="none"/>
        <rect x="-6" y="-6" width="3" height="3" fill="{c}" stroke="none"/>
        <rect x="-1.5" y="-6" width="3" height="3" fill="{c}" stroke="none"/>
        <rect x="3" y="-6" width="3" height="3" fill="{c}" stroke="none"/>
        <rect x="-6" y="-1.5" width="3" height="3" fill="{c}" stroke="none"/>
        <rect x="-1.5" y="-1.5" width="3" height="3" fill="{c}" stroke="none"/>
        <rect x="3" y="-1.5" width="3" height="3" fill="{c}" stroke="none"/>
        <rect x="-2.5" y="3" width="5" height="6" fill="{c}" stroke="none"/>
    '''),
    "refugio": ("alojamientos", '''
        <path d="M-10 9 L-10 0 L0 -9 L10 0 L10 9 Z" fill="none"/>
        <path d="M-4 9 L-4 2 L4 2 L4 9 Z" fill="{c}" stroke="none"/>
        <circle cx="0" cy="-2" r="1.5" fill="{c}" stroke="none"/>
    '''),
    "albergue": ("alojamientos", '''
        <path d="M-10 9 L-10 -2 L0 -10 L10 -2 L10 9 Z" fill="none"/>
        <rect x="-3" y="2" width="6" height="7" fill="{c}" stroke="none"/>
    '''),
    "vivac": ("alojamientos", '''
        <path d="M-10 8 L0 -8 L10 8 Z" fill="none"/>
        <path d="M0 -8 L0 -11" fill="none"/>
        <path d="M-3 8 L0 0 L3 8 Z" fill="{c}" stroke="none"/>
    '''),

    # ESTADO — rojo
    "hospital": ("estado", '''
        <rect x="-3" y="-9" width="6" height="18" fill="{c}" stroke="none"/>
        <rect x="-9" y="-3" width="18" height="6" fill="{c}" stroke="none"/>
    '''),
    "bomberos": ("estado", '''
        <path d="M0 -10 C-2 -5 -6 -3 -6 2 C-6 7 -3 10 0 10 C3 10 6 7 6 2 C6 -3 2 -5 0 -10 Z" fill="{c}" stroke="none"/>
        <path d="M0 -2 C-1 0 -3 1 -3 4 C-3 6 -1 8 0 8 C1 8 3 6 3 4 C3 1 1 0 0 -2 Z" fill="#FFFFFF" stroke="none"/>
    '''),
    "farmacia": ("estado", '''
        <rect x="-2.5" y="-9" width="5" height="18" fill="{c}" stroke="none"/>
        <rect x="-9" y="-2.5" width="18" height="5" fill="{c}" stroke="none"/>
    '''),
    "policia": ("estado", '''
        <path d="M0 -10 L2.5 -3 L10 -3 L4 1.5 L6.5 9 L0 5 L-6.5 9 L-4 1.5 L-10 -3 L-2.5 -3 Z" fill="{c}" stroke="none"/>
    '''),
    "peligro": ("estado", '''
        <path d="M0 -10 L10 9 L-10 9 Z" fill="none"/>
        <rect x="-1.2" y="-4" width="2.4" height="7" fill="{c}" stroke="none"/>
        <circle cx="0" cy="6" r="1.4" fill="{c}" stroke="none"/>
    '''),

    # NATURALEZA — verde
    "cumbre": ("naturaleza", '''
        <path d="M-10 8 L-3 -3 L1 4 L4 -2 L10 8 Z" fill="none"/>
        <path d="M-4 -3 L-2 -7 L0 -3 Z" fill="{c}" stroke="none"/>
    '''),
    "rio": ("naturaleza", '''
        <path d="M-10 -5 Q-5 -8 0 -5 T10 -5" fill="none" stroke-width="2.2"/>
        <path d="M-10 1 Q-5 -2 0 1 T10 1" fill="none" stroke-width="2.2"/>
        <path d="M-10 7 Q-5 4 0 7 T10 7" fill="none" stroke-width="2.2"/>
    '''),
    "arroyo": ("naturaleza", '''
        <path d="M-10 -3 Q-5 -6 0 -3 T10 -3" fill="none"/>
        <path d="M-10 5 Q-5 2 0 5 T10 5" fill="none"/>
    '''),
    "agua": ("naturaleza", '''
        <path d="M0 -10 C-6 -2 -7 4 -7 6 C-7 9 -3 11 0 11 C3 11 7 9 7 6 C7 4 6 -2 0 -10 Z" fill="{c}" stroke="none"/>
    '''),
    "fuente": ("naturaleza", '''
        <path d="M0 -8 C-3 -4 -5 -1 -5 2 L5 2 C5 -1 3 -4 0 -8 Z" fill="{c}" stroke="none"/>
        <path d="M-7 5 L7 5" fill="none"/>
        <path d="M-7 5 C-7 8 -3 10 0 10 C3 10 7 8 7 5" fill="none"/>
    '''),
    "cueva": ("naturaleza", '''
        <path d="M-10 9 L-10 2 C-10 -5 -5 -9 0 -9 C5 -9 10 -5 10 2 L10 9" fill="none"/>
        <path d="M-3 9 L-3 4 C-3 1 -1 -1 0 -1 C1 -1 3 1 3 4 L3 9 Z" fill="{c}" stroke="none"/>
    '''),

    # SERVICIOS — naranja
    "restaurante": ("servicios", '''
        <path d="M-7 -10 L-7 -1 C-7 1 -5 3 -3 3 L-3 10" fill="none"/>
        <path d="M-7 -10 L-7 -3" fill="none"/>
        <path d="M-3 -10 L-3 -3" fill="none"/>
        <path d="M7 -10 C5 -10 3 -7 3 -3 C3 0 5 2 7 2 L7 10" fill="none"/>
    '''),
    "bar": ("servicios", '''
        <path d="M-8 -8 L8 -8 L0 2 Z" fill="{c}" stroke="none"/>
        <path d="M0 2 L0 9" fill="none"/>
        <path d="M-5 9 L5 9" fill="none"/>
        <circle cx="-6" cy="-10" r="1.5" fill="{c}" stroke="none"/>
    '''),
    "gasolinera": ("servicios", '''
        <rect x="-9" y="-9" width="11" height="18" rx="0.5" fill="none"/>
        <rect x="-9" y="-9" width="11" height="6" fill="{c}" stroke="none"/>
        <path d="M2 -3 L5 -3 C6.5 -3 8 -2 8 0 L8 6 C8 7 9 8 10 8" fill="none"/>
        <path d="M10 8 L10 4" fill="none"/>
    '''),
    "merendero": ("servicios", '''
        <path d="M-10 -2 L0 -8 L10 -2 Z" fill="none"/>
        <rect x="-7" y="-2" width="14" height="3" fill="{c}" stroke="none"/>
        <path d="M-5 1 L-5 9" fill="none"/>
        <path d="M5 1 L5 9" fill="none"/>
    '''),
    "supermercado": ("servicios", '''
        <path d="M-9 -7 L-7 -7 L-4 4 L8 4 L10 -3 L-5 -3" fill="none"/>
        <circle cx="-2" cy="8" r="1.5" fill="{c}" stroke="none"/>
        <circle cx="6" cy="8" r="1.5" fill="{c}" stroke="none"/>
    '''),
    "tienda": ("servicios", '''
        <path d="M-9 -3 L-7 -8 L7 -8 L9 -3" fill="none"/>
        <rect x="-9" y="-3" width="18" height="12" fill="none"/>
        <path d="M-3 -3 C-3 0 -1.5 2 0 2 C1.5 2 3 0 3 -3" fill="none"/>
    '''),
    "banco": ("servicios", '''
        <path d="M-10 -4 L0 -10 L10 -4 Z" fill="{c}" stroke="none"/>
        <rect x="-10" y="-3" width="20" height="2" fill="{c}" stroke="none"/>
        <rect x="-8" y="0" width="2" height="7" fill="{c}" stroke="none"/>
        <rect x="-1" y="0" width="2" height="7" fill="{c}" stroke="none"/>
        <rect x="6" y="0" width="2" height="7" fill="{c}" stroke="none"/>
        <rect x="-10" y="8" width="20" height="2" fill="{c}" stroke="none"/>
    '''),

    # INFRAESTRUCTURA — gris
    "puente": ("infra", '''
        <path d="M-10 -3 C-5 -3 -5 -7 0 -7 C5 -7 5 -3 10 -3" fill="none"/>
        <path d="M-10 -3 L-10 4" fill="none"/>
        <path d="M-5 -3 L-5 4" fill="none"/>
        <path d="M0 -7 L0 4" fill="none"/>
        <path d="M5 -3 L5 4" fill="none"/>
        <path d="M10 -3 L10 4" fill="none"/>
        <path d="M-10 8 Q-5 5 0 8 T10 8" fill="none"/>
    '''),
    "escalera": ("infra", '''
        <path d="M-10 9 L-10 5 L-5 5 L-5 1 L0 1 L0 -3 L5 -3 L5 -7 L10 -7" fill="none"/>
        <path d="M-10 9 L10 9" fill="none"/>
    '''),
    "mirador": ("infra", '''
        <path d="M-10 0 C-7 -7 -3 -10 0 -10 C3 -10 7 -7 10 0 C7 7 3 10 0 10 C-3 10 -7 7 -10 0 Z" fill="none"/>
        <circle cx="0" cy="0" r="4" fill="{c}" stroke="none"/>
    '''),
    "parking": ("infra", '''
        <path d="M-5 9 L-5 -9 L2 -9 C5.5 -9 8 -6 8 -3 C8 0 5.5 3 2 3 L-5 3" fill="none" stroke-width="3"/>
    '''),
    "correos": ("infra", '''
        <rect x="-10" y="-6" width="20" height="13" rx="0.5" fill="none"/>
        <path d="M-10 -6 L0 2 L10 -6" fill="none"/>
    '''),
    "informacion": ("infra", '''
        <circle cx="0" cy="0" r="9" fill="none" stroke-width="2.2"/>
        <circle cx="0" cy="-4" r="1.3" fill="{c}" stroke="none"/>
        <path d="M0 -1 L0 5" stroke-width="2.5"/>
    '''),

    # PATRIMONIO — morado
    "iglesia": ("patrimonio", '''
        <path d="M-9 9 L-9 1 L0 -5 L9 1 L9 9 Z" fill="none"/>
        <rect x="-3" y="2" width="6" height="7" fill="{c}" stroke="none"/>
        <path d="M0 -10 L0 -2" fill="none"/>
        <path d="M-3 -7 L3 -7" fill="none"/>
    '''),
    "ermita": ("patrimonio", '''
        <path d="M-7 9 L-7 2 L0 -4 L7 2 L7 9 Z" fill="none"/>
        <rect x="-2" y="3" width="4" height="6" fill="{c}" stroke="none"/>
        <path d="M0 -9 L0 -3" fill="none"/>
        <path d="M-2 -7 L2 -7" fill="none"/>
    '''),
    "ruina": ("patrimonio", '''
        <path d="M-9 9 L-9 -2 L-5 -2 L-5 -7 L-1 -7 L-1 -2 L1 -2 L1 -9 L5 -9 L5 -2 L9 -2 L9 9 Z" fill="none"/>
        <path d="M-9 9 L9 9" fill="none"/>
        <path d="M-9 1 L9 1" fill="none"/>
    '''),

    # INSTALACIONES — verde-azul
    "bano": ("instalaciones", '''
        <circle cx="-5" cy="-6" r="2.2" fill="{c}" stroke="none"/>
        <path d="M-8 -3 L-8 3 L-6 3 L-6 9 L-4 9 L-4 3 L-2 3 L-2 -3 Z" fill="{c}" stroke="none"/>
        <circle cx="5" cy="-6" r="2.2" fill="{c}" stroke="none"/>
        <path d="M2 -3 L5 -3 L8 -3 L8 3 L6.5 3 L7 9 L3 9 L3.5 3 L2 3 Z" fill="{c}" stroke="none"/>
    '''),
    "wc": ("instalaciones", '''
        <circle cx="-5" cy="-7" r="2" fill="{c}" stroke="none"/>
        <path d="M-5 -5 L-5 3" fill="none"/>
        <path d="M-9 -2 L-1 -2" fill="none"/>
        <path d="M-5 3 L-8 9" fill="none"/>
        <path d="M-5 3 L-2 9" fill="none"/>
        <circle cx="5" cy="-7" r="2" fill="{c}" stroke="none"/>
        <path d="M2 -1 L5 -5 L8 -1 L6.5 9 L3.5 9 Z" fill="{c}" stroke="none"/>
    '''),
    "ducha": ("instalaciones", '''
        <path d="M0 -10 L0 -1" fill="none"/>
        <ellipse cx="0" cy="0" rx="7" ry="2.5" fill="{c}" stroke="none"/>
        <path d="M-5 4 L-5 8" fill="none"/>
        <path d="M-2 5 L-2 9" fill="none"/>
        <path d="M2 4 L2 8" fill="none"/>
        <path d="M5 5 L5 9" fill="none"/>
    '''),
    "piscina": ("instalaciones", '''
        <circle cx="6" cy="-6" r="2" fill="{c}" stroke="none"/>
        <path d="M-6 0 L-2 -3 L4 0 L7 -2" fill="none"/>
        <path d="M-9 5 Q-5 2 -1 5 T7 5 Q9 5 10 4" fill="none"/>
    '''),
    "telefono": ("instalaciones", '''
        <path d="M-9 -7 C-9 -4 -7 1 -2 6 C3 11 8 11 9 9 L9 5 L4 3 L1 6 C-2 4 -4 2 -6 -1 L-3 -4 L-5 -9 L-9 -9 Z" fill="{c}" stroke="none"/>
    '''),
}

# Aliases (mismo SVG diferente nombre)
ALIASES = {
    "bombero": "bomberos",
}


def render_svg(icon_name, category, paths_template):
    """Renderiza un SVG sustituyendo el color en los placeholders {c}."""
    color = COLORS[category]
    # Reemplazar {c} en los paths del icono
    icon_paths = paths_template.replace("{c}", color)
    return pin_template(color, icon_paths)


def main():
    for tgt in TARGETS:
        os.makedirs(tgt, exist_ok=True)

    generated = 0
    for name, (cat, tmpl) in ICONS.items():
        svg = render_svg(name, cat, tmpl)
        for tgt in TARGETS:
            path = os.path.join(tgt, f"{name}.svg")
            with open(path, "w") as f:
                f.write(svg)
        generated += 1

    # Aliases: copiar el SVG del icono original con el nombre alias
    for alias, target in ALIASES.items():
        for tgt in TARGETS:
            src = os.path.join(tgt, f"{target}.svg")
            dst = os.path.join(tgt, f"{alias}.svg")
            if os.path.exists(src):
                with open(src) as f:
                    content = f.read()
                with open(dst, "w") as f:
                    f.write(content)
                generated += 1

    print(f"Generados {generated} SVGs en {len(TARGETS)} carpetas")
    for tgt in TARGETS:
        print(f"  {tgt}")


if __name__ == "__main__":
    main()
