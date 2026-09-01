# 새 환경 인수인계 프롬프트

아래 내용을 새 Codex/개발 환경의 첫 메시지로 그대로 붙여 넣으세요.

```text
GitHub 저장소 https://github.com/Kortsec1/im_king 의 최신 main 브랜치를 받아 이어서 개발해줘.

프로젝트는 대학교 축제 부스용 웹 기반 얼굴 닮은꼴 찾기 앱이다. 사용자가 카메라로 정면 사진을 촬영하거나 업로드하면 FastAPI가 InsightFace buffalo_l(ArcFace 계열)로 512차원 얼굴 embedding을 만들고, 사전 등록 갤러리와 NumPy cosine similarity로 비교하여 TOP 3를 반환한다. 사용자 원본 사진과 embedding은 메모리에서만 처리하며 영구 저장하지 않는다. 생성형 AI/LLM이나 벡터 DB는 사용하지 않는다.

현재 구현 상태:
- 행사 실행용 프런트엔드는 frontend/dist에 있는 React 정적 빌드다.
- API 엔트리포인트는 backend/app_v2.py다.
- 통합 게이트웨이는 scripts/dev_gateway.py이며 127.0.0.1:8080에서 프런트와 API를 연결한다.
- 갤러리 생성기는 backend/scripts/prepare_gallery_v2.py다.
- 공개 저장소에는 현재 193명의 메타데이터가 backend/data/gallery_v2/index.json에 있다.
- 갤러리 생성 목표 TARGET은 300명이다. 기존 체크포인트가 있으면 이어서 생성한다.
- 현재 직업군은 배우, 가수, 아이돌뿐 아니라 정치인, 국회의원, 언론인, 학계, 기업인, 방송인, 축구선수, 야구선수, 올림픽 선수 등을 포함한다.
- TOP 3 순위는 raw cosine similarity로 결정하고, 화면 점수는 갤러리 분포를 이용한 상대 점수다. 신원 확인 확률이 아니다.
- 결과 화면은 사용자 사진과 TOP 1 사진을 크게 나란히 보여주고, ArcFace/512D/Cosine/검색 후보 수/데이터 미보존 정보를 표시한다.
- 분석 중에는 얼굴 검출, 정렬, 512D embedding 생성, 전체 갤러리 cosine 비교, TOP 3 선정의 5단계를 약 9.8초에 걸쳐 보여준다.
- 첫 화면, 분석 화면, 결과 화면의 갤러리 인원은 /api/v1/health의 people 값을 사용한다.
- 결과 인물 사진은 Wikimedia 640px CDN 경로를 사용하며 2·3위와 보너스 이미지는 lazy loading 및 async decoding을 사용한다.
- 동물상은 실제 동물 사진이고, 진격의 거인/귀멸의 칼날/원피스 캐릭터 보너스 결과가 있다.
- UI 보강 코드는 frontend/dist/result-enhancer.js와 result-enhancer.css에 있다.

중요한 저장소 정책:
- 원본 얼굴 사진과 embeddings.npy는 개인정보·생체정보 및 이미지 권리 문제 때문에 공개 Git에 커밋하지 않는다.
- backend/data/gallery_v2/index.json과 갤러리 생성 스크립트만 공개한다.
- 새 환경에서는 아래 명령으로 embedding을 재생성해야 한다.

실행 순서(macOS/Linux, Python 3.11~3.12 권장):
1. cd backend
2. python -m venv .venv
3. source .venv/bin/activate
4. pip install -r requirements.txt
5. python scripts/prepare_gallery_v2.py
6. uvicorn app_v2:app --host 127.0.0.1 --port 8001
7. 저장소 루트의 별도 터미널에서 python3 scripts/dev_gateway.py
8. http://127.0.0.1:8080 접속
9. 외부 공개가 필요하면 cloudflared tunnel --url http://127.0.0.1:8080 --no-autoupdate 실행

우선 수행할 작업:
1. 저장소와 README/HANDOFF_PROMPT.md를 읽고 실제 파일 상태를 검증한다.
2. backend/data/gallery_v2/embeddings.npy가 없으면 생성기를 실행한다.
3. Wikimedia 429 제한을 존중하면서 체크포인트부터 300명까지 확장한다. 무리한 병렬 다운로드를 하지 않는다.
4. 생성 후 /api/v1/health의 people/samples가 실제 index 및 embeddings와 같은지 확인한다.
5. 샘플 얼굴로 POST /api/v1/matches를 호출해 TOP 3, 이미지 URL, 점수 필드가 정상인지 확인한다.
6. 브라우저에서 카메라/업로드/분석 애니메이션/결과 비교/모바일 레이아웃/이미지 속도를 검증한다.
7. 변경 전 git status를 확인하고 사용자의 기존 변경을 보존한다.

주의사항:
- Wikimedia 요청이 429를 반환하면 중단하거나 충분히 대기한 뒤 체크포인트부터 재개한다.
- Cloudflare Quick Tunnel URL은 프로세스가 끝나면 사라지는 임시 주소이므로 고정 배포 주소로 간주하지 않는다.
- 유사도 퍼센트를 신원 확인 정확도나 확률이라고 표현하지 않는다.
- 사진 및 캐릭터 이미지의 저작권, 라이선스, 초상권은 실제 행사 공개 전에 별도로 검토한다.
- 변경을 완료하면 테스트 결과, 실제 갤러리 수, 남은 위험, 커밋/PR 주소를 보고한다.
```

