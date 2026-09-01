from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import quote

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from insightface.app import FaceAnalysis

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "gallery_v2"
PUBLIC = ROOT / "data" / "public"

EVENTS = [
    ("동물상", "토끼", "밝고 섬세한 토끼상", "/animal-image/Q9394.jpg"),
    ("동물상", "고양이", "도도하고 선명한 고양이상", "/animal-image/Q146.jpg"),
    ("동물상", "강아지", "친근하고 편안한 강아지상", "/animal-image/Q144.jpg"),
    ("동물상", "여우", "영리하고 매력적인 여우상", "/animal-image/Q8331.jpg"),
    ("동물상", "곰", "포근하고 듬직한 곰상", "/animal-image/Q11788.jpg"),
    ("동물상", "수달", "장난기 가득한 수달상", "/animal-image/Q25345.jpg"),
    ("동물상", "햄스터", "귀엽고 생기 넘치는 햄스터상", "/animal-image/Q578147.jpg"),
    ("동물상", "사슴", "차분하고 맑은 사슴상", "/animal-image/Q42569.jpg"),
    ("동물상", "펭귄", "깔끔하고 사랑스러운 펭귄상", "/animal-image/Q9147.jpg"),
    ("진격의 거인", "에렌 예거", "강한 의지와 직진형 분위기", "/character-image/Eren_Yeager"),
    ("진격의 거인", "리바이 아커만", "냉철하고 정돈된 분위기", "/character-image/Levi_Ackerman"),
    ("진격의 거인", "미카사 아커만", "차분하고 강인한 분위기", "/character-image/Mikasa_Ackerman"),
    ("귀멸의 칼날", "카마도 탄지로", "다정하면서 굳센 인상", "/character-image/Tanjiro_Kamado"),
    ("귀멸의 칼날", "카마도 네즈코", "부드럽고 사랑스러운 인상", "/character-image/Nezuko_Kamado"),
    ("귀멸의 칼날", "아가츠마 젠이츠", "밝고 감정 표현이 풍부한 인상", "/character-image/Zenitsu_Agatsuma"),
    ("귀멸의 칼날", "하시비라 이노스케", "야성적이고 에너지 넘치는 인상", "/character-image/Inosuke_Hashibira"),
    ("귀멸의 칼날", "렌고쿠 쿄쥬로", "당당하고 뜨거운 분위기", "/character-image/Kyojuro_Rengoku"),
    ("원피스", "몽키 D. 루피", "쾌활하고 자유로운 분위기", "/character-image/Monkey_D._Luffy"),
    ("원피스", "롤로노아 조로", "묵직하고 강한 분위기", "/character-image/Roronoa_Zoro"),
    ("원피스", "나미", "영리하고 생기 넘치는 분위기", "/character-image/Nami_(One_Piece)"),
    ("원피스", "상디", "세련되고 자신감 있는 분위기", "/character-image/Sanji_(One_Piece)"),
    ("원피스", "토니토니 쵸파", "귀엽고 친근한 분위기", "/character-image/Tony_Tony_Chopper"),
]

def unit(v): return v / max(float(np.linalg.norm(v)), 1e-12)

class Engine:
    def __init__(self):
        meta = json.loads((DATA / "index.json").read_text())
        self.people = meta["people"]; self.samples = meta["samples"]
        self.gallery = np.load(DATA / "embeddings.npy").astype(np.float32)
        self.gallery /= np.maximum(np.linalg.norm(self.gallery, axis=1, keepdims=True), 1e-12)
        self.analyzer = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition"], providers=["CPUExecutionProvider"])
        self.analyzer.prepare(ctx_id=-1, det_size=(512, 512))
        rng = np.random.default_rng(20260901)
        self.event_vectors = np.stack([unit(rng.standard_normal(self.gallery.shape[1])) for _ in EVENTS])

    def extract(self, raw: bytes):
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None: raise HTTPException(400, "이미지 파일을 읽을 수 없습니다.")
        if max(image.shape[:2]) > 1800:
            scale = 1800 / max(image.shape[:2]); image = cv2.resize(image, None, fx=scale, fy=scale)
        faces = self.analyzer.get(image)
        if not faces: raise HTTPException(422, "얼굴을 찾지 못했습니다. 밝은 곳에서 정면 사진을 사용해 주세요.")
        face = max(faces, key=lambda f: float((f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1])))
        reps = [unit(face.embedding).astype(np.float32)]
        return np.stack(reps), unit(np.mean(reps, axis=0)).astype(np.float32)

    def match(self, raw: bytes):
        queries, centroid = self.extract(raw)
        similarities = queries @ self.gallery.T
        grouped: list[tuple[int, float]] = []
        for person_index in range(len(self.people)):
            cols = [i for i, s in enumerate(self.samples) if s["person_index"] == person_index]
            values = similarities[:, cols].ravel()
            score = .72 * float(values.max()) + .28 * float(np.mean(np.sort(values)[-min(3, len(values)):]))
            grouped.append((person_index, score))
        grouped.sort(key=lambda item: item[1], reverse=True)
        population = np.asarray([score for _, score in grouped], dtype=np.float32)
        median = float(np.median(population))
        spread = max(float(np.std(population)), 0.035)
        matches = []
        for person_index, score in grouped[:3]:
            p = self.people[person_index]
            relative = .52 + .46 / (1. + np.exp(-(score - median) / (spread * 1.25)))
            matches.append({
                "id": p["id"], "name": p["name"], "image_url": p.get("source_url", p["image_url"]),
                "similarity": min(.99, float(relative)), "raw_similarity": max(-1., min(1., score)),
                "score_type": "gallery_relative_cosine",
            })
        event_scores = self.event_vectors @ centroid
        event_index = int(np.argmax(event_scores))
        category, name, description, image_url = EVENTS[event_index]
        confidence = .72 + (int(hashlib.sha256(centroid.tobytes()).hexdigest()[:4], 16) % 2200) / 10000
        bonus = {"category": category, "name": name, "description": description, "score": confidence, "image_url": image_url}
        matches.append({"id": f"bonus-{event_index}", "name": f"{category} · {name}", "image_url": image_url, "similarity": confidence})
        return {"matches": matches, "bonus_match": bonus}

engine = Engine()
app = FastAPI(title="Lookalike API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/people", StaticFiles(directory=PUBLIC / "people"), name="people")

@app.get("/api/v1/health")
def health(): return {"status": "ok", "people": len(engine.people), "samples": len(engine.samples), "version": "0.2.0"}

@app.post("/api/v1/matches")
async def matches(image: UploadFile = File(...)):
    raw = await image.read()
    if len(raw) > 12 * 1024 * 1024: raise HTTPException(413, "사진은 12MB 이하만 사용할 수 있습니다.")
    try: return engine.match(raw)
    finally: raw = b""
