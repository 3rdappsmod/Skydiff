# SkyDiff

하늘색 테마의 크로스플랫폼(Windows · Linux) 텍스트 비교(diff) 프로그램입니다.
[diffchecker.com](https://www.diffchecker.com/)의 UI/메뉴 구성을 참고해 만들었습니다.

![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2563eb)
![license](https://img.shields.io/badge/license-MIT-0ea5e9)

## 주요 기능

**표시**
- 레이아웃: 나란히 보기 / 합쳐 보기
- 실시간 편집(입력하는 즉시 비교 결과 갱신)
- 공백 변경 숨기기, 변경 없는 행 숨기기, 줄바꿈 비활성화
- 비교 단위: 스마트 / 줄 단위 / 단어 단위 / 문자 단위
- 구문(언어) 선택에 따른 입력창 하이라이팅

**모양 변경**
- 추가/삭제 하이라이트 색상 커스터마이징

**처리**
- 제외: 정규식/일반 텍스트 패턴에 해당하는 줄을 비교에서 제외
- 텍스트 변환: 앞뒤 공백 제거, 대소문자 무시, 빈 줄 제거, 줄 정렬

**기타**
- 첫 변경으로 이동, 원본/수정본 파일 열기(드래그 앤 드롭 지원)
- 비교 결과 내보내기(unified diff 패치 파일), 클립보드 공유
- 비교 결과 로컬 저장 및 불러오기 ("저장된 비교 결과")
- 시스템 로캘에 따라 한국어/영어 자동 전환 (한국어 로캘이 아니면 영어)
- GitHub Releases 기반 자동 업데이트

## 기술 스택

- [Electron](https://www.electronjs.org/) — Windows/Linux 크로스플랫폼 데스크톱 셸
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — 원본/수정본 입력창(구문 하이라이팅)
- [jsdiff](https://github.com/kpdecker/jsdiff) — 비교 알고리즘 및 unified diff 패치 생성
- `electron-store` — 설정 및 저장된 비교 결과 로컬 영속화
- `electron-builder` + `electron-updater` — 패키징 및 자동 업데이트

## 개발

```bash
npm install       # 의존성 설치 (postinstall이 vendor/ 에 monaco·jsdiff 정적 자산을 복사)
npm start         # 앱 실행
npm run lint       # ESLint
```

## 빌드

```bash
npm run dist:win     # Windows (NSIS 설치 파일)
npm run dist:linux   # Linux (AppImage, deb)
npm run dist         # 둘 다
```

빌드 산출물은 `dist/`에 생성됩니다.

## 릴리스 & 자동 업데이트

`v*` 형태의 태그를 푸시하면 `.github/workflows/release.yml`이 Windows/Linux 빌드를 생성해
GitHub Releases에 게시합니다. 배포된 앱은 시작 시 최신 릴리스를 자동으로 확인/다운로드합니다.

## 참고한 오픈소스

- [trembacz/diff-checker](https://github.com/trembacz/diff-checker) — Electron 기반 크로스플랫폼 diff 도구 (레이아웃 토글, 파일 열기 등 UX 참고)
- [nuance-dev/Medio](https://github.com/nuance-dev/Medio) — macOS 네이티브 diff 도구 (실시간 비교 UX 참고)

두 프로젝트를 그대로 포팅한 것은 아니며, 기능 구성을 참고해 새로 작성했습니다.

## 라이선스

[MIT](LICENSE)
