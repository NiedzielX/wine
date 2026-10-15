"""
Regenerates the import test fixtures with real tools (openpyxl, reportlab, PIL), so the parsers are
tested on files made by other software, not on files shaped by our own assumptions.
    python3 generate.py
"""
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw

# ---------- menu.xlsx: English headers, numbers and text prices, a missing price, a duplicate, two sheets
wb = Workbook()
ws = wb.active
ws.title = 'Autumn menu'
ws.append(['Category', 'Name', 'Description', 'Price'])
ws.append(['Starters', 'Smoked trout rillettes', 'Smoked trout, horseradish cream, pickled cucumber', 46])
ws.append(['Starters', 'Beetroot carpaccio', 'Goat cheese, walnuts, & "aged" balsamic', '38,50 zł'])
ws.append(['Mains', 'Roast chicken for two', 'Free-range chicken, chanterelles, roasted garlic jus', 158])
ws.append(['Mains', 'Grilled cauliflower steak', 'Charred cauliflower, tahini, chili, pomegranate', 62])
ws.append(['Mains', 'Veal schnitzel', 'Breaded veal, potato salad, lemon', None])
ws.append(['Desserts', 'Plum tart', 'Baked plum tart, vanilla ice cream', 36])
ws.append(['Mains', 'Duck breast', 'Roasted duck breast, sour cherry jus', 118])
wb.create_sheet('Notes').append(['this sheet must be ignored'])
wb.save('menu.xlsx')

# ---------- menu-pl.xlsx: Polish headers, inline-style content, an empty first column of blank rows
wb = Workbook(); ws = wb.active
ws.append([])
ws.append(['Kategoria', 'Danie', 'Opis', 'Cena'])
ws.append(['Przystawki', 'Tatar z jelenia', 'Jałowiec, żółtko, piklowane grzyby', 74])
ws.append(['Dania główne', 'Sandacz', 'Masło, por, kawior', 98.5])
ws.append(['Desery', 'Sernik wiedeński', 'Rokitnik, kruszonka', 38])
wb.save('menu-pl.xlsx')

# ---------- wines.xlsx
wb = Workbook(); ws = wb.active
ws.append(['Producer', 'Wine', 'Vintage', 'Region', 'Grape', 'Style', 'Glass price', 'Bottle price'])
ws.append(['Weingut Keller', 'Riesling trocken', 2022, 'Rheinhessen', 'Riesling', 'White', 52, 240])
ws.append(['Domaine Huet', 'Le Haut-Lieu Sec', 2021, 'Vouvray', 'Chenin Blanc', 'White', None, 310])
ws.append(['Isole e Olena', 'Chianti Classico', 2020, 'Tuscany', 'Sangiovese', 'Red', 46, 220])
ws.append(['Winnica Srebrna Góra', 'Pinot Noir', 2022, 'Małopolska', None, 'Red', 44, None])
ws.append(['Bérêche & Fils', 'Brut Réserve', 'NV', 'Champagne', 'Chardonnay', 'Sparkling', 68, 360])
ws.append(['Pierre Gimonnet & Fils', 'Cuis 1er Cru Blanc de Blancs Brut', 'NV', 'Champagne', 'Chardonnay', 'Sparkling', 72, 390])
wb.save('wines.xlsx')

# ---------- menu.pdf (text PDF with sections, dishes, wrapped descriptions)
c = canvas.Canvas('menu.pdf', pagesize=A4)
y = 800
def line(text, size=11, bold=False):
    global y
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size); c.drawString(60, y, text); y -= 18
line('Halka - Autumn menu', 16, True); y -= 8
line('Starters', 13, True)
line('Smoked trout rillettes ........................ 46')
line('Horseradish cream, pickled cucumber', 9)
line('Beetroot carpaccio                                  38,50 zl')
line('Mains', 13, True)
line('Roast chicken for two ........................ 158')
line('Free-range chicken, chanterelles', 9)
line('Veal schnitzel')
line('Desserts', 13, True)
line('Plum tart ........................ 36')
c.showPage()
y = 800
line('Page two', 9)
line('Mains', 13, True)
line('Grilled cauliflower steak ........................ 62')
c.save()

# ---------- wines.pdf
c = canvas.Canvas('wines.pdf', pagesize=A4); y = 800
line('Wine list', 16, True); y -= 8
line('White', 13, True)
line('Weingut Keller - Riesling trocken 2022 Rheinhessen 52 / 240')
line('Domaine Huet - Le Haut-Lieu Sec 2021 Vouvray 310')
line('Sparkling', 13, True)
line('Berece & Fils - Brut Reserve NV Champagne 68 / 360')
line('Red', 13, True)
line('Isole e Olena - Chianti Classico 2020 Tuscany 46 / 220')
c.save()

# ---------- scan.pdf: an image only, no text layer
img = Image.new('RGB', (600, 800), 'white'); d = ImageDraw.Draw(img); d.text((60, 60), 'Scanned menu: Duck breast 118', fill='black')
img.save('scan.pdf', 'PDF', resolution=100)

# ---------- CSV: UTF-8 with BOM and Windows-1250 with ';' and decimal commas (Polish Excel)
rows = ['Kategoria;Danie;Opis;Cena', 'Przystawki;Tatar z jelenia;Jałowiec, żółtko;74,00', 'Dania główne;Sandacz;Masło, por;98,50', 'Desery;Sernik;Rokitnik;38']
open('menu-1250.csv', 'wb').write(('\n'.join(rows) + '\n').encode('cp1250'))
open('menu-bom.csv', 'wb').write(b'\xef\xbb\xbf' + 'category,name,description,price\nStarters,"Tartare, hand-cut",Beef & egg,68\nMains,Duck breast,"Cherry jus, beet",112\n'.encode('utf-8'))
open('menu.tsv', 'w').write('name\tprice\nPlum tart\t36\nCrème brûlée\t32,50\n')

# ---------- files that must be refused
open('fake.xlsx', 'w').write('this is plain text pretending to be a spreadsheet')
open('legacy.xls', 'wb').write(bytes.fromhex('D0CF11E0A1B11AE1') + b'\x00' * 512)
open('empty.csv', 'w').write('')
open('header-only.csv', 'w').write('name,price\n')
open('binary.csv', 'wb').write(bytes(range(256)) * 4)
print('fixtures written')

# ---------- translation columns (spec 2026-10-15-bilingual-content, R5): written by Python's csv module, UTF-8
import csv
with open('menu-translations.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['Category', 'Name', 'Description', 'Price', 'name_pl', 'Opis (PL)', 'Nazwa EN', 'description_en'])
    w.writerow(['Desserts', 'Plum tart', 'Baked plum tart, vanilla ice cream', '36', 'Tarta śliwkowa', 'Pieczona tarta ze śliwkami, lody waniliowe', '', ''])
    w.writerow(['Mains', 'Duck breast', 'Roasted duck breast, sour cherry jus, beetroot, toasted buckwheat', '112', 'Pierś z kaczki', '', 'Duck breast', 'Roasted duck, sour cherry jus'])
with open('wines-translations.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['Producent', 'Wino', 'Rocznik', 'Region', 'Kraj', 'Szczep', 'Kolor', 'Butelka', 'tasting_note_pl', 'Tasting note (EN)', 'Region PL', 'kraj_pl'])
    w.writerow(['Weingut Keller', 'Riesling trocken', '2022', 'Rheinhessen', 'Germany', 'Riesling', 'Białe', '240', 'Brzoskwinia, łupek, rześka kwasowość.', 'Peach, slate, crisp acidity.', 'Hesja Reńska', 'Niemcy'])
