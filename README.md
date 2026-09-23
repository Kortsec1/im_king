# 닮은꼴 찾기 웹앱

## 현재 결과 카드 인쇄 규격 (2026-09-16)

- 포장 크기가 아닌 실제 용지 **72 × 85mm**를 기준으로 합니다.
- 기본 결과 카드, 관리자 프레임 편집/미리보기, 추가 프레임 결과는 모두 72:85 비율입니다. 고정 작업 캔버스는 720 × 850px, PNG 저장은 1440 × 1700px입니다. 아래의 과거 4×6인치/600×900 안내보다 이 규격을 우선합니다.
- 기존 600 × 900 프레임은 읽을 때 배치 좌표를 변환하며, 저장 시 캔버스 크기를 기록해 중복 변환을 방지합니다. 기존 배경 이미지 자체는 늘이지 않으며 contain/cover 선택을 유지합니다. 과거 2:3 배경은 여백 또는 잘림이 생길 수 있으므로 새 규격 배경으로 교체하는 것을 권장합니다.
- 프린터에서 출력 크기를 72 × 85mm로 지정하세요. PNG 픽셀 크기만으로 실제 인쇄 크기가 자동 지정되지는 않습니다. 자동 확대/크롭을 끄고 시험 인쇄로 여백을 확인하세요. 별도 재단 여분(bleed)은 포함하지 않습니다.

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

- Wikimedia 기반 180명 얼굴 갤러리
- 원본 cosine 순위와 갤러리 분포 기반 상대 유사도 표시
- 동물상 및 애니메이션 캐릭터상
- 사용자 사진과 1위 결과의 대형 비교 화면
- 얼굴 검출·정렬·512D embedding·cosine 검색 단계 애니메이션

얼굴 embedding과 원본 사진은 공개 Git 저장소에 포함하지 않습니다. 먼저 로컬에서 갤러리를 생성합니다.

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

## 관리자 데이터셋 자동 등록

`/admin#dataset`에서 Google 관리자 계정으로 접속합니다. 이름·카테고리·공개 HTTPS 이미지 파일 주소를 입력하면 대기열 → 안전한 다운로드 → 이미지 표준화 → 특징 추출 → 영구 저장 → 비교 엔진 반영을 진행합니다. 완료 후 공개 목록과 `/detail?id=...`에서 조회할 수 있으며 웹 재배포는 필요하지 않습니다.

- 같은 대상에 사진을 더하려면 ‘등록 방식’에서 기존 대상을 선택합니다. 동일 사진의 재등록은 중복 저장하지 않습니다.
- 사람: 한 명의 선명한 얼굴, 106점 좌표, 512차원 얼굴 특징. 애니·동물: 기존 전용 시각 특징 모델(사람 얼굴 분석점을 임의 생성하지 않음).
- 서버 측에서 HTTPS·공개 IP·리디렉션·파일 형식·8MB·1,600만 화소를 검증합니다. 등록 사진은 방향 보정 후 1,200px 이하 JPEG로 저장합니다.
- Cloudflare D1 `dataset_samples`에 사진·공개 상세·비공개 비교 벡터를 함께 보관합니다. 공개 API에는 원본 비교 벡터가 포함되지 않습니다.
- 로컬 `backend/data/gallery_v2/custom_samples/`는 비공개 캐시입니다. 작업 처리기가 Cloudflare에서 복원합니다. 원본 정적 데이터셋 파일은 덮어쓰지 않습니다.
- 삭제는 기존 `dataset_exclusions`를 통한 비교·목록 제외이며 복원 가능합니다. 관리자 권한은 Supabase가 요청마다 검증합니다.
- 분석 PC가 켜져 있어야 등록 및 닮은꼴 분석이 진행됩니다. `scripts/start_backend.ps1`와 `scripts/start_queue_worker.ps1`로 실행하며 기존 DPAPI 저장 비밀키를 사용합니다. 비밀키는 코드나 웹에 넣지 않습니다.

검증: `backend/.venv/Scripts/python.exe backend/tests/test_dataset_import.py` (운영 데이터는 변경하지 않음), `cloudflare-worker`에서 Node로 `test-dataset.mjs` (격리된 Cloudflare 저장·권한 테스트).
# 작업 감사 로그

`/logs`는 최고 관리자만 조회할 수 있습니다. 일반 사용자와 운영 관리자는 API에서도 차단됩니다. 앱에는 로그 수정·삭제 API가 없습니다.

- Supabase: 게시물 제출/상태 처리/삭제/사진 연결, 좋아요 추가·취소, 프로필 생성/닉네임 변경, 데이터셋 공개 제외·복원, 사용자 권한 변경. `supabase/activity_audit.sql`의 트리거가 원래 변경과 같은 트랜잭션에서 기록합니다.
- Cloudflare D1: 분석·등록 작업 접수/완료/실패/만료, 기준 사진 등록·삭제·복원, 데이터셋 정보 수정. `cloudflare-worker/audit-schema.sql` 적용 필요. 작업 큐의 만료 정리가 감사 로그를 지우지 않습니다.
- 사진, 임베딩, 요청 본문, 게시글 본문, 인증 토큰, 이메일·IP는 감사 로그에 저장하지 않습니다. 작업자 ID/닉네임, 대상 ID와 제한된 변경 정보만 저장합니다. 기존 작업은 소급 생성하지 않으며, 페이지 방문·클릭·브라우저 파일 저장·로그인/로그아웃은 이 기능의 기록 범위가 아닙니다.
- 검증: `cloudflare-worker/test-dataset.mjs`, `test-audit-auth.mjs`. Supabase 변경은 트랜잭션 롤백 테스트로 확인합니다. DB 운영자가 직접 수행한 변경은 작업자가 시스템으로 표시될 수 있습니다.

## 2026-09-15 운영 및 카드 저장

### 머리카락 보조 비교

- `scripts/install_hair_model.ps1`은 Google MediaPipe HairSegmenter v1 모델을 로컬에 설치하며 SHA-256을 확인합니다. 모델은 Apache 2.0, 설명/한계: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20-%20Hair%20Segmentation.pdf . 사용자 사진은 외부로 보내지 않고 마스크는 요청 메모리에서만 처리합니다.
- 기존 OpenCV 4.12 headless를 보존하려고 MediaPipe는 `--no-deps`로 설치합니다. MediaPipe의 배포 메타데이터가 요구하는 `opencv-contrib-python` 대신 기존 OpenCV core를 사용하므로 `pip check`에는 해당 선택적 대체 경고가 표시됩니다. 사용하는 ImageSegmenter 경로는 실제 모델 테스트로 검증합니다.
- 사용자 사진과 **각 인물 기준 사진**을 같은 분리 모델로 처리합니다. 분리한 마스크의 얼굴 대비 길이와 이마 덮임 비율로 ‘사진에서 보이는’ 머리 길이·앞머리를 추정합니다. 묶은 머리, 모자, 잘린 사진, 작은 얼굴은 불확실할 수 있으며 실제 머리 길이/성별 판정이 아닙니다.
- 명확한 헤어에 한해 얼굴 비교 원점수에 최대 ±0.015를 보조 반영합니다. 미확인은 0점, 관리자 사진별 확인값 우선, 관리자 모자 있음은 헤어 비교 제외입니다. 머리 길이로 성별 분류를 변경하지 않습니다. 성별 후보 필터의 오류를 헤어가 해결한다는 보장은 없습니다.
- `prepare_reference_features.py`로 모든 기존 기준 사진의 파생 특징을 미리 계산합니다. 새로 등록하는 인물 사진에도 자동 계산됩니다. 모델이 없으면 기존 얼굴 분석은 계속되고 헤어는 미확인으로 표시합니다. 실제 분리 모델 테스트와 합성 마스크 테스트: `backend/tests/test_hair_features.py`.

- 전체 서비스 재시작: PowerShell에서 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart_services.ps1`. 이 프로젝트의 프로세스만 재시작하며 백엔드·큐 워커·게이트웨이를 숨김 백그라운드로 실행합니다. 로그는 `backend/logs/`에 남습니다. PC 종료·절전 중에는 분석할 수 없습니다.
- 인물 기준 사진 사전 계산: `backend/.venv/Scripts/python.exe backend/scripts/prepare_reference_features.py`. 결과는 로컬 `reference_features.json`, 공개 분류만 `frontend/dist/dataset-genders.json`. 모델 추정과 기존 정보의 출처를 구분하고 불일치 인물은 미분류로 남깁니다. 관리자 수정값이 우선하며 미분류는 성별별 매칭에서 제외합니다.
- 카드 원본은 고정 600×900 CSS px이며 화면에서는 전체를 비례 축소합니다. 고정 Pretendard Black 글꼴과 동일 DOM을 2배로 저장해 PNG 1200×1800px(4×6인치 비율)을 만듭니다. 선택을 나타내는 빨간 테두리는 화면 조작용으로 인쇄하지 않습니다. 자체 호스팅 `html-to-image@1.11.13` 번들은 `assets/card-dom-export-v1.js`, 글꼴은 `assets/PosterBlack-v1.woff2`이며 각각의 라이선스를 동봉합니다. 인쇄 시 4×6 크기를 선택하고 자동 크롭을 끄세요. 실제 인쇄 색상은 프린터에 따라 달라질 수 있습니다.
- 사진별 관리자 확인 특징: 상세 페이지의 ‘현재 사진의 특징 수정’에서 안경·수염·머리 길이·앞머리·모자·메모를 저장합니다. 먼저 `cloudflare-worker/attributes-schema.sql`을 D1에 적용해야 합니다. 수정 API는 관리자만 허용하고 감사 로그를 남깁니다. 불확실한 값은 `unknown`입니다. 최종 결과의 `reference_attributes`는 선택된 기준 사진의 확인값이며, 이 편집 자체가 자동 검출 모델을 학습시키거나 매칭 가중치를 바꾸지는 않습니다.
- 전시는 관리자 전용이며 3·5·8·15·30초를 선택할 수 있습니다. 분석점/정렬점/사진 수와 사진별 측정값을 표시합니다. 추가로 표시하는 수치는 새로 추정한 신뢰도가 아니라 기존 사진 분석값입니다.
