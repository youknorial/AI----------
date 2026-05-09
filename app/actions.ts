"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSong,
  getCarryoverTasks,
  replacePendingTasksForDate,
  saveGoalProgressLog,
  savePlan,
  saveProgress,
  saveSongProgressLog,
  updateSongStep,
  updateSongSteps
} from "@/lib/db";
import { todayInJapan } from "@/lib/dates";
import { normalizeDate } from "@/lib/parsers";
import { generateSchedule } from "@/lib/openai-scheduler";
import { ProductionStepStatus, SongStatus } from "@/lib/types";

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

export async function createSongAction(formData: FormData) {
  const today = todayInJapan();
  const title = read(formData, "title");
  if (!title) {
    revalidatePath("/");
    redirect("/");
  }

  const songId = createSong({
    title,
    genre: read(formData, "genre"),
    targetDate: normalizeDate(read(formData, "targetDate"), today),
    memo: read(formData, "memo"),
    currentStatus: asSongStatus(read(formData, "currentStatus"))
  });

  revalidatePath("/");
  redirect(`/?song=${songId}`);
}

export async function updateSongStepAction(formData: FormData) {
  const songId = Number(read(formData, "songId"));
  const stepId = Number(read(formData, "stepId"));

  if (Number.isInteger(songId) && Number.isInteger(stepId)) {
    updateSongStep({
      songId,
      stepId,
      status: asStepStatus(read(formData, "status"))
    });
  }

  revalidatePath("/");
  redirect(songId ? `/?song=${songId}` : "/");
}

export async function updateSongStepsAction(formData: FormData) {
  const songId = Number(read(formData, "songId"));
  const steps = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("stepStatus:"))
    .map(([key, value]) => ({
      stepId: Number(key.replace("stepStatus:", "")),
      status: asStepStatus(typeof value === "string" ? value : "")
    }))
    .filter((step) => Number.isInteger(step.stepId));

  if (Number.isInteger(songId) && steps.length > 0) {
    updateSongSteps({ songId, steps });
  }

  revalidatePath("/");
  redirect(songId ? `/?song=${songId}` : "/");
}

export async function saveSongProgressAction(formData: FormData) {
  const today = todayInJapan();
  const songId = Number(read(formData, "songId"));
  const date = normalizeDate(read(formData, "date"), today);

  if (Number.isInteger(songId)) {
    saveSongProgressLog({
      songId,
      date,
      workMinutes: clamp(Number(read(formData, "workMinutes")), 0, 1440, 30),
      did: read(formData, "did"),
      blocked: read(formData, "blocked"),
      nextAction: read(formData, "nextAction"),
      rating: clamp(Number(read(formData, "rating")), 1, 5, 3)
    });
  }

  revalidatePath("/");
  redirect(songId ? `/?song=${songId}` : "/");
}

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function asSongStatus(value: string): SongStatus {
  const allowed: SongStatus[] = ["idea", "writing", "arranging", "mixing", "mastering", "posted", "paused"];
  return allowed.includes(value as SongStatus) ? (value as SongStatus) : "idea";
}

function asStepStatus(value: string): ProductionStepStatus {
  const allowed: ProductionStepStatus[] = ["not_started", "in_progress", "done"];
  return allowed.includes(value as ProductionStepStatus) ? (value as ProductionStepStatus) : "not_started";
}
