import { FixedEvent, GoalInput, Priority, TaskInput } from "./types";

const priorityMap: Record<string, Priority> = {
  high: "high",
  高: "high",
  最高: "high",
  medium: "medium",
  中: "medium",
  普通: "medium",
  low: "low",
  低: "low"
};

export function normalizeDate(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : fallback;
}

export function addDays(date: string, days: number) {
  const current = new Date(`${date}T00:00:00`);
  current.setDate(current.getDate() + days);
  return current.toISOString().slice(0, 10);
}

export function minutesBetween(startTime: string, endTime: string) {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
}

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function parseFixedEvents(input: string): FixedEvent[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/(\d{1,2}:\d{2})\s*[-~〜]\s*(\d{1,2}:\d{2})\s*(.+)/);
      if (!match) return null;
      return {
        startTime: normalizeTime(match[1]),
        endTime: normalizeTime(match[2]),
        title: match[3].trim()
      };
    })
    .filter((event): event is FixedEvent => Boolean(event));
}

export function parseStructuredTasks(input: string, date: string): TaskInput[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t|｜]/).map((part) => part.trim());
      const title = parts[0];
      if (!title) return null;
      const priority = priorityMap[parts[1] ?? ""] ?? "medium";
      const durationMinutes = clampNumber(Number(parts[2]), 15, 480, 60);
      const deadline = normalizeDate(parts[3] ?? "", date);
      const notes = parts.slice(4).join(" ");
      return { title, priority, durationMinutes, deadline, notes };
    })
    .filter((task): task is TaskInput => Boolean(task));
}

export function parseGoals(input: string, date: string): GoalInput[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t|｜]/).map((part) => part.trim());
      const title = parts[0];
      if (!title) return null;
      return {
        title,
        targetDate: normalizeDate(parts[1] ?? "", date),
        totalWorkMinutes: clampNumber(Number(parts[2]), 30, 100000, 600),
        notes: parts.slice(3).join(" ")
      };
    })
    .filter((goal): goal is GoalInput => Boolean(goal));
}

export function parseNaturalTasks(input: string, date: string): TaskInput[] {
  return input
    .split(/\r?\n|。|、/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((rawTitle) => {
      const durationMinutes = extractDurationMinutes(rawTitle);
      const normalizedTitle = normalizeDigits(rawTitle);
      const title = normalizedTitle
        .replace(/\(?\d+(\.\d+)?\s*(時間|h|hour|hours)\s*(\d+\s*(分|m|min|minutes))?\)?/gi, "")
        .replace(/\(?\d+\s*(分|m|min|minutes)\)?/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        title: title || rawTitle,
        priority: "medium",
        durationMinutes,
        deadline: date,
        notes: "自然文入力から作成"
      };
    });
}

function extractDurationMinutes(value: string) {
  const normalized = normalizeDigits(value);
  const hourMinuteMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(時間|h|hour|hours)\s*(?:(\d+)\s*(分|m|min|minutes))?/i);
  if (hourMinuteMatch) {
    const hours = Number(hourMinuteMatch[1]) * 60;
    const minutes = Number(hourMinuteMatch[3] ?? 0);
    return clampNumber(hours + minutes, 15, 480, 45);
  }

  const minuteMatch = normalized.match(/(\d+)\s*(分|m|min|minutes)/i);
  if (minuteMatch) return clampNumber(Number(minuteMatch[1]), 15, 480, 45);

  return 45;
}

function normalizeDigits(value: string) {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

export function sanitizeTimeRange(wakeTime: string, sleepTime: string) {
  let start = timeToMinutes(wakeTime);
  let end = timeToMinutes(sleepTime);

  if (start < 0 || start >= 24 * 60) start = 7 * 60;
  if (end <= start || end > 24 * 60) end = 23 * 60;
  if (end <= start) {
    start = 7 * 60;
    end = 23 * 60;
  }

  return { start, end };
}

export function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeTime(time: string) {
  const [hours, minutes] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes}`;
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
