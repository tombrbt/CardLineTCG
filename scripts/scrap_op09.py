import requests
from bs4 import BeautifulSoup
import json
import re

URL = "https://fr.onepiece-cardgame.com/cardlist/?series=622109"
BASE_URL = "https://fr.onepiece-cardgame.com/"

resp = requests.get(URL)
resp.raise_for_status()

soup = BeautifulSoup(resp.text, "html.parser")

cards = {}

for dl in soup.select("dl.modalCol"):
    card_id = dl.get("id")  # ex: OP09-004_p1
    if not card_id or not card_id.startswith("OP09"):
        continue

    base_code = card_id.split("_")[0]

    name = dl.select_one(".cardName").text.strip()

    info = dl.select_one(".infoCol").text.split("|")
    rarity = info[1].strip()
    card_type = info[2].strip()

    def clean_value(selector):
        el = dl.select_one(selector)
        return el.text.strip() if el else None

    cost_or_life = clean_value(".cost")
    power = clean_value(".power")
    counter = clean_value(".counter")
    color = clean_value(".color")
    block = clean_value(".block")
    feature = clean_value(".feature")
    effect = clean_value(".text")

    img = dl.select_one(".frontCol img")
    image_url = None
    if img and img.get("data-src"):
        image_url = BASE_URL + img["data-src"].replace("../", "")

    variant_id = "base"
    if "_" in card_id:
        variant_id = card_id.split("_")[1]

    if base_code not in cards:
        cards[base_code] = {
            "code": base_code,
            "name_fr": name,
            "rarity": rarity,
            "type": card_type,
            "cost_or_life": cost_or_life,
            "power": power,
            "counter": counter,
            "color": color,
            "block": block,
            "feature": feature,
            "effect_fr": effect,
            "variants": []
        }

    cards[base_code]["variants"].append({
        "variant_id": variant_id,
        "image": image_url
    })

with open("results/op09_clean.json", "w", encoding="utf-8") as f:
    json.dump(list(cards.values()), f, ensure_ascii=False, indent=2)

print(f"{len(cards)} cartes OP09 scrapées proprement.")