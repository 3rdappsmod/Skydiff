# SkyDiff

하늘색 테마의 크로스플랫폼(Windows · Linux) 텍스트 비교(diff) 프로그램입니다.
[diffchecker.com](https://www.diffchecker.com/)의 UI/메뉴 구성을 참고해 만들었습니다.

![platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2563eb)
![license](https://img.shields.io/badge/license-MIT-0ea5e9)

## 주요 기능

**표시**
- 레이아웃: 나란히 보기 / 합쳐 보기
- 실시간 편집(비교하기를 한 번 누른 뒤 입력할 때 결과 갱신)
- 줄 앞뒤 공백 무시, 변경 없는 행 숨기기, 줄바꿈 비활성화
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

Node.js **24 LTS**를 사용합니다 (`.nvmrc` 제공). Electron 44의 설치 도구는 Node 22.12 이상이 필요하며,
이 프로젝트의 개발·CI 환경은 Node 24로 통일합니다. 시스템 Node 18에서는 의존성을 설치하지 마세요.


```bash
npm install       # 의존성 설치 (postinstall이 vendor/ 에 monaco·jsdiff 정적 자산을 복사)
npm start         # 앱 실행
npm run lint       # ESLint
npm test           # 비교·저장·UI 상태 및 Electron API 회귀 테스트
npm run test:electron # 실제 Electron·Monaco·IPC 실행 검사 (Linux에서는 그래픽 세션 필요)
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
GitHub Releases의 **초안**으로 업로드합니다. 양쪽 OS의 빌드 성공과 설치·실행을 확인한 뒤
초안을 공개해야 배포된 앱에서 업데이트를 확인할 수 있습니다. 배포된 앱은 시작 시 최신 공개 릴리스를 확인/다운로드합니다.
태그 버전은 `package.json`의 버전과 맞춰야 하며, GitHub 원격 저장소를 연결해야 합니다.

Dependabot은 매주 의존성 업데이트를 제안합니다. 자동 병합을 사용하려면 GitHub 저장소의
auto-merge를 켜고, 기본 브랜치(`main` 또는 `master`) 보호 규칙에서 lint(회귀 테스트 포함)와 Windows/Linux 빌드를
필수 상태 검사로 지정하세요. patch/minor만 자동 병합하며 major는 직접 검토합니다.
CI는 Windows/Linux에서 실제 Electron 실행 검사와 설치 파일 빌드를 수행합니다.
Linux CI는 Xvfb 안에서 테스트 프로세스에만 `--no-sandbox`를 사용합니다. 일반 앱 실행 옵션은 바꾸지 않습니다.
설치 마법사 자체와 설치 후 실행은 별도의 실제 환경 검증 대상입니다.

## 비교 및 내보내기 동작

- 공백만 있는 입력도 비교·저장할 수 있습니다. 줄 앞뒤 공백 무시는 문장 내부 공백을 무시하지 않습니다.
- 내보내기와 공유는 현재 입력을 다시 비교하고, 제외·변환·공백 무시 옵션이 적용된 비교 패치를 만듭니다.
  변환된 텍스트 기준의 패치이므로 원본 파일에 그대로 적용하는 용도로는 처리 옵션을 끄세요.
- 파일 열기는 UTF-8을 사용합니다. CP949 등의 파일은 먼저 UTF-8로 변환해야 합니다.

## 배포 전 남은 검증

- Electron **44.4.3**, electron-builder **26.15.3**으로 업그레이드했습니다.
  [Electron 44 변경사항](https://www.electronjs.org/docs/latest/breaking-changes#breaking-api-changes-440)에 따라
  비동기 클립보드 쓰기를 기다리고, 제거된 `File.path` 대체 코드를 정리했습니다.
- 기본 빌드는 Windows/Linux x64입니다. Electron 44는 32비트 Windows/Linux ARM 바이너리를 제공하지 않습니다.
- Linux에서 회귀/API 테스트 12개, Electron 개발 실행 및 배포용 `app.asar` 실행 검사,
  AppImage/deb 생성을 확인했습니다. 설치 마법사·시스템 설치는 수행하지 않았습니다.
- Windows 앱 패키징은 확인했지만, 이 Linux 환경에는 Wine이 없어 NSIS 생성은 완료하지 못했습니다.
  Windows CI에 실제 Electron 실행 검사와 NSIS 빌드를 추가했으며, Windows 실행 결과는 아직 확인하지 않았습니다.
- SkyDiff 자체 자동 업데이트 검증은 이번 Electron 업그레이드 범위에서 제외했습니다.
- 대용량 텍스트 비교는 UI 스레드에서 동기 실행되므로 Worker 및 렌더링 성능 개선이 필요합니다.

## 참고한 오픈소스

- [trembacz/diff-checker](https://github.com/trembacz/diff-checker) — Electron 기반 크로스플랫폼 diff 도구 (레이아웃 토글, 파일 열기 등 UX 참고)
- [nuance-dev/Medio](https://github.com/nuance-dev/Medio) — macOS 네이티브 diff 도구 (실시간 비교 UX 참고)

두 프로젝트를 그대로 포팅한 것은 아니며, 기능 구성을 참고해 새로 작성했습니다.

## 라이선스

[MIT](LICENSE)
