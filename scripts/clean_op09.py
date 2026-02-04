import json
import re

INPUT = "results/op09_clean.json"
OUTPUT = "results/op09_final.json"

def extract_int(text):
    if not text:
        return None
    m = re.search(r"\d+", text)
    return int(m.group()) if m else None

def extract_text_after_label(text):
    if not text:
        return None
    return re.sub(r"^[^\dA-Za-zÀ-ÿ]+", "", text).strip()

with open(INPUT, "r", encoding="utf-8") as f:
    cards = json.load(f)

cleaned = []

for card in cards:
    cleaned.append({
        "code": card["code"],
        "name_fr": card["name_fr"],
        "rarity": card["rarity"],
        "type": card["type"],

        "cost": extract_int(card.get("cost_or_life")),
        "life": extract_int(card.get("cost_or_life")) if card["type"] == "LEADER" else None,

        "power": extract_int(card.get("power")),
        "counter": extract_int(card.get("counter")),

        "color": card.get("color", "").replace("Couleur", "").strip(),
        "block": extract_int(card.get("block")),

        "feature": card.get("feature", "").replace("Type", "").strip(),

        "effect_fr": card.get("effect_fr", "").replace("Effet", "").strip(),

        "variants": card.get("variants", [])
    })

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(cleaned, f, ensure_ascii=False, indent=2)

print(f"✅ {len(cleaned)} cartes nettoyées → {OUTPUT}")