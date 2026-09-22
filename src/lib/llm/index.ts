import type { CompiledProfile, MatchReport } from "../types";
import type { FeedbackMemory } from "../feedback";
import type { PublicProfile } from "../profile";
import * as mock from "./mock";
import * as real from "./real";

const HAS_LLM_KEY = Boolean(process.env.LLM_API_KEY);
/** mock = 全規則；real = 全 LLM；hybrid = LLM 對話/文案 + Jev 決策層評分（失敗退規則） */
export const LLM_MODE: "mock" | "real" | "hybrid" =
  process.env.LLM_PROVIDER === "real" && HAS_LLM_KEY
    ? "real"
    : process.env.LLM_PROVIDER === "hybrid" && HAS_LLM_KEY
      ? "hybrid"
      : "mock";

export interface LLMClient {
  interviewTurn(
    transcript: { role: "agent" | "user"; content: string }[],
    sessionId?: string,
  ): Promise<{ reply: string; done: boolean }>;
  compileProfile(
    userName: string,
    answers: string[],
    sessionId?: string,
  ): Promise<CompiledProfile>;
  matchQuestions(
    self: CompiledProfile,
    other: PublicProfile,
    sessionId?: string,
  ): Promise<string[]>;
  matchAnswers(
    self: CompiledProfile,
    questions: string[],
    sessionId?: string,
  ): Promise<string[]>;
  matchReport(
    self: CompiledProfile,
    other: PublicProfile,
    qa: string,
    pairKey: string,
    sessionId?: string,
    memory?: FeedbackMemory,
  ): Promise<MatchReport>;
  icebreakers(
    self: CompiledProfile,
    other: PublicProfile,
    sharedTopics: string[],
    sessionId?: string,
  ): Promise<string[]>;
}

export const llm: LLMClient =
  LLM_MODE === "real"
    ? {
        interviewTurn: real.realInterviewTurn,
        compileProfile: real.realCompileProfile,
        matchQuestions: real.realMatchQuestions,
        matchAnswers: real.realMatchAnswers,
        matchReport: real.realMatchReport,
        icebreakers: real.realIcebreakers,
      }
    : LLM_MODE === "hybrid"
    ? {
        interviewTurn: real.realInterviewTurn,
        compileProfile: real.realCompileProfile,
        matchQuestions: real.realMatchQuestions,
        matchAnswers: real.realMatchAnswers,
        matchReport: mock.decisionMatchReport,
        icebreakers: real.realIcebreakers,
      }
    : {
        interviewTurn: mock.mockInterviewTurn,
        compileProfile: mock.mockCompileProfile,
        matchQuestions: mock.mockMatchQuestions,
        matchAnswers: mock.mockMatchAnswers,
        matchReport: mock.decisionMatchReport,
        icebreakers: mock.mockIcebreakers,
      };
