import { GoalInput, GoalWorkCandidate } from "./types";

type GoalDailySuggestion = {
  goalTitle: string;
  targetDate: string;
  suggestedMinutesToday: number;
  reason: string;
};

const goalRules = [
  {
    pattern: /(曲|楽曲|作曲|音楽|アルバム|ボカロ|歌)/,
    tasks: ["参考曲分析", "作曲", "編曲", "録音", "ミックス", "マスター"]
  },
  {
    pattern: /(英検|英語|toeic|toefl|ielts|語学)/i,
    tasks: ["単語学習", "文法", "長文読解", "リスニング", "過去問"]
  },
  {
    pattern: /(プログラミング|開発|アプリ|web|コード|typescript|next)/i,
    tasks: ["設計整理", "小さな実装", "リファクタリング", "テスト追加", "技術調査"]
  },
  {
    pattern: /(資格|試験|合格|検定)/,
    tasks: ["要点整理", "問題演習", "復習", "弱点確認", "過去問"]
  }
];

export function buildGoalDailySuggestions(goals: GoalInput[], date: string): GoalDailySuggestion[] {
  return goals.map((goal) => {
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(`${goal.targetDate}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86400000) + 1
    );
    return {
      goalTitle: goal.title,
      targetDate: goal.targetDate,
      suggestedMinutesToday: Math.max(15, Math.ceil(goal.totalWorkMinutes / daysLeft)),
      reason: `目標達成日まで残り${daysLeft}日として均等割りしました。`
    };
  });
}

export function buildGoalWorkCandidates(goals: GoalInput[], dailySuggestions: GoalDailySuggestion[]): GoalWorkCandidate[] {
  return goals.flatMap((goal) => {
    const suggestion = dailySuggestions.find((item) => item.goalTitle === goal.title);
    const taskTitles = selectRuleTasks(`${goal.title} ${goal.notes}`);
    const durationMinutes = clampSuggestionMinutes(suggestion?.suggestedMinutesToday ?? 45);

    return taskTitles.map((taskTitle) => ({
      goalTitle: goal.title,
      taskTitle,
      durationMinutes,
      reason: suggestion?.reason ?? "長期目標から作った作業候補"
    }));
  });
}

function selectRuleTasks(value: string) {
  return goalRules.find((rule) => rule.pattern.test(value))?.tasks ?? ["情報整理", "小さな実作業", "調査", "アウトライン作成", "振り返り"];
}

function clampSuggestionMinutes(value: number) {
  if (!Number.isFinite(value)) return 45;
  return Math.max(30, Math.min(60, Math.round(value)));
}
