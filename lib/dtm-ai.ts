import OpenAI from "openai";
import { calculateCompletionRate, findNextStep, latestLog } from "./dtm";
import { DtmSuggestion, StoredSong, StoredSongProgressLog, StoredSongStep } from "./types";

type SuggestionInput = {
  song: StoredSong;
  steps: StoredSongStep[];
  logs: StoredSongProgressLog[];
};

export async function generateDtmSuggestion(input: SuggestionInput): Promise<DtmSuggestion> {
  if (!process.env.OPENAI_API_KEY) {
    return buildLocalSuggestion(input);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      instructions: [
        "あなたはDTMer向けの制作継続支援AIです。",
        "自動作曲、MIDI生成、DAW連携、専門的なミックス解析はしません。",
        "ユーザーが曲を諦めず、小さい完成体験を得られるように、次の一歩だけを具体的に提案してください。",
        "必ずJSONで返してください。"
      ].join("\n"),
      input: JSON.stringify({
        song: input.song,
        completionRate: calculateCompletionRate(input.steps),
        steps: input.steps,
        recentLogs: input.logs.slice(0, 5)
      }),
      text: {
        format: {
          type: "json_schema",
          name: "dtm_suggestion",
          strict: true,
          schema: suggestionSchema
        }
      }
    });

    const parsed = JSON.parse(response.output_text || "{}") as Omit<DtmSuggestion, "source">;
    if (!parsed.nextTask || !parsed.microGoal || !parsed.advice || !parsed.nextSessionCandidate) {
      return buildLocalSuggestion(input);
    }

    return { ...parsed, source: "openai" };
  } catch (error) {
    console.error("DTM suggestion generation failed", error);
    return buildLocalSuggestion(input);
  }
}

export function buildLocalSuggestion(input: SuggestionInput): DtmSuggestion {
  const nextStep = findNextStep(input.steps);
  const log = latestLog(input.logs);
  const stepName = nextStep?.name ?? "サビ";
  const blocked = log?.blocked.trim();

  if (blocked) {
    return {
      nextTask: `${stepName}の詰まりを1つだけ切り分けましょう`,
      microGoal: "まず8小節だけ、完成判定できる形にしましょう",
      advice: `前回の詰まり: ${blocked}。今日は修正範囲を広げず、原因を1つに絞るのがよさそうです。`,
      nextSessionCandidate: `${stepName}を30分だけ触って、次に残すメモを書きましょう`,
      source: "local"
    };
  }

  if (["ミックス", "マスター"].includes(stepName)) {
    return {
      nextTask: "ミックスより先に曲の構成が最後まで並んでいるか確認しましょう",
      microGoal: "まず通しで聴けるラフ完成を作りましょう",
      advice: "細部の音作りに入る前に、曲全体の流れを固定すると完成率が上がります。",
      nextSessionCandidate: "全体を1回書き出して、気になる箇所を3つだけメモしましょう",
      source: "local"
    };
  }

  return {
    nextTask: `今日は${stepName}だけ進めましょう`,
    microGoal: `${stepName}を8小節だけ完成させましょう`,
    advice: "完成の基準を小さくすると、途中で止まりにくくなります。今日は広げすぎず、1ブロックだけ形にしましょう。",
    nextSessionCandidate: `${stepName}を30〜45分作業して、最後に次の一手をメモしましょう`,
    source: "local"
  };
}

const suggestionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nextTask", "microGoal", "advice", "nextSessionCandidate"],
  properties: {
    nextTask: { type: "string" },
    microGoal: { type: "string" },
    advice: { type: "string" },
    nextSessionCandidate: { type: "string" }
  }
} as const;
