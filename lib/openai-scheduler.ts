import OpenAI from "openai";
import { buildFallbackSchedule } from "./fallback-scheduler";
import { GeneratedSchedule, StoredTask } from "./types";

type SchedulerInput = {
  date: string;
  wakeTime: string;
  sleepTime: string;
  naturalInput: string;
  taskInput: string;
  fixedInput: string;
  goalsInput: string;
  carryoverTasks: StoredTask[];
};

export async function generateSchedule(input: SchedulerInput): Promise<GeneratedSchedule> {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackSchedule(input);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-5";

  try {
    const response = await client.responses.create({
      model,
      instructions: [
        "あなたは個人のAI秘書です。",
        "タスク、締切、長期目標、固定予定から、現実的な1日の時間割をJSONで作ります。",
        "詰め込みすぎを避け、50-90分の作業ごとに休憩または余白を入れてください。",
        "固定予定は必ず指定時間を守ってください。",
        "自然文タスクに「2時間」「1時間」「30分」のような所要時間があれば、その分数を使ってください。所要時間がないタスクは45分として扱ってください。",
        "起床後30分は準備時間、12:00-13:00の間は昼休憩、就寝1時間前は自由時間または風呂時間として作業を入れないでください。",
        "90分以上の作業後は10-15分の休憩を入れてください。",
        "30分以上の未配置時間は空き時間として扱い、長期目標があれば最大2-3枠まで「提案: 目標 - 作業」の形式で候補を入れてください。",
        "長期目標は達成日から逆算し、今日の作業量を提案してください。",
        "未完了タスクは優先度と締切を見て今日または翌日以降に回す方針を説明してください。"
      ].join("\n"),
      input: buildPrompt(input),
      text: {
        format: {
          type: "json_schema",
          name: "daily_schedule",
          strict: true,
          schema: scheduleSchema
        }
      }
    });

    const outputText = response.output_text;
    if (!outputText) {
      return buildFallbackSchedule(input);
    }

    const parsed = JSON.parse(outputText) as GeneratedSchedule;
    if (!Array.isArray(parsed.timetable) || parsed.timetable.length === 0) {
      return buildFallbackSchedule(input);
    }

    return parsed;
  } catch (error) {
    console.error("OpenAI schedule generation failed", error);
    return buildFallbackSchedule(input);
  }
}

function buildPrompt(input: SchedulerInput) {
  return JSON.stringify(
    {
      date: input.date,
      wakeTime: input.wakeTime,
      sleepTime: input.sleepTime,
      naturalTodayInput: input.naturalInput,
      structuredTasksFormat: "1行ごとに「タイトル, priority(high|medium|low), 所要分, 締切YYYY-MM-DD, メモ」",
      structuredTasks: input.taskInput,
      fixedEventsFormat: "1行ごとに「HH:MM-HH:MM 予定名」",
      fixedEvents: input.fixedInput,
      goalsFormat: "1行ごとに「目標名, 達成日YYYY-MM-DD, 総作業分, メモ」",
      goals: input.goalsInput,
      carryoverTasks: input.carryoverTasks.map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        durationMinutes: task.durationMinutes,
        deadline: task.deadline,
        notes: task.notes,
        scheduledDate: task.scheduledDate
      }))
    },
    null,
    2
  );
}

const scheduleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "tasks", "fixedEvents", "goalDailySuggestions", "timetable", "carryoverStrategy"],
  properties: {
    summary: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "priority", "durationMinutes", "deadline", "notes"],
        properties: {
          title: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          durationMinutes: { type: "integer" },
          deadline: { type: "string" },
          notes: { type: "string" }
        }
      }
    },
    fixedEvents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "startTime", "endTime"],
        properties: {
          title: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" }
        }
      }
    },
    goalDailySuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["goalTitle", "targetDate", "suggestedMinutesToday", "reason"],
        properties: {
          goalTitle: { type: "string" },
          targetDate: { type: "string" },
          suggestedMinutesToday: { type: "integer" },
          reason: { type: "string" }
        }
      }
    },
    timetable: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["startTime", "endTime", "title", "type", "taskTitle", "reason"],
        properties: {
          startTime: { type: "string" },
          endTime: { type: "string" },
          title: { type: "string" },
          type: { type: "string", enum: ["task", "fixed", "break", "goal", "buffer", "suggestion"] },
          taskTitle: { type: "string" },
          reason: { type: "string" }
        }
      }
    },
    carryoverStrategy: { type: "string" }
  }
} as const;
