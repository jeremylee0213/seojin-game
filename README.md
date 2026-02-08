# Worm Maze Puzzle

브라우저에서 `index.html`을 열면 바로 실행됩니다.

## 새 기능

- 이동키를 누르고 있으면 연속 이동합니다.
- 맵의 `I`(젤리) 아이템을 먹으면 꼬리 길이가 1칸 증가합니다.
- 맵의 `G`(슈퍼젤리) 아이템을 먹으면 꼬리 길이가 2칸 증가합니다.
- 맵의 `T`(스타) 아이템을 먹으면 일정 턴 동안 몸통/장애물을 통과할 수 있습니다.
- 맵의 `P/Q`(포털) 타일은 반대편 포털로 즉시 이동합니다.
- HUD에서 현재 길이와 젤리 수집 진행도를 확인할 수 있습니다.
- 레벨이 월드별로 전면 재설계되어 반복도를 줄이고 단계별 난이도 상승을 제공합니다.

## 개발 검증 스크립트

- 레벨 유효성 + 클리어 가능성 검사:
  - `node scripts/validate-levels.js`
- 코어 로직 테스트:
  - `node scripts/test-core.js`
- 맵 문자열/JSON 변환 툴:
  - `node scripts/level-tools.js to-json <map.txt>`
  - `node scripts/level-tools.js from-json <map.json>`
