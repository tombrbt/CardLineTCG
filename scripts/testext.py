import requests
import json
import re

PRODUCTS_URL = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json"

CODE_RE = re.compile(r"\(([^)]+)\)")

def extract_set_code(name: str):
    match = CODE_RE.search(name)
    if not match:
        return None
    inside = match.group(1)          # ex: OP10-095
    prefix = inside.split("-")[0]    # OP10
    return prefix.strip().upper()

print("Téléchargement products...")
response = requests.get(PRODUCTS_URL)
response.raise_for_status()
data = response.json()

# Si wrapper JSON
if isinstance(data, dict):
    for value in data.values():
        if isinstance(value, list):
            products = value
            break
    else:
        raise RuntimeError("Impossible de trouver la liste produits dans le JSON.")
else:
    products = data

print(f"{len(products)} produits chargés")

mapping = {}

for product in products:
    id_exp = product.get("idExpansion")
    name = product.get("name")

    if not id_exp or not name:
        continue

    if id_exp in mapping:
        continue  # on prend le premier trouvé

    code = extract_set_code(name)
    if code:
        mapping[id_exp] = code

# Écriture fichier
with open("expansions_mapping.txt", "w", encoding="utf-8") as f:
    for id_exp in sorted(mapping.keys()):
        f.write(f"idExpansion = {id_exp}\tExtension : {mapping[id_exp]}\n")

print(f"Fichier généré : expansions_mapping.txt ({len(mapping)} lignes)")