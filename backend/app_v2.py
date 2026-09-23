from __future__ import annotations

import json
import hashlib
import ipaddress
import socket
from urllib.request import Request, urlopen
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Header
from starlette.concurrency import run_in_threadpool
from dataset_import import LOCK, require_worker, prepare_record, load_records, save_record, merge_records
from pydantic import BaseModel, HttpUrl
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from insightface.app import FaceAnalysis
from visual_similarity import explain_traits, face_traits, trait_similarity, visual_embedding
from hair_features import extract_hair, compare_hair, hair_description

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "gallery_v2"
PUBLIC = ROOT / "data" / "public"
OVERRIDES = DATA / "admin_overrides.json"

NON_HUMAN_DATASET = [
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

NON_HUMAN_DATASET = [
    ("동물", "토끼", "민첩하고 부드러운 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/37/Oryctolagus_cuniculus_Tasmania_2.jpg/960px-Oryctolagus_cuniculus_Tasmania_2.jpg"),
    ("동물", "고양이", "도도하고 영리한 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/Cat_playing_with_a_lizard.jpg/960px-Cat_playing_with_a_lizard.jpg"),
    ("동물", "골든 리트리버", "친근하고 편안한 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bf/D%C3%BClmen%2C_Hausd%C3%BClmen%2C_Golden_Retriever_--_2022_--_5945.jpg/960px-D%C3%BClmen%2C_Hausd%C3%BClmen%2C_Golden_Retriever_--_2022_--_5945.jpg"),
    ("동물", "붉은여우", "영리하고 매력적인 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Vulpes_vulpes_laying_in_snow.jpg/960px-Vulpes_vulpes_laying_in_snow.jpg"),
    ("동물", "불곰", "우직하고 든든한 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5d/Kamchatka_Brown_Bear_near_Dvuhyurtochnoe_on_2015-07-23.jpg/960px-Kamchatka_Brown_Bear_near_Dvuhyurtochnoe_on_2015-07-23.jpg"),
    ("동물", "해달", "장난기 있고 다정한 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Sea-otter-morro-bay_13.jpg/960px-Sea-otter-morro-bay_13.jpg"),
    ("동물", "햄스터", "작고 생기 넘치는 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/Baby_Hamster_-_2_Weeks_Old.jpg/960px-Baby_Hamster_-_2_Weeks_Old.jpg"),
    ("동물", "붉은사슴", "차분하고 맑은 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Cervus_elaphus_Luc_Viatour_3.jpg/960px-Cervus_elaphus_Luc_Viatour_3.jpg"),
    ("동물", "펭귄", "깔끔하고 사랑스러운 인상", "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1d/Penguin_in_Antarctica_jumping_out_of_the_water.jpg/960px-Penguin_in_Antarctica_jumping_out_of_the_water.jpg"),
    ("진격의 거인", "에렌 예거", "강한 의지와 직진하는 분위기", "https://static.wikia.nocookie.net/shingekinokyojin/images/6/69/Eren_Yeager_character_image.png/revision/latest"),
    ("진격의 거인", "리바이 아커만", "냉철하고 정돈된 분위기", "https://static.wikia.nocookie.net/shingekinokyojin/images/9/94/Levi_Ackerman_character_image.png/revision/latest"),
    ("진격의 거인", "미카사 아커만", "차분하고 강인한 분위기", "https://static.wikia.nocookie.net/shingekinokyojin/images/f/f7/Mikasa_Ackerman_character_image.png/revision/latest"),
    ("귀멸의 칼날", "카마도 탄지로", "다정하면서 굳센 인상", "https://static.wikia.nocookie.net/kimetsu-no-yaiba/images/0/05/Tanjiro_anime_right_face.png/revision/latest"),
    ("귀멸의 칼날", "카마도 네즈코", "부드럽고 사랑스러운 인상", "https://static.wikia.nocookie.net/kimetsu-no-yaiba/images/0/0e/Nezuko_anime_right_face.png/revision/latest"),
    ("귀멸의 칼날", "아가츠마 젠이츠", "밝고 감정 표현이 풍부한 인상", "https://static.wikia.nocookie.net/kimetsu-no-yaiba/images/4/4f/Zenitsu_anime_right_face.png/revision/latest"),
    ("귀멸의 칼날", "하시비라 이노스케", "야성적이고 에너지 넘치는 인상", "https://static.wikia.nocookie.net/kimetsu-no-yaiba/images/d/d4/Inosuke_anime.png/revision/latest"),
    ("귀멸의 칼날", "렌고쿠 쿄쥬로", "당당하고 따뜻한 분위기", "https://static.wikia.nocookie.net/kimetsu-no-yaiba/images/d/de/Kyojuro_anime_right_face.png/revision/latest"),
    ("원피스", "몽키 D. 루피", "쾌활하고 자유로운 분위기", "https://static.wikia.nocookie.net/onepiece/images/6/6d/Monkey_D._Luffy_Anime_Post_Timeskip_Infobox.png/revision/latest"),
    ("원피스", "롤로노아 조로", "묵직하고 강한 분위기", "https://static.wikia.nocookie.net/onepiece/images/5/52/Roronoa_Zoro_Anime_Post_Timeskip_Infobox.png/revision/latest"),
    ("원피스", "나미", "영리하고 생기 넘치는 분위기", "https://static.wikia.nocookie.net/onepiece/images/6/68/Nami_Anime_Post_Timeskip_Infobox.png/revision/latest"),
    ("원피스", "상디", "세련되고 자신감 있는 분위기", "https://static.wikia.nocookie.net/onepiece/images/b/b6/Sanji_Anime_Post_Timeskip_Infobox.png/revision/latest"),
    ("원피스", "토니토니 쵸파", "귀엽고 친근한 분위기", "https://static.wikia.nocookie.net/onepiece/images/a/af/Tony_Tony_Chopper_Anime_Post_Timeskip_Infobox.png/revision/latest"),
]

def unit(v): return v / max(float(np.linalg.norm(v)), 1e-12)

class Engine:
    def __init__(self):
        meta = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
        disabled = set(json.loads(OVERRIDES.read_text(encoding="utf-8")).get("disabled", [])) if OVERRIDES.exists() else set()
        self.people = [person for person in meta["people"] if person["id"] not in disabled]
        old_to_new = {old: new for new, old in enumerate(i for i, person in enumerate(meta["people"]) if person["id"] not in disabled)}
        self.samples = [{**sample, "person_index": old_to_new[sample["person_index"]]} for sample in meta["samples"] if sample["person_index"] in old_to_new]
        self.photo_geometry = json.loads((DATA/'photo_geometry.json').read_text(encoding='utf-8')) if (DATA/'photo_geometry.json').exists() else {}
        for sample in self.samples:
            item_id=self.people[sample['person_index']]['id'];number=sample.get('reference',1)
            sample['sample_id']=f'base-{item_id}-{number}'
            sample['path']=f"/people/{item_id}{'-ref'+str(number) if number>1 else ''}.jpg"
            sample['traits']=self.photo_geometry.get(sample['sample_id'],{}).get('traits',{})
        all_gallery = np.load(DATA / "embeddings.npy").astype(np.float32)
        keep_people = {person["id"] for person in self.people}
        keep_indexes = [i for i, person in enumerate(meta["people"]) if person["id"] in keep_people]
        keep_cols = [i for i, sample in enumerate(meta["samples"]) if sample["person_index"] in keep_indexes]
        self.gallery = all_gallery[keep_cols] if keep_cols else all_gallery
        self.gallery /= np.maximum(np.linalg.norm(self.gallery, axis=1, keepdims=True), 1e-12)
        self.sample_columns = [np.asarray([i for i, sample in enumerate(self.samples) if sample["person_index"] == person_index], dtype=np.int32) for person_index in range(len(self.people))]
        self.analyzer = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition", "genderage", "landmark_2d_106"], providers=["CPUExecutionProvider"])
        self.analyzer.prepare(ctx_id=-1, det_size=(512, 512))
        self.face_traits = json.loads((DATA / "face_traits.json").read_text(encoding="utf-8"))
        self.visual_items = json.loads((DATA / "visual_items.json").read_text(encoding="utf-8"))
        for item in self.visual_items:
            number=item.get('reference_index',0)+1
            item['sample_id']=f"base-{item['id']}-{number}"
            item['image']=f"/nonhuman/{item['id']}{'-ref'+str(number) if number>1 else ''}.jpg"
        self.visual_vectors = np.load(DATA / "visual_models.npz")["vectors"].astype(np.float32)
        self.custom_samples = set()
        merge_records(self, load_records(DATA / 'custom_samples'))
        cache_path=DATA/'reference_features.json'
        self.reference_features=json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {'photos':{},'people':{}}
        for sample in self.samples:
            cached=self.reference_features['photos'].get(sample['sample_id'])
            if cached:
                sample['traits']=cached['traits']
                sample['hair_features']=cached.get('hair_features',{})

    def reload(self):
        self.__init__()

    def extract(self, raw: bytes):
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None: raise HTTPException(400, "이미지 파일을 읽을 수 없습니다.")
        if max(image.shape[:2]) > 1800:
            scale = 1800 / max(image.shape[:2]); image = cv2.resize(image, None, fx=scale, fy=scale)
        faces = self.analyzer.get(image)
        if not faces: raise HTTPException(422, "얼굴을 찾지 못했습니다. 밝은 곳에서 정면 사진을 사용해 주세요.")
        face = max(faces, key=lambda f: float((f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1])))
        face['hair_features']=extract_hair(image,face.bbox,single_face=len(faces)==1)
        height, width = image.shape[:2]
        landmarks = getattr(face, "landmark_2d_106", None)
        face["analysis_geometry"] = {
            "width": width, "height": height,
            "landmarks": (np.asarray(landmarks) / [width, height]).round(6).tolist() if landmarks is not None else [],
            "keypoints": (np.asarray(face.kps) / [width, height]).round(6).tolist(),
            "bbox": (np.asarray(face.bbox) / [width, height, width, height]).round(6).tolist(),
        }
        reps = [unit(face.embedding).astype(np.float32)]
        flipped = cv2.flip(image, 1)
        flipped_faces = self.analyzer.get(flipped)
        if flipped_faces:
            flipped_face = max(flipped_faces, key=lambda f: float((f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1])))
            reps.append(unit(flipped_face.embedding).astype(np.float32))
        x1, y1, x2, y2 = face.bbox.astype(int)
        pad_x, pad_y = int((x2 - x1) * .22), int((y2 - y1) * .22)
        face_image = image[max(0, y1-pad_y):min(image.shape[0], y2+pad_y), max(0, x1-pad_x):min(image.shape[1], x2+pad_x)]
        return np.stack(reps), unit(np.mean(reps, axis=0)).astype(np.float32), face_traits(face, image), face_image, face

    @staticmethod
    def profile_estimates(face, traits: dict[str, float], image=None) -> dict:
        age = max(1, int(getattr(face, "age", 0) or 0))
        lower = max(10, (age // 10) * 10)
        outline = traits["outline"]
        face_shape = "긴형" if outline < .72 else "둥근형" if outline > .86 else "타원형"
        eye_style = "수평형" if traits["eye_tilt"] < .025 else "사선형"
        impression = "부드러운 인상" if traits["mouth_width"] < .39 else "또렷한 인상"
        nose_shape = "가늘고 긴 편" if traits.get("nose_width", .18) < .17 else ("폭이 있는 편" if traits.get("nose_width", .18) > .23 else "균형형")
        eyebrow_style = "곡선형" if traits.get("brow_arch", .03) > .035 else "직선형"
        head_shape = "세로형" if traits.get("jaw_depth", .8) > .82 else ("가로형" if traits.get("head_width", .9) > .94 else "균형형")
        lightness = traits.get("skin_lightness", .55)
        photo_tone = "밝게 촬영됨" if lightness > .67 else ("어둡게 촬영됨" if lightness < .48 else "중간 밝기")
        visual_cues = {"glasses": "확인 필요", "beard": "확인 필요", "hair": "확인 필요", "accessory": "확인 필요"}
        if image is not None:
            try:
                crop=image
                gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY);h,w=gray.shape
                eye_band=gray[int(h*.28):int(h*.52),int(w*.08):int(w*.92)]
                lower_band=gray[int(h*.58):int(h*.94),int(w*.12):int(w*.88)]
                eye_edges=float(cv2.Canny(eye_band,80,160).mean()/255) if eye_band.size else 0
                lower_dark=float((lower_band<72).mean()) if lower_band.size else 0
                visual_cues["glasses"]="안경 프레임 가능성 있음" if eye_edges>.18 else "안경 프레임 뚜렷하지 않음"
                visual_cues["beard"]="수염·턱 음영 가능성 있음" if lower_dark>.22 else "수염·턱 음영 뚜렷하지 않음"
                visual_cues["accessory"]="얼굴 주변 액세서리 확인 필요"
            except Exception: pass
        return {
            "age": age,
            "hair_features":face.get('hair_features') or {},
            "age_range": f"{lower}대",
            "presentation": "남성형" if int(getattr(face, "gender", 0) or 0) == 1 else "여성형",
            "face_shape": face_shape,
            "eye_style": eye_style,
            "impression": impression,
            "nose_shape": nose_shape, "eyebrow_style": eyebrow_style, "head_shape": head_shape, "photo_tone": photo_tone,
            "visual_cues": {**visual_cues,'hair':hair_description(face.get('hair_features') or {})},
            "notice": "사진 한 장에서 읽은 시각적 추정치예요. 안경·수염·헤어는 사진 품질과 조명에 따라 달라질 수 있어요.",
        }

    @staticmethod
    def person_age(person: dict) -> int | None:
        birth = person.get("birth") or ""
        try:
            return datetime.now(timezone.utc).year - int(birth[:4])
        except (TypeError, ValueError):
            return None

    def visual_matches(self, face_image: np.ndarray, mode: str, excluded=frozenset(), removed_photos=frozenset()):
        query = visual_embedding(face_image, mode)
        candidates = [(index, float(vector @ query)) for index, vector in enumerate(self.visual_vectors) if self.visual_items[index]["type"] == mode and self.visual_items[index]['id'] not in excluded and self.visual_items[index].get('sample_id') not in removed_photos]
        if not candidates: return []
        grouped = {}
        for index, score in candidates:
            item_id = self.visual_items[index]["id"]
            grouped.setdefault(item_id, []).append((index, score))
        candidates = []
        for samples in grouped.values():
            samples.sort(key=lambda value: value[1], reverse=True)
            scores = [value[1] for value in samples[:3]]
            candidates.append((samples[0][0], .72 * max(scores) + .28 * float(np.mean(scores))))
        candidates.sort(key=lambda value: value[1], reverse=True)
        values = np.asarray([score for _, score in candidates], dtype=np.float32)
        median, spread = float(np.median(values)), max(float(np.std(values)), .025)
        results = []
        for index, score in candidates[:3]:
            item = dict(self.visual_items[index])
            item["image_url"] = item.pop("image")
            item["similarity"] = min(.96, .58 + .36 / (1 + np.exp(-(score - median) / (spread * 1.35))))
            item["raw_similarity"] = score
            item["score_type"] = f"{mode}_visual_ensemble"
            results.append(item)
        return results

    def match(self, raw: bytes, match_gender='auto'):
        if match_gender not in {'auto','male','female'}:raise HTTPException(422,'성별 선택값을 확인해 주세요.')
        try:
            request = Request('https://dphiuepbsullrscuuzrc.supabase.co/rest/v1/dataset_exclusions?select=item_id', headers={'apikey':'sb_publishable_kmj9VR5ie5sFFQvGm9TcSw_MbBGUMtq'})
            with urlopen(request, timeout=8) as response:
                excluded = {row['item_id'] for row in json.load(response)}
            with urlopen(Request('https://im-king-analysis-queue.im-king-analysis-queue.workers.dev/dataset/photo-state', headers={'User-Agent': 'LookalikeBackend/1.0'}),timeout=8) as response:
                photo_state = json.load(response)
                removed_photos = {row['sample_id'] for row in photo_state['removed']}
                metadata = {row['item_id']: row for row in photo_state.get('metadata', [])}
                gender_overrides = {row['item_id']:row['gender'] for row in photo_state.get('genders',[])}
                photo_attributes = {row['sample_id']:row['attributes'] for row in photo_state.get('attributes',[])}
        except Exception:
            raise HTTPException(503, '데이터셋 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        queries, centroid, query_traits, face_image, face = self.extract(raw)
        estimates = self.profile_estimates(face, query_traits, face_image)
        similarities = queries @ self.gallery.T
        grouped = []
        expected_gender = "Q6581097" if estimates["presentation"] == "남성형" else "Q6581072"
        if match_gender!='auto':expected_gender={'male':'Q6581097','female':'Q6581072'}[match_gender]
        known_gender_ids = {"Q6581097", "Q6581072"}
        requested_gender='male' if expected_gender=='Q6581097' else 'female'
        for person_index in range(len(self.people)):
            if self.people[person_index]['id'] in excluded: continue
            cols = [col for col in self.sample_columns[person_index] if self.samples[col].get('sample_id') not in removed_photos]
            if not cols: continue
            values = similarities[:, cols].ravel()
            score = .72 * float(values.max()) + .28 * float(np.mean(np.sort(values)[-min(3, len(values)):]))
            person = self.people[person_index]
            effective_gender=gender_overrides.get(person['id'],self.reference_features['people'].get(person['id'],{}).get('gender',{'Q6581097':'male','Q6581072':'female'}.get(person.get('gender'),'unknown')))
            person_gender={'male':'Q6581097','female':'Q6581072'}.get(effective_gender)
            if effective_gender != requested_gender:
                continue
            presentation_adjustment = .04 if person_gender == expected_gender else (-.12 if person_gender in {"Q6581097", "Q6581072"} else 0)
            age = self.person_age(person)
            age_adjustment = -min(.045, max(0, abs(age - estimates["age"]) - 12) * .002) if age is not None else 0
            photo_candidates={}
            for col in cols:
                ref=self.samples[col].get('traits') or {}
                geometry,tone=trait_similarity(query_traits,ref)
                embedding_score=float(similarities[:,col].max())
                combined=embedding_score+.10*(.75*geometry+.25*tone-.5)
                sid=self.samples[col]['sample_id']
                combined+=compare_hair(face.get('hair_features') or {},self.samples[col].get('hair_features') or {},photo_attributes.get(sid))['adjustment']
                if sid not in photo_candidates or combined>photo_candidates[sid][0]:
                    photo_candidates[sid]=(combined,col,embedding_score)
            ranked=sorted(photo_candidates.values(),reverse=True)
            score=.72*ranked[0][0]+.28*float(np.mean([x[0] for x in ranked[:3]]))
            grouped.append((person_index, score + presentation_adjustment + age_adjustment, ranked[0][2], ranked[0][1]))
        grouped.sort(key=lambda item: item[1], reverse=True)
        population = np.asarray([score for _, score, _, _ in grouped], dtype=np.float32)
        median = float(np.median(population)) if len(population) else 0
        spread = max(float(np.std(population)), 0.035) if len(population) else .035
        matches = []
        for person_index, score, face_score, active_col in grouped[:3]:
            p = self.people[person_index]
            active_cols=[col for col in self.sample_columns[person_index] if self.samples[col].get('sample_id') not in removed_photos]
            result_image = self.samples[active_col]['path']
            reference_traits=self.samples[active_col].get('traits') or {}
            relative = .52 + .46 / (1. + np.exp(-(score - median) / (spread * 1.25)))
            matches.append({
                "id": p["id"], "name": p["name"], "image_url": result_image,
                "category": " · ".join((p.get("occupations") or ["인물"])[:2]),
                "similarity": min(.99, float(relative)), "raw_similarity": max(-1., min(1., face_score)),
                "score_type": "multi_reference_geometry_hair_v3", "dataset_gender":requested_gender,
                "hair_comparison":compare_hair(face.get('hair_features') or {},self.samples[active_col].get('hair_features') or {},photo_attributes.get(self.samples[active_col]['sample_id'])),
                "reference_attributes":photo_attributes.get(self.samples[active_col]['sample_id'],{}),
                "estimated_age_gap": abs(self.person_age(p) - estimates["age"]) if self.person_age(p) is not None else None,
                "explanations": explain_traits(query_traits, reference_traits),
            })
        result = {
            "matches": matches,
            "character_matches": self.visual_matches(face_image, "character", excluded, removed_photos),
            "animal_matches": self.visual_matches(face_image, "animal", excluded, removed_photos),
            "profile_estimates": estimates,
            "match_preferences":{'gender':requested_gender,'source':'automatic' if match_gender=='auto' else 'user'},
            "face_geometry": face["analysis_geometry"],
            "model_info": {"human": "ArcFace + per-photo geometry + visible hair + classified candidate filter v3", "character": "character_visual_ensemble_v1", "animal": "animal_visual_ensemble_v1"},
        }
        for key in ('matches', 'character_matches', 'animal_matches'):
            for entry in result[key]:
                override = metadata.get(entry['id'])
                if override:
                    entry.update(name=override['name'], group=override['group'], category=override['group'], description=override['description'])
        return result
        non_human_scores = self.non_human_vectors @ centroid
        event_index = int(np.argmax(non_human_scores))
        category, name, description, image_url = NON_HUMAN_DATASET[event_index]
        confidence = .72 + (int(hashlib.sha256(centroid.tobytes()).hexdigest()[:4], 16) % 2200) / 10000
        item_type = "animal" if category == "동물상" else "character"
        item_type = "animal" if event_index < 9 else "character"
        matches.append({"id": f"{item_type}-{event_index}", "type": item_type, "group": category, "name": name, "description": description, "image_url": image_url, "similarity": confidence})
        return {"matches": matches}

engine = Engine()
app = FastAPI(title="Lookalike API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/people", StaticFiles(directory=PUBLIC / "people"), name="people")
app.mount("/nonhuman", StaticFiles(directory=PUBLIC / "nonhuman"), name="nonhuman")

@app.get("/api/v1/health")
def health(): return {"status": "ok", "people": len(engine.people), "dataset_items": len(engine.people) + len(engine.visual_items), "samples": len(engine.samples), "version": "0.2.0"}

@app.post("/api/v1/admin/dataset/from-url")
def dataset_from_url(payload: dict, authorization: str | None = Header(default=None)):
    require_worker(authorization)
    with LOCK:
        return prepare_record(engine, payload)

@app.post("/api/v1/admin/dataset/apply")
def dataset_apply(payload: dict, authorization: str | None = Header(default=None)):
    require_worker(authorization)
    with LOCK:
        record = payload["record"]
        # Validate using merge before persisting, while callers cannot observe partial updates.
        merge_records(engine, [record])
        save_record(DATA / "custom_samples", record)
        return {"ok": True, "id": record["item"]["id"], "samples": len(engine.custom_samples)}

def locked_match(raw,match_gender='auto'):
    with LOCK:
        return engine.match(raw,match_gender)

@app.post("/api/v1/matches")
async def matches(image: UploadFile = File(...),match_gender: str = Form('auto')):
    raw = await image.read()
    if len(raw) > 12 * 1024 * 1024: raise HTTPException(413, "사진은 12MB 이하만 사용할 수 있습니다.")
    try: return await run_in_threadpool(locked_match, raw,match_gender)
    finally: raw = b""
