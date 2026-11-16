"""Genera datos/Mi_Centro_De_Mando.xlsx con las pestañas Compras y Tareas.

La fila 1 de cada pestaña lleva exactamente los encabezados que espera AppSheet,
y debajo hay filas de ejemplo para que AppSheet deduzca el tipo de cada columna.
Uso: python tools/generar_hoja.py
"""
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

SALIDA = Path(__file__).resolve().parent.parent / "datos" / "Mi_Centro_De_Mando.xlsx"

COMPRAS = (
    ["ID", "Producto", "Categoria", "Tienda", "Direccion", "Stock"],
    [
        ["a1b2c3d4", "Leche", "Supermercado", "Lidl", "Lidl, Ceuta", "Falta"],
        ["b2c3d4e5", "Bombillas LED", "Ferretería", "Leroy Merlin", "Leroy Merlin, Ceuta", "Falta"],
        ["c3d4e5f6", "Lejía", "Limpieza", "Mercadona", "Mercadona, Ceuta", "En casa"],
        ["d4e5f6a7", "Estantería", "IKEA", "IKEA", "IKEA, Málaga", "Falta"],
    ],
)

TAREAS = (
    ["ID", "Titulo", "Prioridad", "Fecha_Limite", "Ubicacion", "Completada", "Sync_Tasks"],
    [
        ["e5f6a7b8", "Empadronarme en el nuevo domicilio", "Alta",
         datetime(2026, 11, 10, 10, 0), "Ayuntamiento de Ceuta, Plaza de África, Ceuta", False, ""],
        ["f6a7b8c9", "Cambiar dirección en el banco", "Media",
         datetime(2026, 11, 12, 18, 0), "", False, ""],
    ],
)


def hoja(ws, titulo, encabezados, filas, anchos):
    ws.title = titulo
    ws.append(encabezados)
    for f in filas:
        ws.append(f)
    for c in ws[1]:
        c.font = Font(bold=True)
    ws.freeze_panes = "A2"
    for letra, ancho in anchos.items():
        ws.column_dimensions[letra].width = ancho


def main():
    wb = Workbook()
    hoja(wb.active, "Compras", *COMPRAS,
         {"A": 11, "B": 18, "C": 14, "D": 14, "E": 26, "F": 10})
    ws = wb.create_sheet()
    hoja(ws, "Tareas", *TAREAS,
         {"A": 11, "B": 36, "C": 10, "D": 18, "E": 44, "F": 12, "G": 30})
    for celda in ws["D"][1:]:
        celda.number_format = "dd/mm/yyyy hh:mm"
    SALIDA.parent.mkdir(exist_ok=True)
    wb.save(SALIDA)
    print(SALIDA)


if __name__ == "__main__":
    main()
