/**
 * Jev 決策層煙霧測試（賽博月老）
 *   npx tsx scripts/jev-smoke.ts            # 用 .env 的 JEV_API_KEY
 *   npx tsx scripts/jev-smoke.ts --bad-key  # 驗證 fallback
 *   npx tsx scripts/jev-smoke.ts --report   # 完整配對報告（hybrid → Jev 評分）
 */
async function main() {
  process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || "hybrid";
  if (process.argv.includes("--bad-key")) {
    process.env.JEV_API_KEY = "apikey_invalid_for_fallback";
    process.env.DECISION_PROVIDER = "auto";
  }

  const { decide, decisionChain } = await import("../src/lib/llm/decide");
  const questions = [
    {
      id: "interests_overlap",
      type: "choice" as const,
      instructions: "Do they share at least one interest?",
      criteria: { yes: "Shared interest exists", no: "Nothing shared" },
    },
    {
      id: "value_fit",
      type: "score" as const,
      instructions: "How aligned are their values for a long-term relationship?",
      criteria: ["None", "Weak", "Average", "Good", "Exceptional"],
    },
  ];
  const state = {
    me: { interests: ["插畫", "貓", "手沖咖啡", "露營"] },
    them: { interests: ["插畫", "貓", "二手書店", "看海"] },
  };

  const t0 = Date.now();
  const res = await decide({
    state,
    questions,
    fallback: (q) =>
      q.type === "choice"
        ? { id: q.id, type: "choice", value: "yes", confidence: 1, probabilities: {} }
        : { id: q.id, type: "score", value: 3, confidence: 1, probabilities: {} },
  });
  console.log(
    `chain=[${decisionChain().join(">")}] source=${res.source} model=${res.model ?? "-"} note=${res.note ?? "-"} ms=${Date.now() - t0} inputTokens=${res.inputTokens ?? "-"}`,
  );
  console.log(JSON.stringify(res.answers, null, 2));

  if (process.argv.includes("--report")) {
    const { llm } = await import("../src/lib/llm");
    const personas = await import("../src/lib/personas");
    const me = personas.DEMO_HUMAN.profile;
    const them = personas.PERSONAS[0].profile; // 小柚
    const t1 = Date.now();
    const report = await llm.matchReport(me, them, "", "smoke-pair");
    console.log("── report ──");
    console.log(`score=${report.score} verdict=${report.verdict} ms=${Date.now() - t1}`);
    console.log("summary:", report.summaryForUser.slice(0, 80));
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
