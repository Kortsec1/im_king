"""Build a diverse Wikimedia face gallery with flip-test embeddings."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
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
DEFAULT_TARGET = 1000
DEFAULT_CATEGORY_PAGES = 5
USER_AGENT = "PcuFestivalLookalike/0.2 (educational event)"

OCCUPATIONS = {
    "Q177220": "가수", "Q33999": "배우", "Q10800557": "영화배우",
    "Q4610556": "모델", "Q2066131": "운동선수", "Q245068": "코미디언",
    "Q49757": "시인", "Q1930187": "저널리스트", "Q82955": "정치인",
}

def request_json(url: str, timeout: int = 30):
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(6):
        try:
            with urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except Exception as exc:
            if "429" not in str(exc) or attempt == 5:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("API request failed")

def query_candidates(target: int) -> list[dict]:
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
    while buckets and len(ordered) < target * 2:
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
        ("South Korean politicians", "정치인"),
        ("Members of the National Assembly (South Korea)", "국회의원"),
        ("South Korean journalists", "언론인"),
        ("South Korean academics", "학계"),
        ("South Korean businesspeople", "기업인"),
        ("South Korean television presenters", "방송인"),
        ("South Korean association football players", "축구선수"),
        ("South Korean baseball players", "야구선수"),
        ("South Korean Olympic competitors", "올림픽 선수"),
    ]
    buckets: list[list[dict]] = []
    for category, occupation in categories:
        params = {
            "action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{category}",
            "gcmtype": "page", "gcmlimit": "500", "prop": "pageprops|pageimages",
            "ppprop": "wikibase_item", "piprop": "thumbnail|original", "pithumbsize": "640", "format": "json",
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
        time.sleep(1.0)
    ordered = []
    while any(buckets):
        for bucket in buckets:
            if bucket: ordered.append(bucket.pop(0))
    return ordered

EXPANDED_CATEGORIES = [
    ("South Korean male television actors", "배우"),
    ("South Korean television actresses", "배우"),
    ("South Korean male film actors", "배우"),
    ("South Korean film actresses", "배우"),
    ("South Korean male stage actors", "배우"),
    ("South Korean stage actresses", "배우"),
    ("South Korean male singers", "가수"),
    ("South Korean women singers", "가수"),
    ("South Korean male idols", "아이돌"),
    ("South Korean female idols", "아이돌"),
    ("South Korean pop singers", "가수"),
    ("South Korean rock singers", "가수"),
    ("South Korean rappers", "래퍼"),
    ("South Korean singer-songwriters", "싱어송라이터"),
    ("South Korean musicians", "음악인"),
    ("South Korean pianists", "피아니스트"),
    ("South Korean violinists", "바이올리니스트"),
    ("South Korean dancers", "무용가"),
    ("South Korean comedians", "코미디언"),
    ("South Korean television presenters", "방송인"),
    ("South Korean female models", "모델"),
    ("South Korean beauty pageant winners", "모델"),
    ("South Korean film directors", "영화감독"),
    ("South Korean screenwriters", "작가"),
    ("South Korean writers", "작가"),
    ("South Korean artists", "예술가"),
    ("South Korean sportspeople", "운동선수"),
    ("South Korean association football players", "축구선수"),
    ("South Korean baseball players", "야구선수"),
    ("South Korean basketball players", "농구선수"),
    ("South Korean volleyball players", "배구선수"),
    ("South Korean golfers", "골프선수"),
    ("South Korean badminton players", "배드민턴선수"),
    ("South Korean table tennis players", "탁구선수"),
    ("South Korean speed skaters", "빙상선수"),
    ("South Korean figure skaters", "피겨선수"),
    ("South Korean martial artists", "무술인"),
    ("South Korean esports players", "e스포츠선수"),
    ("South Korean Olympic competitors", "올림픽선수"),
    ("South Korean politicians", "정치인"),
    ("Members of the National Assembly (South Korea)", "국회의원"),
    ("South Korean journalists", "언론인"),
    ("South Korean academics", "학계"),
    ("South Korean scientists", "과학자"),
    ("South Korean businesspeople", "기업인"),
    ("South Korean chefs", "요리사"),
    ("American male film actors", "배우"),
    ("American film actresses", "배우"),
    ("American male singers", "가수"),
    ("American women singers", "가수"),
    ("British male film actors", "배우"),
    ("British film actresses", "배우"),
    ("Japanese male film actors", "배우"),
    ("Japanese film actresses", "배우"),
    ("Japanese male singers", "가수"),
    ("Japanese female singers", "가수"),
    ("Chinese male film actors", "배우"),
    ("Chinese film actresses", "배우"),
    ("Indian male film actors", "배우"),
    ("Indian film actresses", "배우"),
    ("French male film actors", "배우"),
    ("French film actresses", "배우"),
    ("Brazilian male actors", "배우"),
    ("Brazilian actresses", "배우"),
    ("Nigerian male actors", "배우"),
    ("Nigerian actresses", "배우"),
    ("Thai male actors", "배우"),
    ("Thai actresses", "배우"),
]

def query_expanded_category_candidates(max_pages: int) -> list[dict]:
    buckets: list[list[dict]] = []
    for category, occupation in EXPANDED_CATEGORIES:
        bucket = []
        continuation: dict[str, str] = {}
        for _ in range(max_pages):
            params = {
                "action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{category}",
                "gcmtype": "page", "gcmlimit": "500", "prop": "pageprops|pageimages",
                "ppprop": "wikibase_item", "piprop": "thumbnail|original", "pithumbsize": "640",
                "format": "json", **continuation,
            }
            try:
                data = request_json("https://en.wikipedia.org/w/api.php?" + urlencode(params), 40)
            except Exception as exc:
                print(f"category unavailable: {category}: {exc}", flush=True)
                break
            for page in data.get("query", {}).get("pages", {}).values():
                if page.get("title", "").startswith(("List of ", "Category:")):
                    continue
                qid = page.get("pageprops", {}).get("wikibase_item")
                image = page.get("thumbnail", {}).get("source")
                if not qid or not image or "/commons/" not in image:
                    continue
                bucket.append({
                    "id": f"wikidata-{qid}", "qid": qid, "name": page["title"], "image": image,
                    "gender": "Q6581072" if any(word in category.lower() for word in ("female", "women", "actress")) else ("Q6581097" if " male " in f" {category.lower()} " else ""),
                    "birth": "", "occupations": [occupation],
                })
            continuation = data.get("continue", {})
            if not continuation:
                break
            time.sleep(0.25)
        print(f"category: {category} ({len(bucket)} candidates)", flush=True)
        buckets.append(bucket)
        time.sleep(0.35)
    ordered = []
    while any(buckets):
        for bucket in buckets:
            if bucket:
                ordered.append(bucket.pop(0))
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
            # Use a public image-resize cache only as a one-time rebuild fallback.
            # The source is already-public Wikimedia media; user uploads never pass here.
            proxy = "https://images.weserv.nl/?url=" + quote(url, safe="") + "&w=960"
            req = Request(proxy, headers={"User-Agent": USER_AGENT})
            print("Wikimedia rate limit; using thumbnail cache", flush=True)
    raise RuntimeError("image download failed")

def normalized(vector: np.ndarray) -> np.ndarray:
    return (vector / max(float(np.linalg.norm(vector)), 1e-12)).astype(np.float32)

def preview_url(url: str, width: int = 960) -> str:
    """Use Wikimedia's resized CDN asset instead of downloading multi-megabyte originals."""
    if "/thumb/" in url:
        clean = url.split("?", 1)[0]
        if re.search(r"/\d+px-[^/]+$", clean):
            return re.sub(r"/\d+px-([^/]+)$", rf"/{width}px-\1", clean)
        filename = clean.rsplit("/", 1)[-1]
        return clean + f"/{width}px-{filename}"
    if "commons.wikimedia.org/wiki/Special:FilePath/" in url:
        filename = unquote(url.split("/Special:FilePath/", 1)[1].split("?", 1)[0]).replace(" ", "_")
        digest = hashlib.md5(filename.encode("utf-8")).hexdigest()
        encoded = quote(filename, safe="()_,-.'")
        thumb_name = f"{width}px-{encoded}" + (".png" if filename.lower().endswith(".svg") else "")
        return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{digest[0]}/{digest[:2]}/{encoded}/{thumb_name}"
    if "/commons/" not in url:
        return url
    filename = url.split("?", 1)[0].rsplit("/", 1)[-1]
    return url.replace("/commons/", "/commons/thumb/", 1) + f"/{width}px-{filename}"

def candidate_from_person(person: dict) -> dict:
    return {
        "id": person["id"], "qid": person["id"].removeprefix("wikidata-"),
        "name": person["name"],
        # Older indexes may store the original Special:FilePath URL in preview_url.
        # Normalize it again so rebuilds fetch a small CDN thumbnail, not a multi-MB original.
        "image": preview_url(person.get("preview_url") or person.get("source_url", person["image_url"])),
        "gender": person.get("gender", ""), "birth": person.get("birth", ""),
        "occupations": person.get("occupations", []),
    }

def unique_candidates(*groups: list[dict]) -> list[dict]:
    result = []
    seen = set()
    for group in groups:
        for candidate in group:
            if candidate["id"] in seen:
                continue
            seen.add(candidate["id"])
            result.append(candidate)
    return result

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=int, default=DEFAULT_TARGET)
    parser.add_argument("--category-pages", type=int, default=DEFAULT_CATEGORY_PAGES)
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--saved-only", action="store_true", help="rebuild only people already in index.json")
    parser.add_argument("--women-first", action="store_true", help="prioritize female candidates before the remaining pool")
    args = parser.parse_args()
    if args.target < 1 or args.category_pages < 1 or args.delay < 0:
        parser.error("target/category-pages must be positive and delay must be non-negative")
    return args

def main() -> None:
    args = parse_args()
    OUT.mkdir(parents=True, exist_ok=True); PUBLIC.mkdir(parents=True, exist_ok=True)
    analyzer = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition"], providers=["CPUExecutionProvider"])
    analyzer.prepare(ctx_id=-1, det_size=(512, 512))
    index_path = OUT / "index.json"
    seed_path = OUT / "rebuild_seed.json"
    if not (OUT / "embeddings.npy").exists() and index_path.exists() and not seed_path.exists():
        seed_path.write_text(index_path.read_text(encoding="utf-8"), encoding="utf-8")
    source_index = seed_path if seed_path.exists() else index_path
    saved_people = json.loads(source_index.read_text(encoding="utf-8"))["people"] if source_index.exists() else []
    if index_path.exists() and (OUT / "embeddings.npy").exists():
        previous = json.loads(index_path.read_text(encoding="utf-8"))
        people = previous["people"]; samples = previous["samples"]
        embeddings = [row for row in np.load(OUT / "embeddings.npy").astype(np.float32)]
        print(f"resume: {len(people)} people / {len(embeddings)} embeddings", flush=True)
    else:
        embeddings = []; samples = []; people = []
    existing_ids = {person["id"] for person in people}
    for person in people:
        person["preview_url"] = preview_url(person.get("source_url", person["image_url"]))
    category_candidates = [] if args.saved_only else query_expanded_category_candidates(args.category_pages)
    try:
        wikidata_candidates = [] if args.saved_only else query_candidates(args.target)
    except Exception as exc:
        print(f"Wikidata SPARQL fallback unavailable: {exc}", flush=True)
        wikidata_candidates = []
    candidates = unique_candidates(
        [candidate_from_person(person) for person in saved_people],
        category_candidates,
        wikidata_candidates,
    )
    if args.women_first:
        saved_ids = {person["id"] for person in saved_people}
        candidates.sort(key=lambda item: (item["id"] not in saved_ids, item.get("gender") != "Q6581072"))
    print(f"candidate pool: {len(candidates)} unique people", flush=True)
    for candidate in candidates:
        if len(people) >= args.target: break
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
                "preview_url": preview_url(candidate["image"]),
                "gender": candidate["gender"], "birth": candidate["birth"],
                "occupations": candidate["occupations"], "sample_count": len(refs),
            })
            existing_ids.add(candidate["id"])
            for ref in refs:
                embeddings.append(ref); samples.append({"person_index": person_index})
            np.save(OUT / "embeddings.npy", np.stack(embeddings))
            (OUT / "index.json").write_text(
                json.dumps({"people": people, "samples": samples}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"[{len(people):04}/{args.target}] {candidate['name']} ({len(refs)} samples)", flush=True)
        except Exception as exc:
            print(f"skip {candidate['name']}: {exc}", flush=True)
        time.sleep(args.delay)
    np.save(OUT / "embeddings.npy", np.stack(embeddings))
    (OUT / "index.json").write_text(
        json.dumps({"people": people, "samples": samples}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if len(people) >= args.target and seed_path.exists():
        seed_path.unlink()
    print(f"gallery ready: {len(people)} people / {len(embeddings)} embeddings", flush=True)

if __name__ == "__main__": main()
