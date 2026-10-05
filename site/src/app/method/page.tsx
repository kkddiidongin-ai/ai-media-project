import fs from "node:fs";
import path from "node:path";
import { DarkCard, PageHead, SectionLabel, Wrap } from "@/components/ui";
import { getStories } from "@/lib/news";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "편집·출처 원칙",
  description: "AI MEDIA가 무엇을 근거로 쓰고, 어떻게 확인하고, 무엇을 하지 않는지 정리했습니다. 수집 소스 목록도 공개합니다.",
  path: "/method/",
});

interface Source {
  id: string;
  name: string;
  officialUrl: string | null;
  sourceType: "official" | "press";
  tier: number;
  fetchMode: string;
  enabled: boolean;
  note?: string;
}

const PRINCIPLES = [
  { t: "공식 원문 먼저", d: "회사의 공식 블로그·뉴스룸·문서를 1순위로 씁니다. 모든 기사에 원문 제목·링크·발표일을 적습니다." },
  { t: "사실과 해석을 나눈다", d: "'핵심 사실'에는 원문에서 확인한 내용만 씁니다. '왜 중요한가'는 AI MEDIA의 해석이라고 표시합니다." },
  { t: "원문을 옮기지 않는다", d: "기사 본문을 복사하거나 통째로 번역하지 않습니다. 사진도 가져오지 않습니다. 확인한 사실만 새로 써서 정리합니다." },
  { t: "회사 주장은 주장으로", d: "'업계 최고', '최고 성능' 같은 표현은 회사의 주장이라고 밝히고, 숫자는 어떤 조건에서 나온 것인지 함께 적습니다." },
  { t: "없는 날을 채우지 않는다", d: "사건이 없는 날에 뉴스레터를 만들지 않습니다. 날짜·통계·인용을 지어내지 않습니다." },
  { t: "기준이 다른 숫자는 비교하지 않는다", d: "AI차트는 공식 출처 숫자만 쓰고 확인일을 적습니다. 정의가 다른 숫자는 한 막대에 올리지 않습니다." },
  { t: "접근 제한을 우회하지 않는다", d: "유료 기사, 로그인이 필요한 페이지, robots.txt가 막은 사이트(특히 AI 크롤러를 막은 곳)는 수집하지 않습니다." },
  { t: "AI는 보조, 확인은 편집이", d: "자료 수집과 초안 작성에 AI를 씁니다. 자동 수집한 후보는 그대로 발행되지 않고, 원문 확인과 편집을 거친 것만 기사가 됩니다." },
];

export default function MethodPage() {
  const reg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "ingest", "registry.json"), "utf8")) as { sources: Source[] };
  const stories = getStories();
  const byVerification = stories.reduce<Record<string, number>>((m, s) => ((m[s.provenance.verification] = (m[s.provenance.verification] ?? 0) + 1), m), {});
  const enabled = reg.sources.filter((s) => s.enabled);
  const disabled = reg.sources.filter((s) => !s.enabled);

  return (
    <Wrap>
      <PageHead kicker="어떻게 확인하나" title="편집·출처 원칙">
        <p>이 사이트의 모든 기사는 아래 원칙과 과정을 거칩니다.</p>
      </PageHead>

      <section aria-labelledby="m-principles">
        <SectionLabel>
          <span id="m-principles">원칙</span>
        </SectionLabel>
        <ol className="space-y-2.5">
          {PRINCIPLES.map((p, i) => (
            <li key={p.t} className="flex gap-4 rounded-[10px] border border-night-line bg-night-raise px-5 py-4">
              <span className="font-mono text-[13px] font-bold text-night-accent">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="font-bold text-night-text">{p.t}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-night-muted">{p.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12" aria-labelledby="m-pipeline">
        <SectionLabel>
          <span id="m-pipeline">기사가 만들어지는 과정</span>
        </SectionLabel>
        <DarkCard className="px-5 py-5 text-[14px] leading-relaxed text-night-text">
          <p className="font-mono text-[13px] text-night-accent">수집 소스 목록 → 가져오기(RSS·공개 sitemap) → 정리 → 중복 제거 → 후보 → 원문 확인 → 새로 쓰기 → 발행</p>
          <p className="mt-3 text-night-muted">
            가져오기는 사이트를 만드는 과정(빌드)과 분리되어 있습니다. 빌드는 이미 확인해 저장한 기사만 읽고, 외부 사이트에 접속하지 않습니다. 기사마다 어디서 발견했는지, 언제 수집했는지, 무엇으로 확인했는지를 기록합니다.
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center font-mono">
            <div className="rounded-[8px] bg-night px-2 py-3">
              <dt className="text-[11px] text-night-muted">공식 원문 확인</dt>
              <dd className="text-[20px] font-bold text-white">{byVerification["primary-official"] ?? 0}</dd>
            </div>
            <div className="rounded-[8px] bg-night px-2 py-3">
              <dt className="text-[11px] text-night-muted">원문 + 추가 출처</dt>
              <dd className="text-[20px] font-bold text-white">{byVerification["primary+secondary"] ?? 0}</dd>
            </div>
            <div className="rounded-[8px] bg-night px-2 py-3">
              <dt className="text-[11px] text-night-muted">언론 보도만</dt>
              <dd className="text-[20px] font-bold text-white">{byVerification["press-only"] ?? 0}</dd>
            </div>
          </dl>
        </DarkCard>
      </section>

      <section id="sources" className="mt-12 scroll-mt-28" aria-labelledby="m-sources">
        <SectionLabel>
          <span id="m-sources">수집 소스 목록</span>
        </SectionLabel>
        <ul className="divide-y divide-night-line rounded-[10px] border border-night-line bg-night-raise">
          {enabled.map((s) => (
            <li key={s.id} className="px-5 py-3">
              <p className="flex flex-wrap items-baseline gap-2 text-[14px] font-bold text-night-text">
                {s.officialUrl ? (
                  <a href={s.officialUrl} className="hover:underline hover:underline-offset-4" rel="noopener noreferrer" target="_blank">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
                <span className="font-mono text-[11px] font-normal text-night-muted">
                  TIER {s.tier} · {s.sourceType === "official" ? "공식" : "보도"} · {s.fetchMode}
                </span>
              </p>
              {s.note ? <p className="mt-0.5 text-[12.5px] text-night-muted">{s.note}</p> : null}
            </li>
          ))}
        </ul>
        <h3 className="mb-2 mt-6 text-[13px] font-bold text-night-text">수집하지 않는 곳과 이유</h3>
        <ul className="divide-y divide-night-line rounded-[10px] border border-dashed border-night-line">
          {disabled.map((s) => (
            <li key={s.id} className="px-5 py-3 text-[13px]">
              <span className="font-bold text-night-text">{s.name}</span> <span className="text-night-muted">— {s.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </Wrap>
  );
}
