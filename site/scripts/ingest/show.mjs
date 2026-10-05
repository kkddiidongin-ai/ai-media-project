#!/usr/bin/env node
/** 편집용: 후보 id 목록의 제목·주소·설명을 보여준다.  node scripts/ingest/show.mjs id1,id2,... */
import { loadAllCandidates } from "./lib.mjs";

const all = loadAllCandidates();
for (const id of (process.argv[2] ?? "").split(",").filter(Boolean)) {
  const c = all.get(id);
  if (!c) {
    console.log(`MISSING ${id}\n`);
    continue;
  }
  console.log(`[${id}] ${c.publishedAt.slice(0, 10)} ${c.sourceName} | ${c.title}\n  ${c.url}\n  ${c.description}\n`);
}
