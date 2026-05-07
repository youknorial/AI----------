import { addDays, isValidTime, minutesToTime, parseFixedEvents, parseGoals, parseNaturalTasks, parseStructuredTasks, sanitizeTimeRange, timeToMinutes } from "./parsers";
import { buildGoalDailySuggestions, buildGoalWorkCandidates } from "./goal-work";
import { FixedEvent, GeneratedSchedule, GoalWorkCandidate, ScheduleItem, StoredTask, TaskInput } from "./types";

type FallbackInput = {
  date: string;
  wakeTime: string;
  sleepTime: string;
  naturalInput: string;
  taskInput: string;
  fixedInput: string;
  goalsInput: string;
  carryoverTasks: StoredTask[];
};

type Block = {
  start: number;
  end: number;
  title: string;
  type: ScheduleItem["type"];
  reason: string;
  taskTitle: string;
  priority: number;
};

export function buildFallbackSchedule(input: FallbackInput): GeneratedSchedule {
  const fixedEvents = parseFixedEvents(input.fixedInput).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const explicitTasks = parseStructuredTasks(input.taskInput, input.date);
  const naturalTasks = parseNaturalTasks(input.naturalInput, input.date);
  const carryovers: TaskInput[] = input.carryoverTasks.map((task) => ({
    title: task.title,
    priority: task.priority,
    durationMinutes: task.durationMinutes,
    deadline: task.deadline,
    notes: `前日以前からの未完了: ${task.notes}`
  }));
  const tasks = [...carryovers, ...explicitTasks, ...naturalTasks].sort(compareTasks);
  const goals = parseGoals(input.goalsInput, input.date);
  const goalDailySuggestions = buildGoalDailySuggestions(goals, input.date);
  const goalWorkCandidates = buildGoalWorkCandidates(goals, goalDailySuggestions);

  const timetable = buildTimetable({
    wakeTime: input.wakeTime,
    sleepTime: input.sleepTime,
    fixedEvents,
    tasks,
    goalCandidates: goalWorkCandidates
  });

  return {
    summary: "OPENAI_API_KEYが未設定のため、ローカルの簡易ロジックで時間割を作成しました。",
    tasks,
    fixedEvents,
    goalDailySuggestions,
    goalWorkCandidates,
    timetable,
    carryoverStrategy: `未完了タスクは${addDays(input.date, 1)}以降の候補として再配置します。`
  };
}

function compareTasks(a: TaskInput, b: TaskInput) {
  const priorityScore = { high: 0, medium: 1, low: 2 };
  return priorityScore[a.priority] - priorityScore[b.priority] || a.deadline.localeCompare(b.deadline);
}

export function buildTimetable(input: {
  wakeTime: string;
  sleepTime: string;
  fixedEvents: FixedEvent[];
  tasks: TaskInput[];
  goalCandidates?: GoalWorkCandidate[];
}) {
  const items: ScheduleItem[] = [];
  const { start: startOfDay, end: endOfDay } = sanitizeTimeRange(input.wakeTime, input.sleepTime);
  const blocks = buildBlocks(input.fixedEvents, startOfDay, endOfDay);
  let cursor = startOfDay;
  const tasks = input.tasks
    .filter((task) => task.title.trim() && task.durationMinutes > 0)
    .map((task) => ({ ...task }));
  const suggestionState = {
    candidates: [...(input.goalCandidates ?? [])],
    used: 0,
    max: 3
  };

  for (const block of blocks) {
    cursor = fillTaskGap(items, cursor, block.start, tasks, suggestionState, false);

    items.push({
      startTime: minutesToTime(block.start),
      endTime: minutesToTime(block.end),
      title: block.title,
      type: block.type,
      taskTitle: block.taskTitle,
      reason: block.reason
    });
    cursor = Math.max(cursor, block.end);
  }

  cursor = fillTaskGap(items, cursor, endOfDay, tasks, suggestionState, true);

  if (cursor < endOfDay) {
    pushFreeTime(items, cursor, endOfDay);
  }

  return items;
}

function buildBlocks(fixedEvents: FixedEvent[], startOfDay: number, endOfDay: number) {
  const blocks: Block[] = [];

  for (const event of fixedEvents) {
    if (!isValidTime(event.startTime) || !isValidTime(event.endTime)) continue;

    const start = Math.max(startOfDay, timeToMinutes(event.startTime));
    const end = Math.min(endOfDay, timeToMinutes(event.endTime));
    if (end <= start) continue;

    blocks.push({
      start,
      end,
      title: event.title,
      type: "fixed",
      taskTitle: "",
      reason: "固定予定",
      priority: 1
    });
  }

  const bedtimeStart = Math.max(startOfDay, endOfDay - 60);
  addLifestyleBlock(blocks, {
    start: startOfDay,
    end: Math.min(startOfDay + 30, endOfDay),
    title: "準備時間",
    type: "buffer",
    reason: "起床後30分の身支度",
    priority: 2
  });
  addLifestyleBlock(blocks, {
    start: Math.max(startOfDay, 12 * 60),
    end: Math.min(endOfDay, 13 * 60),
    title: "昼休憩",
    type: "break",
    reason: "12:00-13:00の生活時間",
    priority: 3
  });
  addLifestyleBlock(blocks, {
    start: bedtimeStart,
    end: endOfDay,
    title: "自由時間・風呂",
    type: "buffer",
    reason: "就寝1時間前は作業を入れない",
    priority: 4
  });

  return blocks.sort((a, b) => a.start - b.start || a.priority - b.priority);
}

function addLifestyleBlock(blocks: Block[], block: Omit<Block, "taskTitle">) {
  if (block.end - block.start < 15) return;

  let cursor = block.start;
  const sorted = blocks
    .filter((existing) => overlaps(existing.start, existing.end, block.start, block.end))
    .sort((a, b) => a.start - b.start);

  for (const existing of sorted) {
    if (cursor + 15 <= existing.start) {
      blocks.push({ ...block, start: cursor, end: existing.start, taskTitle: "" });
    }
    cursor = Math.max(cursor, existing.end);
  }

  if (cursor + 15 <= block.end) {
    blocks.push({ ...block, start: cursor, taskTitle: "" });
  }
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

function fillTaskGap(
  items: ScheduleItem[],
  start: number,
  end: number,
  tasks: TaskInput[],
  suggestionState: { candidates: GoalWorkCandidate[]; used: number; max: number },
  allowPartial: boolean
) {
  let cursor = start;

  while (tasks.length > 0 && cursor + 15 <= end) {
    const task = tasks[0];
    const available = end - cursor;

    if (task.durationMinutes > available && !allowPartial) {
      break;
    }

    tasks.shift();
    const duration = Math.min(task.durationMinutes, available);
    if (duration < 15) break;
    cursor = pushTask(items, cursor, task, duration, duration < task.durationMinutes);

    if (duration >= 90 && cursor + 10 <= end) {
      const breakMinutes = cursor + 15 <= end ? 15 : 10;
      items.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + breakMinutes),
        title: "休憩",
        type: "break",
        taskTitle: "",
        reason: "90分以上の作業後の休憩"
      });
      cursor += breakMinutes;
    }

    if (tasks.length > 0 && duration < 90 && cursor + 15 <= end) {
      items.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + 15),
        title: "休憩",
        type: "break",
        taskTitle: "",
        reason: "次の作業前に集中力を戻すため"
      });
      cursor += 15;
    }
  }

  if (cursor < end && tasks.length === 0) {
    cursor = fillGoalSuggestionGap(items, cursor, end, suggestionState);
    if (cursor < end) {
      pushFreeTime(items, cursor, end);
      return end;
    }
  }

  if (cursor < end) {
    pushFreeTime(items, cursor, end);
    return end;
  }

  return cursor;
}

function fillGoalSuggestionGap(
  items: ScheduleItem[],
  start: number,
  end: number,
  suggestionState: { candidates: GoalWorkCandidate[]; used: number; max: number }
) {
  let cursor = start;

  while (suggestionState.used < suggestionState.max && suggestionState.candidates.length > 0 && cursor + 30 <= end) {
    const candidate = suggestionState.candidates.shift()!;
    const duration = Math.min(candidate.durationMinutes, 60, end - cursor);
    if (duration < 30) break;

    items.push({
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(cursor + duration),
      title: `提案: ${candidate.goalTitle} - ${candidate.taskTitle}`,
      type: "suggestion",
      taskTitle: candidate.taskTitle,
      reason: candidate.reason
    });
    cursor += duration;
    suggestionState.used += 1;

    if (suggestionState.used < suggestionState.max && suggestionState.candidates.length > 0 && cursor + 15 <= end) {
      items.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(cursor + 15),
        title: "休憩",
        type: "break",
        taskTitle: "",
        reason: "提案作業を詰め込みすぎないため"
      });
      cursor += 15;
    }
  }

  return cursor;
}

function pushFreeTime(items: ScheduleItem[], start: number, end: number) {
  if (end <= start) return;

  items.push({
    startTime: minutesToTime(start),
    endTime: minutesToTime(end),
    title: end - start >= 30 ? "空き時間" : "余白",
    type: "buffer",
    taskTitle: "",
    reason: end - start >= 30 ? "30分以上の未配置時間" : "短い調整時間"
  });
}

function pushTask(items: ScheduleItem[], cursor: number, task: TaskInput, duration: number, partial: boolean) {
  const type = task.title.startsWith("目標:") ? "goal" : "task";
  items.push({
    startTime: minutesToTime(cursor),
    endTime: minutesToTime(cursor + duration),
    title: partial ? `${task.title}（途中まで）` : task.title,
    type,
    taskTitle: task.title,
    reason: `${task.priority}優先度、締切 ${task.deadline}`
  });
  return cursor + duration;
}
