# [편집 승인 대기 · v2] 메타, 에이전트용 모델 'Muse Wonder' 공개… API·Muse Code에서 먼저

> 판정 **발행 가능 (승인 대기)** · 상태 draft (발행 안 함) · 발표일(eventDate) 2026-10-12 · 발행일(publishedAt)은 발행 실행일로 자동 지정 · 직접 사용·측정 안 함

- slug `meta-muse-wonder-frontier-models` → 발행 후 https://aimajung.com/stories/meta-muse-wonder-frontier-models/
- 분류 MODEL_RELEASE · 주제 meta, ai-agent, ai-coding · 깊이 STANDARD · 우선순위 2
- 원문: [Meta Newsroom — Introducing Muse Wonder and Muse Wonder Full: Frontier Models for Agents](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/)
- 추가 출처: [Meta Research — Muse Wonder: A Frontier Model For Personal & Professional AI Agents](https://research.meta.ai/blog/muse-wonder)

## 요약

메타가 10월 12일 Muse Wonder와 Muse Wonder Full을 공개했습니다. 메타는 지금까지 만든 모델 가운데 가장 뛰어난 모델이라고 소개했으며, 개발자는 Meta Model API와 Muse Code에서 바로 쓸 수 있습니다. 일반 사용자용 Muse 앱 적용은 아직 '곧'으로만 예고됐습니다.

## 무엇이 달라졌나 (공식 원문으로 확인한 사실)

1. Muse Wonder는 Meta Model API와 Muse Code에서, Muse Wonder Full은 Muse Code 구독자에게 10월 12일부터 제공됩니다.
2. 메타의 AI 서비스 Muse에는 곧 들어갈 예정이며 구독자에게 먼저 적용된다고 밝혔습니다. 일반 사용자가 지금 바로 쓸 수 있는 단계는 아닙니다.
3. 개인·업무용 에이전트 작업을 겨냥한 모델로, 대화가 바뀌어도 필요한 맥락을 이어 가는 'Active Memory'와 어려운 작업에서 다른 방법을 시도하고 오류를 복구하며 중요한 일 전에 확인을 구하는 'Active Focus'를 핵심 기능으로 내세웠습니다.
4. 법률·금융·건강 같은 전문 분야 작업과 코딩 성능을 강조했으며, 보험 청구 처리·임대 계약 이해·앱 만들기를 예로 들었습니다.
5. 허락 없이 개인정보를 공유하지 않고 실제로 해로운 요청은 거절하도록 학습했다고 밝혔으며, 추가 안전성 평가를 담은 보고서는 곧 공개할 예정입니다.
6. 앞서 공개한 Muse Spark의 기반 위에 만들었고, 기가와트급 Prometheus 데이터센터에서 학습했다고 밝혔습니다. 메타는 14개월 전 AI 조직을 전면 개편했다고 설명했습니다.

## 왜 중요한가 (AI마중 해석)

메타는 Muse Spark 이후 이미지·개인 에이전트 등 Muse 제품군을 넓혀 왔고, 이번 모델은 사용자를 대신해 일을 처리하는 에이전트 작업을 정면으로 겨냥합니다. 다만 '주요 벤치마크에서 최고 수준'이라는 성능은 메타 발표이며, 연구 블로그의 비교 결과도 그래프로만 제시돼 수치를 확인할 수 없었습니다. API 가격과 제공 국가 역시 발표문에 없어, 다른 회사 모델과 비교하려면 메타가 곧 내겠다는 보고서를 기다려야 합니다.

## 그래서 나에게는

메타 모델을 API로 쓰려는 개발자에게는 선택지가 하나 늘었습니다. 일반 사용자용 Muse 적용은 '곧'이라고만 밝혀 시점이 정해지지 않았고, 한국 제공 여부와 가격은 발표문에서 확인되지 않습니다.

## 검증 기록

| 확인 항목 | 결과 | 내용 |
|---|---|---|
| 모델의 정확한 용도 | 확인 | 개인·업무용 에이전트 작업(personal and professional agentic tasks), 전문 분야(법률·금융·건강)와 코딩 |
| 공개 범위 | 확인 | Muse Wonder: Meta Model API·Muse Code / Muse Wonder Full: Muse Code 구독자 |
| 일반 사용자 이용 가능 여부 | 확인 — 아직 아님 | Muse 앱에는 'soon', 구독자에게 먼저 — 날짜 없음 |
| 벤치마크 및 가격 근거 | 수치·가격 없음 | 뉴스룸·연구 블로그 본문에 벤치마크 수치(그래프 이미지만)와 API 가격 없음 → 원고에 수치·가격을 쓰지 않음 |
| 실제 발표일 | 확인 | 뉴스룸 메타 발행 시각 2026-10-12T17:08Z, 페이지 표기 'October 12, 2026'(수정일 October 13 함께 표기), 연구 블로그 2026-10-12 → eventDate 2026-10-12 |

## 근거 (원문 인용)

- 사실 1: "Muse Wonder is available today for developers and builders through the Meta Model API and Muse Code while Muse Wonder Full is available today for Muse Code subscribers. (October 12, 2026)" — https://about.fb.com/news/2026/10/introducing-muse-wonder-models/
- 사실 2: "Muse Wonder will soon power experiences in Muse , and will roll out first to subscribers." — https://about.fb.com/news/2026/10/introducing-muse-wonder-models/
- 사실 3: "state-of-the-art performance on personal and professional agentic tasks … Active Memory : carrying important context about you across conversations … Active Focus … trying alternative approaches, working through blockers … checks in before taking important actions." — https://research.meta.ai/blog/muse-wonder
- 사실 4: "expert domains including law, finance, and health, along with frontier coding performance … navigating an insurance claim to making sense of a lease to building a working app" — https://about.fb.com/news/2026/10/introducing-muse-wonder-models/
- 사실 5: "trained the Muse Wonder family to avoid sharing private information without permission; turn down requests to assist in performing actually harmful acts … A full report with additional safety evaluations will be available soon." — https://about.fb.com/news/2026/10/introducing-muse-wonder-models/
- 사실 6: "Fourteen months ago, we began a ground-up overhaul of our artificial intelligence efforts … Today's release builds on that work … Trained at our gigawatt-scale Prometheus data center" — https://research.meta.ai/blog/muse-wonder
- 사실 why: "The Muse Wonder series achieves state-of-the-art results across key benchmarks … The full results below compare Muse Wonder and Muse Wonder Full with other frontier models (결과는 그래프 이미지로만 제시)" — https://research.meta.ai/blog/muse-wonder

## 확인되지 않은 부분

- 벤치마크 수치 — 연구 블로그에 그래프로만 있고 본문 수치 없음
- Meta Model API 가격, 제공 국가, 한국 제공 여부
- Muse Wonder와 Full의 차이(크기·용도) — 'Full은 Muse Code 구독자용'이라는 것 외 설명 없음, 원고에 쓰지 않음
