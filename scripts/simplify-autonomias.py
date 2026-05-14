#!/usr/bin/env python3
"""
Script para simplificar el GeoJSON de comunidades autónomas
Reduce la resolución para optimizar el tamaño del archivo
"""

import json
import sys
import os

def simplify_coordinates(coords, tolerance=0.0001):
    """
    Simplifica coordenadas eliminando puntos muy cercanos
    tolerance: distancia mínima entre puntos (en grados)
    """
    if len(coords) < 2:
        return coords
    
    simplified = [coords[0]]
    for i in range(1, len(coords)):
        prev = simplified[-1]
        curr = coords[i]
        
        # Calcular distancia euclidiana
        dist = ((curr[0] - prev[0])**2 + (curr[1] - prev[1])**2)**0.5
        
        if dist > tolerance:
            simplified.append(curr)
    
    # Asegurar que el último punto se mantiene si es diferente del primero
    if len(simplified) > 1 and simplified[-1] != simplified[0]:
        simplified.append(simplified[0])
    
    return simplified

def simplify_geometry(geom, tolerance=0.0001):
    """Simplifica una geometría recursivamente"""
    if geom['type'] == 'Point':
        return geom
    elif geom['type'] == 'LineString':
        coords = simplify_coordinates(geom['coordinates'], tolerance)
        return {
            'type': 'LineString',
            'coordinates': coords
        }
    elif geom['type'] == 'MultiLineString':
        simplified = []
        for line in geom['coordinates']:
            simplified_line = simplify_coordinates(line, tolerance)
            if len(simplified_line) > 1:
                simplified.append(simplified_line)
        return {
            'type': 'MultiLineString',
            'coordinates': simplified
        }
    elif geom['type'] == 'Polygon':
        simplified = []
        for ring in geom['coordinates']:
            simplified_ring = simplify_coordinates(ring, tolerance)
            if len(simplified_ring) > 2:
                simplified.append(simplified_ring)
        return {
            'type': 'Polygon',
            'coordinates': simplified
        }
    elif geom['type'] == 'MultiPolygon':
        simplified = []
        for polygon in geom['coordinates']:
            simplified_polygon = []
            for ring in polygon:
                simplified_ring = simplify_coordinates(ring, tolerance)
                if len(simplified_ring) > 2:
                    simplified_polygon.append(simplified_ring)
            if simplified_polygon:
                simplified.append(simplified_polygon)
        return {
            'type': 'MultiPolygon',
            'coordinates': simplified
        }
    else:
        return geom

def simplify_geojson(input_file, output_file, tolerance=0.0001):
    """Simplifica un archivo GeoJSON"""
    print(f"Leyendo {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        geojson = json.load(f)
    
    print(f"Simplificando con tolerancia {tolerance}...")
    original_size = len(json.dumps(geojson))
    
    if geojson['type'] == 'FeatureCollection':
        simplified_features = []
        for i, feature in enumerate(geojson['features']):
            if i % 100 == 0:
                print(f"  Procesando feature {i}/{len(geojson['features'])}...")
            
            simplified_geom = simplify_geometry(feature['geometry'], tolerance)
            simplified_features.append({
                'type': 'Feature',
                'properties': feature['properties'],
                'geometry': simplified_geom
            })
        
        simplified_geojson = {
            'type': 'FeatureCollection',
            'features': simplified_features
        }
        
        # Mantener CRS si existe
        if 'crs' in geojson:
            simplified_geojson['crs'] = geojson['crs']
    else:
        simplified_geojson = simplify_geometry(geojson, tolerance)
    
    print(f"Guardando en {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(simplified_geojson, f, separators=(',', ':'))
    
    new_size = os.path.getsize(output_file)
    original_size_mb = original_size / (1024 * 1024)
    new_size_mb = new_size / (1024 * 1024)
    reduction = (1 - new_size / original_size) * 100
    
    print(f"\n✓ Simplificación completada!")
    print(f"  Tamaño original: {original_size_mb:.2f} MB")
    print(f"  Tamaño nuevo: {new_size_mb:.2f} MB")
    print(f"  Reducción: {reduction:.1f}%")

if __name__ == '__main__':
    input_file = 'Cartografia/Autonomias.geojson'
    output_file = 'Cartografia/Autonomias_simplified.geojson'
    
    # Tolerancia: 0.0001 grados ≈ 11 metros
    # Aumentar para más simplificación (más pequeño pero menos detalle)
    tolerance = 0.0001
    
    if len(sys.argv) > 1:
        tolerance = float(sys.argv[1])
    
    simplify_geojson(input_file, output_file, tolerance)

