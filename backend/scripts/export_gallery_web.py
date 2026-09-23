"""Export public gallery metadata for the static frontend."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "backend" / "data" / "gallery_v2" / "index.json"
NONHUMAN = ROOT / "backend" / "data" / "gallery_v2" / "nonhuman.json"
OUTPUT = ROOT / "frontend" / "dist" / "dataset-v2.json"


def resized_image(person: dict, width: int = 480) -> str:
    url = person.get("preview_url") or person.get("source_url") or person.get("image_url", "")
    if "/thumb/" in url:
        clean = url.split("?", 1)[0]
        if re.search(r"/\d+px-[^/]+$", clean):
            return re.sub(r"/\d+px-([^/]+)$", rf"/{width}px-\1", clean)
    if "commons.wikimedia.org/wiki/Special:FilePath/" in url:
        target = url.replace("http://", "https://").replace("/Special:FilePath/", "/Special:Redirect/file/")
        return target + ("&" if "?" in target else "?") + f"width={width}"
    return url.replace("http://", "https://")


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    people = [{
        "id": person["id"],
        "type": "human",
        "name": person["name"],
        "image": f"/people/{person['id']}.jpg" if (ROOT / "frontend" / "dist" / "people" / f"{person['id']}.jpg").exists() else resized_image(person),
        "source": (person.get("source_url") or "").replace("http://", "https://"),
        "gender": person.get("gender", ""),
        "birth": person.get("birth", ""),
        "group": (person.get("occupations") or ["인물"])[0],
        "description": f"{person['name']}의 {'·'.join((person.get('occupations') or ['인물'])[:3])} 공개 얼굴 기준 · 등록 사진 {max(1, int(person.get('sample_count', 1)))}장",
        "labels": person.get("occupations", []),
    } for person in source["people"]]
    nonhuman = []
    for source_item in json.loads(NONHUMAN.read_text(encoding="utf-8"))["items"]:
        item = dict(source_item)
        local_image = ROOT / "frontend" / "dist" / "nonhuman" / f"{item['id']}.jpg"
        if local_image.exists():
            item["image"] = f"/nonhuman/{item['id']}.jpg"
        if item.get("type") == "character":
            item["description"] = f"{item['name']}의 얼굴 윤곽·눈매·표정선을 비교하는 {item.get('group', '애니메이션')} 기준"
        else:
            item["description"] = f"{item['name']}의 머리 윤곽·눈 위치·주둥이 비율을 비교하는 실사 기준"
        nonhuman.append(item)
    items = [*nonhuman, *people]
    descriptions = [item["description"] for item in items]
    if len(descriptions) != len(set(descriptions)):
        raise RuntimeError("dataset descriptions must be unique")
    counts = {kind: sum(item["type"] == kind for item in items) for kind in ("human", "character", "animal")}
    OUTPUT.write_text(
        json.dumps({"count": len(items), "counts": counts, "items": items}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"exported {len(items)} dataset items to {OUTPUT}")


if __name__ == "__main__":
    main()
