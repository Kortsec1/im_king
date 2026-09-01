"""Build a diverse Wikimedia face gallery with flip-test embeddings."""
from __future__ import annotations

import json
import time
from pathlib import Path
from urllib.parse import quote, unquote, urlencode
from urllib.request import Request, urlopen

import cv2
import numpy as np
from insightface.app import FaceAnalysis

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "gallery_v2"
PUBLIC = ROOT / "data" / "public" / "people"
TARGET = 180
USER_AGENT = "PcuFestivalLookalike/0.2 (educational event)"

OCCUPATIONS = {
    "Q177220": "가수", "Q33999": "배우", "Q10800557": "영화배우",
    "Q4610556": "모델", "Q2066131": "운동선수", "Q245068": "코미디언",
    "Q49757": "시인", "Q1930187": "저널리스트", "Q82955": "정치인",
}

def request_json(url: str, timeout: int = 30):
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=timeout) as response:
        return json.load(response)

def query_candidates() -> list[dict]:
    values = " ".join(f"wd:{qid}" for qid in OCCUPATIONS)
    query = f'''SELECT DISTINCT ?person ?personLabel ?image ?gender ?birth ?occupation WHERE {{
      ?person wdt:P31 wd:Q5; wdt:P27 wd:Q884; wdt:P18 ?image; wdt:P106 ?occupation.
      VALUES ?occupation {{ {values} }} OPTIONAL {{ ?person wdt:P21 ?gender. }}
      OPTIONAL {{ ?person wdt:P569 ?birth. }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ko,en". }}
    }} LIMIT 1000'''
    url = "https://query.wikidata.org/sparql?format=json&query=" + quote(query)
    rows = request_json(url, 60)["results"]["bindings"]
    by_id: dict[str, dict] = {}
    for row in rows:
        qid = row["person"]["value"].rsplit("/", 1)[-1]
        item = by_id.setdefault(qid, {
            "id": f"wikidata-{qid}", "qid": qid,
            "name": row["personLabel"]["value"], "image": row["image"]["value"],
            "gender": row.get("gender", {}).get("value", "").rsplit("/", 1)[-1],
            "birth": row.get("birth", {}).get("value", ""), "occupations": [],
        })
        occ = row["occupation"]["value"].rsplit("/", 1)[-1]
        if OCCUPATIONS.get(occ) not in item["occupations"]:
            item["occupations"].append(OCCUPATIONS.get(occ, occ))
    # Round-robin buckets prevent the first SPARQL rows dominating the gallery.
    buckets: dict[str, list[dict]] = {}
    for item in by_id.values():
        key = f"{item['gender']}:{item['occupations'][0] if item['occupations'] else '기타'}"
        buckets.setdefault(key, []).append(item)
    ordered: list[dict] = []
    while buckets and len(ordered) < TARGET * 2:
        for key in list(buckets):
            if buckets[key]: ordered.append(buckets[key].pop(0))
            if not buckets[key]: del buckets[key]
    return ordered

def query_category_candidates() -> list[dict]:
    categories = [
        ("South Korean male television actors", "배우"),
        ("South Korean female television actors", "배우"),
        ("South Korean male singers", "가수"),
        ("South Korean female singers", "가수"),
        ("South Korean male idols", "아이돌"),
        ("South Korean female idols", "아이돌"),
        ("South Korean sportspeople", "운동선수"),
        ("South Korean comedians", "코미디언"),
        ("South Korean models", "모델"),
    ]
    buckets: list[list[dict]] = []
    for category, occupation in categories:
        params = {
            "action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{category}",
            "gcmtype": "page", "gcmlimit": "500", "prop": "pageprops|pageimages",
            "ppprop": "wikibase_item", "piprop": "thumbnail|original", "pithumbsize": "500", "format": "json",
        }
        url = "https://en.wikipedia.org/w/api.php?" + urlencode(params)
        pages = request_json(url, 40).get("query", {}).get("pages", {}).values()
        bucket = []
        for page in pages:
            qid = page.get("pageprops", {}).get("wikibase_item")
            image = page.get("thumbnail", {}).get("source")
            if not qid or not image or "/commons/" not in image: continue
            bucket.append({
                "id": f"wikidata-{qid}", "qid": qid, "name": page["title"], "image": image,
                "gender": "", "birth": "", "occupations": [occupation],
            })
        buckets.append(bucket)
        time.sleep(.35)
    ordered = []
    while any(buckets):
        for bucket in buckets:
            if bucket: ordered.append(bucket.pop(0))
    return ordered

def download(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urlopen(req, timeout=30) as response:
                return response.read()
        except Exception as exc:
            if "429" not in str(exc) or attempt == 3:
                raise
            time.sleep(2.5 * (attempt + 1))
    raise RuntimeError("image download failed")

def normalized(vector: np.ndarray) -> np.ndarray:
    return (vector / max(float(np.linalg.norm(vector)), 1e-12)).astype(np.float32)

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True); PUBLIC.mkdir(parents=True, exist_ok=True)
    analyzer = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition"], providers=["CPUExecutionProvider"])
    analyzer.prepare(ctx_id=-1, det_size=(512, 512))
    if (OUT / "index.json").exists() and (OUT / "embeddings.npy").exists():
        previous = json.loads((OUT / "index.json").read_text())
        people = previous["people"]; samples = previous["samples"]
        embeddings = [row for row in np.load(OUT / "embeddings.npy").astype(np.float32)]
        print(f"resume: {len(people)} people / {len(embeddings)} embeddings", flush=True)
    else:
        embeddings = []; samples = []; people = []
    existing_ids = {person["id"] for person in people}
    for candidate in query_category_candidates():
        if len(people) >= TARGET: break
        if candidate["id"] in existing_ids: continue
        try:
            raw = download(candidate["image"])
            image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if image is None: continue
            faces = analyzer.get(image)
            if len(faces) != 1: continue
            face = faces[0]
            if (face.bbox[2]-face.bbox[0]) * (face.bbox[3]-face.bbox[1]) < 12_000: continue
            refs = [normalized(face.embedding)]
            person_index = len(people)
            filename = f"{candidate['id']}.jpg"
            (PUBLIC / filename).write_bytes(raw)
            people.append({
                "id": candidate["id"], "name": candidate["name"],
                "image_url": f"/people/{filename}", "source_url": candidate["image"],
                "gender": candidate["gender"], "birth": candidate["birth"],
                "occupations": candidate["occupations"], "sample_count": len(refs),
            })
            existing_ids.add(candidate["id"])
            for ref in refs:
                embeddings.append(ref); samples.append({"person_index": person_index})
            np.save(OUT / "embeddings.npy", np.stack(embeddings))
            (OUT / "index.json").write_text(json.dumps({"people": people, "samples": samples}, ensure_ascii=False, indent=2))
            print(f"[{len(people):03}/{TARGET}] {candidate['name']} ({len(refs)} samples)", flush=True)
        except Exception as exc:
            print(f"skip {candidate['name']}: {exc}", flush=True)
        time.sleep(0.04)
    np.save(OUT / "embeddings.npy", np.stack(embeddings))
    (OUT / "index.json").write_text(json.dumps({"people": people, "samples": samples}, ensure_ascii=False, indent=2))
    print(f"gallery ready: {len(people)} people / {len(embeddings)} embeddings", flush=True)

if __name__ == "__main__": main()
