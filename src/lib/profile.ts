import type { CompiledProfile, VisibilityMap } from "./types";

export type PublicProfile = CompiledProfile; // 隱藏欄位以「未公開」呈現

const REDACTED = "未公開";

/** 依分享權限把檔案投影成可給對方月老看的版本 */
export function publicProfile(
  compiled: CompiledProfile,
  visibility: VisibilityMap | null,
): PublicProfile {
  const v = visibility ?? {};
  const p = { ...compiled };
  const hide = (k: keyof CompiledProfile) => {
    if (v[k] === false) (p as unknown as Record<string, unknown>)[k] = REDACTED;
  };
  hide("ageRange");
  hide("city");
  hide("jobField");
  if (v.interests === false) p.interests = [];
  if (v.values === false) p.values = [];
  hide("lifestyle");
  hide("lookingFor");
  hide("commsStyle");
  if (v.dealbreakers === false) p.dealbreakers = [];
  return p;
}
