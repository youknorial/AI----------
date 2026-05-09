import { ProductionStepStatus, SongStatus, StoredSongProgressLog, StoredSongStep } from "./types";

export const productionStepNames = ["アイデア", "コード", "メロディ", "Aメロ", "Bメロ", "サビ", "編曲", "ミックス", "マスター", "投稿"];

export const songStatusLabels: Record<SongStatus, string> = {
  idea: "アイデア",
  writing: "作曲中",
  arranging: "編曲中",
  mixing: "ミックス中",
  mastering: "マスター中",
  posted: "投稿済み",
  paused: "保留"
};

export const stepStatusLabels: Record<ProductionStepStatus, string> = {
  not_started: "未着手",
  in_progress: "作業中",
  done: "完了"
};

export function calculateCompletionRate(steps: StoredSongStep[]) {
  if (steps.length === 0) return 0;
  const doneCount = steps.filter((step) => step.status === "done").length;
  return Math.round((doneCount / steps.length) * 100);
}

export function findNextStep(steps: StoredSongStep[]) {
  return steps.find((step) => step.status === "in_progress") ?? steps.find((step) => step.status === "not_started") ?? steps[steps.length - 1];
}

export function latestLog(logs: StoredSongProgressLog[]) {
  return logs[0] ?? null;
}
