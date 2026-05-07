"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCarryoverTasks, replacePendingTasksForDate, saveGoalProgressLog, savePlan, saveProgress } from "@/lib/db";
import { todayInJapan } from "@/lib/dates";
import { normalizeDate } from "@/lib/parsers";
import { generateSchedule } from "@/lib/openai-scheduler";

export async function generateScheduleAction(formData: FormData) {
  const today = todayInJapan();
  const date = normalizeDate(read(formData, "date"), today);
  const wakeTime = read(formData, "wakeTime") || "07:00";
  const sleepTime = read(formData, "sleepTime") || "23:00";
  const naturalInput = read(formData, "naturalInput");
  const taskInput = read(formData, "taskInput");
  const fixedInput = read(formData, "fixedInput");
  const goalsInput = read(formData, "goalsInput");
  const carryoverTasks = getCarryoverTasks(date);

  const schedule = await generateSchedule({
    date,
    wakeTime,
    sleepTime,
    naturalInput,
    taskInput,
    fixedInput,
    goalsInput,
    carryoverTasks
  });

  replacePendingTasksForDate(date, schedule.tasks);
  savePlan({
    date,
    wakeTime,
    sleepTime,
    naturalInput,
    fixedInput,
    goalsInput,
    schedule
  });

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function saveProgressAction(formData: FormData) {
  const today = todayInJapan();
  const date = normalizeDate(read(formData, "date"), today);
  const notes = read(formData, "progressNotes");
  const completedTaskIds = formData
    .getAll("completedTaskIds")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  saveProgress({ date, notes, completedTaskIds });
  revalidatePath("/");
  redirect(`/?date=${date}`);
}

export async function saveGoalProgressAction(formData: FormData) {
  const today = todayInJapan();
  const date = normalizeDate(read(formData, "goalLogDate"), today);
  const goalTitle = read(formData, "goalTitle");
  const workMinutes = clamp(Number(read(formData, "workMinutes")), 0, 1440, 30);
  const rating = clamp(Number(read(formData, "rating")), 1, 5, 3);

  if (goalTitle) {
    saveGoalProgressLog({
      goalTitle,
      date,
      workMinutes,
      did: read(formData, "did"),
      progressed: read(formData, "progressed"),
      blocked: read(formData, "blocked"),
      nextAction: read(formData, "nextAction"),
      rating
    });
  }

  revalidatePath("/");
  redirect(`/?date=${date}`);
}

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
