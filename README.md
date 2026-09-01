# 닮은꼴 찾기 웹앱

행사 부스에서 사진을 촬영하거나 업로드하면, InsightFace 임베딩과 cosine similarity로 사전 등록 인물 중 TOP 3를 반환하는 웹앱입니다.

## 아키텍처

```text
React (camera/upload)
        │ multipart/form-data (memory only)
        ▼
FastAPI /api/v1/matches
        │
        ├─ FaceAnalysisService (InsightFace / ArcFace embedding)
        └─ PersonRepository (.npy matrix + people.json)
                     │
                     └─ normalized matrix multiplication → TOP 3
```

사용자 이미지와 임베딩은 파일이나 DB에 기록하지 않습니다. 요청 처리 중 메모리에서만 사용되고 응답 생성 후 참조가 해제됩니다. 비교 대상 사진과 임베딩만 `backend/data/people`에 보관합니다.

## 폴더 구조

- `frontend`: React + Vite 웹 UI
- `backend/app/api`: HTTP 엔드포인트
- `backend/app/services`: 얼굴 분석과 매칭 로직
- `backend/app/repositories`: 등록 인물 데이터 로딩
- `backend/scripts/register_people.py`: 비교 대상 임베딩 사전 생성
- `backend/tests`: 벡터 검색 단위 테스트

## 로컬 실행

Python 3.11을 권장합니다.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

다른 터미널에서:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 실제 배포에서 카메라는 HTTPS 또는 localhost에서만 동작합니다.

## 비교 인물 등록

인물별로 한 장 이상의 정면 사진을 아래처럼 준비합니다.

```text
backend/data/source/
├── person-001/
│   ├── profile.jpg
│   └── second.jpg
└── person-002/
    └── profile.jpg
```

`backend/data/people.json`에 이름과 공개 사진 URL을 작성한 뒤 실행합니다.
결과 화면에 보여줄 사진은 `backend/data/public/people/<파일명>`에 두고 `image_url`을 `/people/<파일명>`으로 지정합니다.

```bash
cd backend
python -m scripts.register_people --source data/source
```

여러 사진이 있으면 정규화한 임베딩의 평균을 다시 정규화해 대표 벡터로 저장합니다. 운영 환경에서는 해당 사진의 사용 권리와 당사자 동의를 확인하세요.

### Wikimedia Commons 인물 세트

공개 라이선스 대표 사진과 저작자·출처·라이선스 기록을 자동으로 준비할 수 있습니다.

```bash
cd backend
.venv/bin/python -m scripts.prepare_wikimedia_people
.venv/bin/python -m scripts.register_people --source data/source
```

후보 명단은 `data/wikimedia_people.json`, 라이선스 기록은 `data/ATTRIBUTIONS.json`입니다. 사진 라이선스와 별개인 초상권·퍼블리시티권은 행사 주최 측에서 확인해야 합니다.

## API

`POST /api/v1/matches`에 `image` 파일을 전송합니다. JPEG/PNG/WebP, 최대 10MB이며 정확히 한 명의 얼굴이 보여야 합니다.

```json
{
  "matches": [
    {"id": "person-001", "name": "인물 이름", "image_url": "/people/person-001.jpg", "similarity": 0.8123}
  ]
}
```

표시용 퍼센트는 cosine similarity를 `0~100%` 범위로 제한한 값입니다. 이것은 신원 확인 확률이 아닙니다.

## 행사 확장판(v2)

`backend/app_v2.py`에는 다음 기능이 포함되어 있습니다.

- Wikimedia 기반 현재 193명 얼굴 갤러리(생성 목표 300명)
- 원본 cosine 순위와 갤러리 분포 기반 상대 유사도 표시
- 동물상 및 애니메이션 캐릭터상
- 사용자 사진과 1위 결과의 대형 비교 화면
- 얼굴 검출·정렬·512D embedding·cosine 검색 단계 애니메이션

얼굴 embedding과 원본 사진은 공개 Git 저장소에 포함하지 않습니다. 먼저 로컬에서 갤러리를 생성합니다.
`backend/data/gallery_v2/index.json`은 인물 메타데이터만 포함하며, 새 환경에서
`embeddings.npy`와 기준 사진을 아래 생성기로 준비해야 합니다.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/prepare_gallery_v2.py
uvicorn app_v2:app --host 127.0.0.1 --port 8001
```

통합 웹 게이트웨이 실행:

```bash
python3 scripts/dev_gateway.py
```

브라우저에서 `http://127.0.0.1:8080`을 엽니다. `frontend/dist`는 행사 실행용 정적 빌드이며 별도의 Vite 서버가 필요하지 않습니다.
