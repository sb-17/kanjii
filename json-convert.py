import json

with open("joujou.json", "r", encoding="utf-8") as f:
    kanji_data = json.load(f)

simplified_kanji = []

for char, info in kanji_data.items():
    simplified_kanji.append({
        "character": char,
        "meanings": info.get("meanings", []),
        "on": info.get("readings_on", []),
        "kun": info.get("readings_kun", []),
        "strokes": info.get("strokes", None),
        "frequency": info.get("freq", None),
    })

with open("kanji.json", "w", encoding="utf-8") as f:
    json.dump(simplified_kanji, f, ensure_ascii=False, indent=2)

print("Conversion complete! Saved as kanji.json")