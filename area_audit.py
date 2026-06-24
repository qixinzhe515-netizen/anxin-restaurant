#!/usr/bin/env python3
import re
from pathlib import Path


APP = Path(__file__).with_name("app.js")


AREAS = {
    "Tea Gardens": ("const teaGardensRestaurants = [", "const stIvesRestaurants = ["),
    "St Ives": ("const stIvesRestaurants = [", "const chatswoodRestaurants = ["),
    "Chatswood": ("const chatswoodRestaurants = [", "const sydneyCbdRestaurants"),
    "Sydney CBD": ("const sydneyCbdRestaurants = [", "const chatswoodStaticMenuExtensions"),
}


def slice_between(text, start_marker, end_marker):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end]


def restaurant_blocks(area_text):
    starts = [match.start() for match in re.finditer(r'\n  \{\n    id: "', area_text)]
    blocks = []
    for index, start in enumerate(starts):
      end = starts[index + 1] if index + 1 < len(starts) else len(area_text)
      blocks.append(area_text[start:end])
    return blocks


def first_string(block, key):
    match = re.search(rf'{key}:\s*"([^"]*)"', block)
    return match.group(1) if match else ""


def main():
    text = APP.read_text(encoding="utf-8")
    total_errors = 0
    for area, markers in AREAS.items():
        area_text = slice_between(text, *markers)
        blocks = restaurant_blocks(area_text)
        print(f"{area}: {len(blocks)} restaurants")
        if len(blocks) < 10:
            print(f"  ERROR: fewer than 10 restaurants")
            total_errors += 1
        for block in blocks:
            restaurant_id = first_string(block, "id") or "unknown"
            name = first_string(block, "name") or restaurant_id
            missing = [
                key for key in ("nameNote", "address", "websiteUri")
                if not first_string(block, key)
            ]
            if "menuDishes:" not in block:
                missing.append("menuDishes")
            if missing:
                print(f"  TODO: {name} needs {', '.join(missing)}")

        if area == "St Ives":
            sushiru = next((block for block in blocks if 'id: "stives-sushiru"' in block), "")
            chargrill = next((block for block in blocks if 'id: "stives-chargrill-charlies"' in block), "")
            if re.search(r"chargrill|schnitzel|chicken roll", sushiru, re.I):
                print("  ERROR: Sushiru still contains Chargrill-style dishes")
                total_errors += 1
            if re.search(r"sushi|sashimi|nigiri|maki", chargrill, re.I):
                print("  ERROR: Chargrill Charlie's still contains sushi-style dishes")
                total_errors += 1

    if total_errors:
        raise SystemExit(total_errors)
    print("Area audit passed")


if __name__ == "__main__":
    main()
