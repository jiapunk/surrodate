import { prisma } from "./db";
import { publish } from "./bus";
import { LLM_MODE } from "./llm";
import type { PublicProfile } from "./profile";
import type { CompiledProfile } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const GREET_RE = /哈囉|嗨|hello|hi|你好|安安/i;

function mirror(text: string): string {
  // 取訊息中最長的片段做「有在聽」的鏡像回應
  const parts = text.replace(/[！？?!。，,.\s]+/g, " ").split(" ").filter(Boolean);
  const best = parts.sort((a, b) => b.length - a.length)[0] ?? "";
  return best.slice(0, 10);
}

function mockBotReply(
  bot: CompiledProfile,
  other: CompiledProfile,
  history: { senderId: string; content: string }[],
  botId: string,
): string {
  const humanMsgs = history.filter((m) => m.senderId !== botId);
  const last = humanMsgs[humanMsgs.length - 1]?.content ?? "";
  const shared = bot.interests.filter((i) => other.interests.includes(i));
  const topic = shared[humanMsgs.length % Math.max(1, shared.length)] ?? bot.interests[0] ?? "生活";

  if (humanMsgs.length <= 1 || GREET_RE.test(last)) {
    return `哈囉哈囉！我家月老一直跟我說你很合拍，我半信半疑點進來看——它說我們都喜歡「${topic}」？你最近有什麼新的著迷物嗎 😄`;
  }
  if (/？|\?|嗎|吧/.test(last)) {
    return `問得好！先說結論：${bot.lifestyle}。所以${topic}這種事對我來說是充電。你呢？你是什麼派？`;
  }
  if (humanMsgs.length === 2)
    return `「${mirror(last)}」——感覺我們頻率不錯。我平常${bot.lifestyle}，假日都靠${topic}回血。你週末都怎麼過？`;
  if (humanMsgs.length === 3)
    return `哈哈懂，這種事情就是要遇到對的人聊才有趣。說起來，${bot.values[0] ?? "真誠"}對我真的重要。你呢，你最在意什麼？`;
  if (humanMsgs.length % 2 === 0)
    return `「${mirror(last)}」+1，我也這樣覺得。對了你有空喜歡${topic}嗎？說不定之後可以約——我是說，如果你也想的話 😌`;
  return `真的假的，「${mirror(last)}」這個我完全懂。我這個人${bot.commsStyle}，跟你聊天不費力。`;
}

async function realBotReply(
  bot: CompiledProfile,
  other: PublicProfile,
  history: { senderId: string; content: string }[],
  botId: string,
  matchId: string,
): Promise<string> {
  const { realChatReply } = await import("./llm/real");
  return realChatReply(bot, other, history, botId, matchId);
}

/** 若對話另一端是模擬用戶，排程一則擬真回覆 */
export function scheduleBotReply(matchId: string, humanSenderId: string) {
  void (async () => {
    try {
      const delay = LLM_MODE === "mock" ? 1400 + Math.random() * 1600 : 300;
      await sleep(delay);

      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!match || match.status !== "matched") return;

      const isHumanA = match.userAId === humanSenderId;
      const botId = isHumanA ? match.userBId : match.userAId;
      const botRow = await prisma.user.findUnique({
        where: { id: botId },
        include: { profile: true },
      });
      const humanRow = await prisma.user.findUnique({
        where: { id: humanSenderId },
        include: { profile: true },
      });
      if (!botRow?.profile?.compiled || !humanRow?.profile?.compiled) return;
      if (!botRow.isBot) return;

      const bot = botRow.profile.compiled as unknown as CompiledProfile;
      const other = humanRow.profile.compiled as unknown as PublicProfile;
      const history = match.messages.map((m) => ({
        senderId: m.senderId,
        content: m.content,
      }));

      // 真人 repo 先顯示「對方正在輸入…」
      publish(`match:${matchId}`, { type: "typing", userId: botId });

      const reply =
        LLM_MODE === "real"
          ? await realBotReply(bot, other, history, botId, matchId)
          : mockBotReply(bot, other as unknown as CompiledProfile, history, botId);
      if (!reply) return;

      const msg = await prisma.message.create({
        data: { matchId, senderId: botId, content: reply },
      });
      publish(`match:${matchId}`, { type: "message", message: msg });
    } catch (e) {
      console.error("bot reply failed", e);
    }
  })();
}
