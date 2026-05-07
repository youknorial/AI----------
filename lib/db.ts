import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { addDays } from "./parsers";
import { GeneratedSchedule, StoredGoalProgressLog, StoredPlan, StoredTask, TaskInput } from "./types";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app.db");

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;
  mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function getDashboard(date: string) {
  const database = getDb();
  const planRow = database
    .prepare(
      `SELECT id, date, wake_time, sleep_time, natural_input, fixed_input, goals_input, schedule_json, created_at
       FROM daily_plans
       WHERE date = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(date) as PlanRow | undefined;

  const tasks = database
    .prepare(
      `SELECT id, title, priority, duration_minutes, deadline, notes, scheduled_date, status, source, created_at
       FROM tasks
       WHERE scheduled_date = ? OR status = 'carryover'
       ORDER BY status DESC, deadline ASC, priority ASC, id ASC`
    )
    .all(date) as TaskRow[];

  const progress = database
    .prepare(
      `SELECT notes, completed_task_ids, created_at
       FROM daily_progress
       WHERE date = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(date) as { notes: string; completed_task_ids: string; created_at: string } | undefined;
  const goalProgressLogs = database
    .prepare(
      `SELECT id, goal_title, date, work_minutes, did, progressed, blocked, next_action, rating, created_at
       FROM goal_progress_logs
       ORDER BY date DESC, created_at DESC
       LIMIT 12`
    )
    .all() as GoalProgressLogRow[];

  return {
    plan: planRow ? mapPlan(planRow) : null,
    tasks: tasks.map(mapTask),
    progress: progress
      ? {
          notes: progress.notes,
          completedTaskIds: JSON.parse(progress.completed_task_ids || "[]") as number[],
          createdAt: progress.created_at
        }
      : null,
    goalProgressLogs: goalProgressLogs.map(mapGoalProgressLog)
  };
}

export function getCarryoverTasks(date: string) {
  return (
    getDb()
      .prepare(
        `SELECT id, title, priority, duration_minutes, deadline, notes, scheduled_date, status, source, created_at
         FROM tasks
         WHERE status = 'carryover' OR (status = 'pending' AND scheduled_date < ?)
         ORDER BY deadline ASC, priority ASC, id ASC`
      )
      .all(date) as TaskRow[]
  ).map(mapTask);
}

export function replacePendingTasksForDate(date: string, tasks: TaskInput[]) {
  const database = getDb();
  const insert = database.prepare(
    `INSERT INTO tasks (title, priority, duration_minutes, deadline, notes, scheduled_date, status, source)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'ai')`
  );
  const transaction = database.transaction(() => {
    database.prepare(`DELETE FROM tasks WHERE scheduled_date = ? AND status = 'pending' AND source = 'ai'`).run(date);
    database.prepare(`DELETE FROM tasks WHERE status = 'carryover'`).run();
    for (const task of tasks) {
      insert.run(task.title, task.priority, task.durationMinutes, task.deadline, task.notes, date);
    }
  });
  transaction();
}

export function savePlan(input: {
  date: string;
  wakeTime: string;
  sleepTime: string;
  naturalInput: string;
  fixedInput: string;
  goalsInput: string;
  schedule: GeneratedSchedule;
}) {
  getDb()
    .prepare(
      `INSERT INTO daily_plans (date, wake_time, sleep_time, natural_input, fixed_input, goals_input, schedule_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.date,
      input.wakeTime,
      input.sleepTime,
      input.naturalInput,
      input.fixedInput,
      input.goalsInput,
      JSON.stringify(input.schedule)
    );
}

export function saveProgress(input: { date: string; completedTaskIds: number[]; notes: string }) {
  const tomorrow = addDays(input.date, 1);
  const database = getDb();
  const markCompleted = database.prepare(`UPDATE tasks SET status = 'completed' WHERE id = ?`);
  const transaction = database.transaction(() => {
    for (const taskId of input.completedTaskIds) {
      markCompleted.run(taskId);
    }
    database
      .prepare(
        `UPDATE tasks
         SET status = 'carryover', scheduled_date = ?
         WHERE scheduled_date <= ? AND status = 'pending'`
      )
      .run(tomorrow, input.date);
    database
      .prepare(
        `INSERT INTO daily_progress (date, notes, completed_task_ids)
         VALUES (?, ?, ?)`
      )
      .run(input.date, input.notes, JSON.stringify(input.completedTaskIds));
  });
  transaction();
}

export function saveGoalProgressLog(input: {
  goalTitle: string;
  date: string;
  workMinutes: number;
  did: string;
  progressed: string;
  blocked: string;
  nextAction: string;
  rating: number;
}) {
  getDb()
    .prepare(
      `INSERT INTO goal_progress_logs (goal_title, date, work_minutes, did, progressed, blocked, next_action, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.goalTitle,
      input.date,
      input.workMinutes,
      input.did,
      input.progressed,
      input.blocked,
      input.nextAction,
      input.rating
    );
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
      duration_minutes INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'carryover')),
      source TEXT NOT NULL DEFAULT 'ai',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      wake_time TEXT NOT NULL,
      sleep_time TEXT NOT NULL,
      natural_input TEXT NOT NULL,
      fixed_input TEXT NOT NULL,
      goals_input TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      notes TEXT NOT NULL,
      completed_task_ids TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS goal_progress_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_title TEXT NOT NULL,
      date TEXT NOT NULL,
      work_minutes INTEGER NOT NULL,
      did TEXT NOT NULL,
      progressed TEXT NOT NULL,
      blocked TEXT NOT NULL,
      next_action TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

type PlanRow = {
  id: number;
  date: string;
  wake_time: string;
  sleep_time: string;
  natural_input: string;
  fixed_input: string;
  goals_input: string;
  schedule_json: string;
  created_at: string;
};

type TaskRow = {
  id: number;
  title: string;
  priority: "high" | "medium" | "low";
  duration_minutes: number;
  deadline: string;
  notes: string;
  scheduled_date: string;
  status: "pending" | "completed" | "carryover";
  source: string;
  created_at: string;
};

type GoalProgressLogRow = {
  id: number;
  goal_title: string;
  date: string;
  work_minutes: number;
  did: string;
  progressed: string;
  blocked: string;
  next_action: string;
  rating: number;
  created_at: string;
};

function mapPlan(row: PlanRow): StoredPlan {
  return {
    id: row.id,
    date: row.date,
    wakeTime: row.wake_time,
    sleepTime: row.sleep_time,
    naturalInput: row.natural_input,
    fixedInput: row.fixed_input,
    goalsInput: row.goals_input,
    schedule: JSON.parse(row.schedule_json) as GeneratedSchedule,
    createdAt: row.created_at
  };
}

function mapTask(row: TaskRow): StoredTask {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    durationMinutes: row.duration_minutes,
    deadline: row.deadline,
    notes: row.notes,
    scheduledDate: row.scheduled_date,
    status: row.status,
    source: row.source,
    createdAt: row.created_at
  };
}

function mapGoalProgressLog(row: GoalProgressLogRow): StoredGoalProgressLog {
  return {
    id: row.id,
    goalTitle: row.goal_title,
    date: row.date,
    workMinutes: row.work_minutes,
    did: row.did,
    progressed: row.progressed,
    blocked: row.blocked,
    nextAction: row.next_action,
    rating: row.rating,
    createdAt: row.created_at
  };
}
