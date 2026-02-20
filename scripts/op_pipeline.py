import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://fr.onepiece-cardgame.com"


def ensure_dir(p: str):
    os.makedirs(p, exist_ok=True)


def extract_int(text: str | None):
    if not text:
        return None
    m = re.search(r"\d+", text)
    return int(m.group()) if m else None


def normalize_spaces(s: str | None):
    """
    - garde les espaces entre mots
    - enlève \n \t espaces multiples
    - normalise autour des '/'
    """
    if not s:
        return None
    s = s.replace("\xa0", " ")          # espaces insécables
    s = re.sub(r"\s+", " ", s).strip()  # collapse whitespace
    s = re.sub(r"\s*/\s*", "/", s)      # "A / B" -> "A/B"
    return s


def strip_prefix(text: str | None, prefix: str):
    if not text:
        return None
    t = text
    if t.startswith(prefix):
        t = t[len(prefix):]
    return normalize_spaces(t)


def clean_label_value(raw: str | None, label: str):
    """
    Ex: 'Puissance 5000' ou 'Puissance5000' + 'Puissance' -> 5000 (int)
    Ex: 'Contre -' -> None
    """
    if not raw:
        return None

    s = normalize_spaces(raw) or ""
    s = s.replace(label, "", 1).strip()

    if s in ["-", "—", ""]:
        return None

    n = extract_int(s)
    return n if n is not None else s


def normalize_card_fields(backcol):
    def get_text(sel: str):
        el = backcol.select_one(sel)
        if not el:
            return None
        # IMPORTANT: on garde les espaces entre mots (get_text(" "))
        return normalize_spaces(el.get_text(" ", strip=True))

    cost_or_life_raw = get_text(".cost")      # "Vie 5" ou "Coût 4"
    power_raw = get_text(".power")            # "Puissance 5000"
    counter_raw = get_text(".counter")        # "Contre 1000" ou "Contre -"
    color_raw = get_text(".color")            # "Couleur Rouge"
    block_raw = get_text(".block")            # "Numéro de bloc 3"
    feature_raw = get_text(".feature")        # "Type Quatre Empereurs/Équipage du Roux"

    effect_el = backcol.select_one(".text")   # contient <h3>Effet</h3> + texte
    effect = None
    if effect_el:
        effect = normalize_spaces(effect_el.get_text(" ", strip=True))
        if effect:
            # enlève uniquement le premier "Effet"
            effect = effect.replace("Effet", "", 1).strip()

    # costOrLife : peut être "Vie 5" OU "Coût 4"
    cost_or_life = None
    if cost_or_life_raw:
        if cost_or_life_raw.startswith("Vie"):
            cost_or_life = clean_label_value(cost_or_life_raw, "Vie")
        elif cost_or_life_raw.startswith("Coût"):
            cost_or_life = clean_label_value(cost_or_life_raw, "Coût")
        else:
            cost_or_life = extract_int(cost_or_life_raw)

    power = clean_label_value(power_raw, "Puissance") or 0
    counter = clean_label_value(counter_raw, "Contre")
    color = strip_prefix(color_raw, "Couleur")
    block = clean_label_value(block_raw, "Numéro de bloc")

    feature = None
    if feature_raw:
        feature = strip_prefix(feature_raw, "Type")

    return {
        "costOrLife": cost_or_life,
        "power": power,
        "counter": counter,
        "color": color,
        "block": block,
        "feature": feature,
        "text": effect,
    }


def run(series_id: str, set_code: str, limit: int | None = None):
    url = f"{BASE}/cardlist/?series={series_id}"
    print(f"🔄 Fetch: {url}")

    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    dls = soup.select("dl.modalCol")
    print(f"🧩 DL trouvés: {len(dls)}")

    set_prefix = set_code.replace("-", "")  # OP-09 -> OP09

    grouped: dict[str, list[dict]] = {}
    kept = 0

    for dl in dls:
        html_id = dl.get("id")
        if not html_id:
            continue

        # OP09-001_p1 -> code=OP09-001, variant=p1
        code = html_id.split("_")[0]
        if not code.startswith(set_prefix):
            continue

        variant = "base"
        if "_" in html_id:
            variant = html_id.split("_", 1)[1]

        name_el = dl.select_one(".cardName")
        name = normalize_spaces(name_el.get_text(" ", strip=True) if name_el else None)

        info_spans = dl.select(".infoCol span")
        rarity = normalize_spaces(info_spans[1].get_text(" ", strip=True)) if len(info_spans) > 1 else None
        card_type = normalize_spaces(info_spans[2].get_text(" ", strip=True)) if len(info_spans) > 2 else None

        back = dl.select_one(".backCol")
        if not back:
            continue

        normalized = normalize_card_fields(back)

        # image
        img = dl.select_one(".frontCol img[data-src]")
        image_url = None
        if img and img.get("data-src"):
            # data-src = ../images/cardlist/card/OP09-001.webp?...
            image_url = urljoin(BASE + "/", img["data-src"].replace("..", ""))

        row = {
            "set": set_code,          # OP-09
            "code": code,             # OP09-001
            "variant": variant,       # base / p1 / p2 / p3
            "name": name,
            "rarity": rarity,
            "type": card_type,
            "color": normalized["color"],
            "costOrLife": normalized["costOrLife"] if normalized["costOrLife"] is not None else 0,
            "power": normalized["power"] if normalized["power"] is not None else 0,
            "counter": normalized["counter"],
            "block": normalized["block"],
            "feature": normalized["feature"],
            "text": normalized["text"],
            "illustrationUrl": image_url,
            "status": "legal",
        }

        grouped.setdefault(code, []).append(row)
        kept += 1

        if limit and kept >= limit:
            break

    # Aplatissement + ordre stable (base puis p1,p2,...)
    flat: list[dict] = []
    for code, rows in grouped.items():
        rows.sort(key=lambda r: (0 if r["variant"] == "base" else 1, r["variant"]))
        flat.extend(rows)

    ensure_dir("scripts/results")
    out_path = f"scripts/results/{set_code}prb01.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(flat, f, ensure_ascii=False, indent=2)

    print(f"✅ {len(flat)} variantes écrites → {out_path}")


if __name__ == "__main__":
    # OP-09 (LES NOUVEAUX EMPEREURS)
    run(series_id="622301", set_code="", limit=None)