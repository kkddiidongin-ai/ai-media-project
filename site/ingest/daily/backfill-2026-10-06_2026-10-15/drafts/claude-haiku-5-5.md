# [편집 승인 대기] Anthropic 'Claude Haiku 5.5' 출시… Haiku 4.5보다 평균 약 75% 싸게

> 상태: **draft (발행 안 함)** · 발표일(eventDate) 2026-10-07 · 발행일(publishedAt) 미정 — 편집 승인 후 정함 · 직접 사용·측정 안 함

- 우선순위 3 · 분류 MODEL_RELEASE · 깊이 standard · slug `claude-haiku-5-5`
- 원문: [Anthropic — Introducing Claude Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5)
- 추가 출처: [AWS Machine Learning Blog — Introducing Claude Haiku 5.5 on AWS](https://aws.amazon.com/blogs/machine-learning/introducing-claude-haiku-5-5-on-aws/)
- 추가 출처: [GitHub Changelog — Claude Haiku 5.5 in GitHub Copilot](https://github.blog/changelog/2026-10-07-claude-haiku-5-5-in-github-copilot)

## 요약

Anthropic이 10월 7일 소형 모델 Claude Haiku 5.5를 출시했습니다. 요약·분류·서브에이전트처럼 빠르고 많이 처리해야 하는 작업용 모델로, Anthropic은 Haiku 4.5보다 평균 약 75% 적은 비용으로 돌릴 수 있다고 밝혔습니다.

## 무엇이 달라졌나 (공식 원문으로 확인한 사실)

1. 100만 토큰당 가격은 10만 토큰 이하 요청 기준 입력 0.10달러·출력 0.50달러, 10만 토큰을 넘으면 입력 0.50달러·출력 2.50달러입니다. Haiku 4.5는 입력 1달러·출력 5달러입니다.
2. Haiku급 모델 가운데 처음으로 노력(effort) 수준을 조절해 비용과 성능 중 무엇을 우선할지 정할 수 있습니다.
3. Claude Platform(모델 이름 claude-haiku-5-5)과 AWS·Google Cloud·Microsoft Azure에서 쓸 수 있으며, 같은 날 Amazon Bedrock과 GitHub Copilot(Pro·Pro+·Max·Business·Enterprise)에도 들어왔습니다.
4. 함께 Claude Sonnet 5.5의 캐시 읽기 가격을 100만 토큰당 0.20달러에서 0.10달러로 절반 내렸고, Anthropic은 이로써 대부분의 에이전트 작업 비용이 약 20% 줄어든다고 밝혔습니다.
5. 이번 주부터 Claude Max 5x 구독자는 매달 100달러, Max 20x는 200달러, Team은 최대 500달러의 Claude Platform API 크레딧을 받습니다.
6. Anthropic 발표 기준 Terminal-Bench 4.0 점수는 39.2%로 Sonnet 5.5(70.6%)보다 낮으며, Anthropic도 복잡한 에이전트 코딩에는 Sonnet 5.5·Opus 5.5가 더 낫다고 밝혔습니다.

## 왜 중요한가 (AI마중 해석)

소형 모델 가격이 크게 내려가면서, 요약·분류·문서 질의처럼 호출량이 많아 비용 때문에 미뤄 두던 작업을 다시 계산해 볼 만해졌습니다. 다만 '약 75%'는 Anthropic이 새 토크나이저로 토큰을 조금 더 쓰는 점까지 반영해 계산한 추정치이고, 10만 토큰을 넘는 요청은 Haiku 4.5보다 50%만 싸집니다. 큰 모델을 대신하기보다 큰 모델 아래에서 짧은 일을 나눠 맡는 용도라는 점도 Anthropic이 직접 밝혔습니다.

## 그래서 나에게는

Claude API·Amazon Bedrock·GitHub Copilot 사용자는 모델 목록에서 바로 고를 수 있습니다(Copilot은 순차 적용). 기존 Haiku 4.5 작업을 옮길 때는 토크나이저 변경을 고려해 Anthropic의 이전 가이드를 먼저 확인하는 것이 좋고, Max·Team 구독자는 이번 주 지급되는 API 크레딧으로 직접 시험해 볼 수 있습니다.

## 근거 (원문 인용)

- 사실 1: "Input tokens $0.10 / $0.50 $1.00 $2.00 · Output tokens $0.50 / $2.50 $5.00 $10.00 (Haiku 5.5 prompts up to / over 100k · Haiku 4.5 · Sonnet 5.5)" — https://www.anthropic.com/claude-haiku-5-5
- 사실 2: "Haiku 5.5 is our first Haiku-class model to come with an adjustable effort setting." — https://www.anthropic.com/claude-haiku-5-5
- 사실 3: "Claude Haiku 5.5 is available now on all platforms, including Amazon Web Services, Google Cloud, and Microsoft Azure. On the Claude Platform, developers can get started with claude-haiku-5-5." — https://www.anthropic.com/claude-haiku-5-5
- 사실 3: "Claude Haiku 5.5 is available to Copilot Pro, Pro+, Max, Business, and Enterprise users. … Rollout will be gradual." — https://github.blog/changelog/2026-10-07-claude-haiku-5-5-in-github-copilot
- 사실 3: "Today, we're excited to announce the availability of Claude Haiku 5.5 on Amazon Bedrock and Claude Platform on AWS." — https://aws.amazon.com/blogs/machine-learning/introducing-claude-haiku-5-5-on-aws/
- 사실 4: "Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20. … reduces the cost of Sonnet 5.5 on most agentic tasks by around 20%." — https://www.anthropic.com/claude-haiku-5-5
- 사실 5: "this week, we'll roll out a new monthly API credit to all Max and Team subscribers … Max 5x users will get $100 in credits per month, Max 20x users will get $200, and Team subscribers will receive up to $500" — https://www.anthropic.com/claude-haiku-5-5
- 사실 6: "Agentic coding Terminal-Bench 4.0 39.2% 0.0% 16.4% 70.6% … Sonnet 5.5 and Opus 5.5 remain better choices for complex agentic coding tasks" — https://www.anthropic.com/claude-haiku-5-5
- 사실 summary: "On average, it now costs around 75% less to run." — https://www.anthropic.com/claude-haiku-5-5
- 사실 why: "priced 90% lower than Claude Haiku 4.5 for requests up to 100,000 tokens, and 50% lower for requests over 100,000 tokens … Haiku 5.5 has an updated tokenizer … uses slightly more tokens per task." — https://www.anthropic.com/claude-haiku-5-5

## 확인되지 않은 부분 · 추가 검증

- Anthropic 발표 페이지에 발행일 메타가 없음 — 발표일 2026-10-07은 페이지 본문 날짜와 같은 날 AWS·GitHub 공식 글로 확인 (편집자 날짜 확인 표시)
- API 크레딧 지급 대상의 국가 제한·지급 일자는 원문에 '이번 주'로만 표기 — Help Center 문서 확인 필요
- 벤치마크는 Anthropic 자체 측정 (System Card 참조)
