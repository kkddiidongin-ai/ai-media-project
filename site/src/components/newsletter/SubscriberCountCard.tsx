import { formatSubscriberCount, subscriberCountForDisplay } from "@/config/subscribers";

/** 홈 구독 영역 옆 '구독자 수' 카드. 표시할 수 없는 값이면(확인 전 · 운영 빌드) 아무것도 그리지 않는다 */
export function SubscriberCountCard({ className = "" }: { className?: string }) {
  const count = subscriberCountForDisplay();
  if (count === null) return null;
  return (
    <aside aria-label="구독자 수" className={`flex items-center justify-between gap-4 rounded-[12px] bg-[#1C2420] p-4 ${className}`}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-[13px] font-semibold leading-none text-[#AAB6AE]">구독자 수</p>
        <p className="text-[26px] font-extrabold leading-tight tracking-[-0.5px] text-[#F6F8F6] tabular-nums">{formatSubscriberCount(count)}명</p>
      </div>
      <UsersIcon className="size-9 shrink-0 text-[#8BC7A8]" />
    </aside>
  );
}

/** Users 아이콘 (Lucide 'users' 모양, ISC) */
function UsersIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
