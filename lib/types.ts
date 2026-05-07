export type Priority = "high" | "medium" | "low";

export type TaskStatus = "pending" | "completed" | "carryover";

export type TaskInput = {
  title: string;
  priority: Priority;
  durationMinutes: number;
  deadline: string;
  notes: string;
};

export type GoalInput = {
  title: string;
  targetDate: string;
  totalWorkMinutes: number;
  notes: string;
};

export type FixedEvent = {
  title: string;
  startTime: string;
  endTime: string;
};

export type ScheduleItem = {
  startTime: string;
  endTime: string;
  title: string;
  type: "task" | "fixed" | "break" | "goal" | "buffer" | "suggestion";
  taskTitle: string;
  reason: string;
};

export type GoalWorkCandidate = {
  goalTitle: string;
  taskTitle: string;
  durationMinutes: number;
  reason: string;
};

export type GeneratedSchedule = {
  summary: string;
  tasks: TaskInput[];
  fixedEvents: FixedEvent[];
  goalDailySuggestions: {
    goalTitle: string;
    targetDate: string;
    suggestedMinutesToday: number;
    reason: string;
  }[];
  goalWorkCandidates?: GoalWorkCandidate[];
  timetable: ScheduleItem[];
  carryoverStrategy: string;
};

export type StoredTask = TaskInput & {
  id: number;
  scheduledDate: string;
  status: TaskStatus;
  source: string;
  createdAt: string;
};

export type StoredPlan = {
  id: number;
  date: string;
  wakeTime: string;
  sleepTime: string;
  naturalInput: string;
  fixedInput: string;
  goalsInput: string;
  schedule: GeneratedSchedule;
  createdAt: string;
};

export type StoredGoalProgressLog = {
  id: number;
  goalTitle: string;
  date: string;
  workMinutes: number;
  did: string;
  progressed: string;
  blocked: string;
  nextAction: string;
  rating: number;
  createdAt: string;
};
