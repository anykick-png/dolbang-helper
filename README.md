# 돌방도우미 MVP

현장 방문 영업을 위해 현재 위치 기준으로 근처 기업을 지도/목록으로 보여주는 모바일 우선 웹앱입니다.

## 기술 스택
- Next.js 16 (App Router) + TypeScript
- Tailwind CSS
- Kakao Maps JavaScript API
- Kakao Local API (엑셀 주소 일괄 지오코딩)
- 정적 데이터 파일 (`public/companies.json`) 기반 동작

## 주요 기능
- 브라우저 현재 위치 가져오기
- 반경 필터 1km / 3km / 5km
- 지도 마커 + 반경 원 오버레이
- 반경 내 기업 목록 (거리순 정렬)
- 기업 상세 정보 패널
- 기업명/대표자명/업종 검색
- 모바일 전화걸기 (`tel:`)
- 위치 권한 거부 시 기본 중심 좌표 + 안내 메시지

## 환경 변수
루트에 `.env.local` 파일을 만들고 아래 값을 설정하세요.

```bash
NEXT_PUBLIC_KAKAO_MAP_JS_KEY=your_kakao_javascript_key
KAKAO_REST_API_KEY=your_kakao_rest_api_key
NEXT_PUBLIC_DEFAULT_LAT=37.5665
NEXT_PUBLIC_DEFAULT_LNG=126.9780
```

샘플은 `.env.example` 파일에 있습니다.

## 데이터 전처리 (1회 또는 데이터 갱신 시)
엑셀 `realdolbang_fixed.xlsx`를 읽어 자동 컬럼 매핑 후 주소 지오코딩을 수행합니다.

```bash
npm run prepare:data
```

생성 파일:
- `public/companies.json` : 지도/근거리 계산용 (좌표 성공 행만 포함)
- `data/cleaned_companies.json` : 정제 전체 데이터
- `data/failed_addresses.json` : 주소 누락/지오코딩 실패 행
- `data/preparation_summary.json` : 선택 시트/매핑/통계 요약
- `data/geocode_cache.json` : 주소-좌표 캐시

## 로컬 실행
```bash
npm install
npm run prepare:data
npm run dev
```

브라우저: `http://localhost:3000`

## 품질 확인
```bash
npm run lint
npm run build
```

## Vercel 배포
1. Vercel에 Git 저장소 연결
2. Project Settings > Environment Variables에 아래 등록
   - `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`
   - `KAKAO_REST_API_KEY` (전처리 재실행이 필요할 때만 필수)
   - `NEXT_PUBLIC_DEFAULT_LAT` (선택)
   - `NEXT_PUBLIC_DEFAULT_LNG` (선택)
3. Build Command: `npm run build`
4. Output: Next.js 기본 설정 사용

## 필수 확인 (키가 없을 때만)
`KAKAO_REST_API_KEY`가 없으면 지오코딩이 수행되지 않아 `public/companies.json`이 비거나 매우 적을 수 있습니다.  
이 경우 키를 설정한 뒤 `npm run prepare:data`를 다시 실행하세요.

