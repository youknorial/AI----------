import { generateScheduleAction, saveGoalProgressAction, saveProgressAction } from "./actions";
import { buildTimetable } from "@/lib/fallback-scheduler";
import { getDashboard } from "@/lib/db";
import { buildGoalDailySuggestions, buildGoalWorkCandidates } from "@/lib/goal-work";
import { todayInJapan } from "@/lib/dates";
import { normalizeDate, parseGoals } from "@/lib/parsers";
import { ScheduleItem, StoredGoalProgressLog, StoredTask } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const today = todayInJapan();
  const selectedDate = normalizeDate(String(params.date ?? ""), today);
  const { plan, tasks, progress, goalProgressLogs } = getDashboard(selectedDate);
  const goalInputs = plan ? parseGoals(plan.goalsInput, selectedDate) : [];
  const displayTimetable = plan ? getDisplayTimetable(plan, tasks, selectedDate) : [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local MVP</p>
          <h1>AI秘書タスク管理</h1>
        </div>
        <div className="status-pill">{process.env.OPENAI_API_KEY ? "OpenAI API 接続" : "ローカル簡易生成"}</div>
      </header>

      <section className="workspace">
        <form action={generateScheduleAction} className="panel composer">
          <div className="section-title">
            <h2>今日の入力</h2>
            <button type="submit">時間割を作る</button>
          </div>

          <div className="grid-3">
            <label>
              日付
              <input type="date" name="date" defaultValue={selectedDate} />
            </label>
            <label>
              起床
              <input type="time" name="wakeTime" defaultValue={plan?.wakeTime ?? "07:00"} />
            </label>
            <label>
              就寝
              <input type="time" name="sleepTime" defaultValue={plan?.sleepTime ?? "23:00"} />
            </label>
          </div>

          <label>
            今日やること
            <textarea
              name="naturalInput"
              rows={5}
              defaultValue={plan?.naturalInput ?? ""}
              placeholder="企画書を進める。山田さんに返信。請求書を確認。"
            />
          </label>

          <div className="grid-2">
            <label>
              タスク詳細
              <textarea
                name="taskInput"
                rows={7}
                placeholder={"企画書ドラフト, high, 90, 2026-05-08, 初稿まで\nメール整理, medium, 30, 2026-05-06"}
              />
            </label>
            <label>
              固定予定
              <textarea
                name="fixedInput"
                rows={7}
                defaultValue={plan?.fixedInput ?? ""}
                placeholder={"09:30-10:00 朝会\n13:00-14:00 顧客MTG"}
              />
            </label>
          </div>

          <label>
            長期目標
            <textarea
              name="goalsInput"
              rows={4}
              defaultValue={plan?.goalsInput ?? ""}
              placeholder={"資格試験, 2026-07-31, 3600, 問題集を1周\n新規サービス案, 2026-06-15, 1200"}
            />
          </label>
        </form>

        <section className="panel schedule-panel">
          <div className="section-title">
            <div>
              <h2>{selectedDate} の時間割</h2>
              {plan ? <p>{plan.schedule.summary}</p> : <p>入力後にここへ表示されます。</p>}
            </div>
          </div>
          {plan ? <Timetable items={displayTimetable} /> : <EmptyState />}
        </section>
      </section>

      <section className="bottom-grid">
        <TaskProgress date={selectedDate} tasks={tasks} progressNotes={progress?.notes ?? ""} />
        <GoalSuggestions plan={plan} />
        <GoalProgressPanel date={selectedDate} goals={goalInputs.map((goal) => goal.title)} logs={goalProgressLogs} />
      </section>
    </main>
  );
}

function Timetable({ items }: { items: ScheduleItem[] }) {
  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="timeline">
      {items.map((item, index) => (
        <div className={`timeline-row type-${item.type}`} key={`${item.startTime}-${item.endTime}-${index}`}>
          <time>
            {item.startTime}-{item.endTime}
          </time>
          <div>
            <strong>{item.title}</strong>
            <p>{item.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function getDisplayTimetable(plan: NonNullable<Awaited<ReturnType<typeof getDashboard>>["plan"]>, tasks: StoredTask[], date: string) {
  if (Array.isArray(plan.schedule.timetable) && plan.schedule.timetable.length > 0) {
    return plan.schedule.timetable;
  }

  const goals = parseGoals(plan.goalsInput, date);
  const dailySuggestions = buildGoalDailySuggestions(goals, date);
  const goalCandidates = plan.schedule.goalWorkCandidates ?? buildGoalWorkCandidates(goals, dailySuggestions);
  const sourceTasks =
    plan.schedule.tasks.length > 0
      ? plan.schedule.tasks
      : tasks
          .filter((task) => task.status !== "completed")
          .map((task) => ({
            title: task.title,
            priority: task.priority,
            durationMinutes: task.durationMinutes,
            deadline: task.deadline,
            notes: task.notes
          }));

  return buildTimetable({
    wakeTime: plan.wakeTime,
    sleepTime: plan.sleepTime,
    fixedEvents: plan.schedule.fixedEvents,
    tasks: sourceTasks,
    goalCandidates
  });
}

function TaskProgress({
  date,
  tasks,
  progressNotes
}: {
  date: string;
  tasks: StoredTask[];
  progressNotes: string;
}) {
  return (
    <form action={saveProgressAction} className="panel">
      <div className="section-title">
        <h2>進捗</h2>
        <button type="submit" className="secondary">
          保存
        </button>
      </div>
      <input type="hidden" name="date" value={date} />

      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="muted">まだタスクがありません。</p>
        ) : (
          tasks.map((task) => (
            <label className={`task-row ${task.status}`} key={task.id}>
              <input
                type="checkbox"
                name="completedTaskIds"
                value={task.id}
                defaultChecked={task.status === "completed"}
                disabled={task.status === "completed"}
              />
              <span>
                <strong>{task.title}</strong>
                <small>
                  {priorityLabel(task.priority)} / {task.durationMinutes}分 / 締切 {task.deadline}
                  {task.status === "carryover" ? " / 未完了から再配置" : ""}
                </small>
              </span>
            </label>
          ))
        )}
      </div>

      <label>
        1日の終わりのメモ
        <textarea name="progressNotes" rows={5} defaultValue={progressNotes} placeholder="完了したこと、詰まったこと、明日に回す理由。" />
      </label>
    </form>
  );
}

function GoalSuggestions({ plan }: { plan: Awaited<ReturnType<typeof getDashboard>>["plan"] }) {
  return (
    <section className="panel">
      <div className="section-title">
        <h2>目標の逆算</h2>
      </div>
      {plan && plan.schedule.goalDailySuggestions.length > 0 ? (
        <div className="goal-list">
          {plan.schedule.goalDailySuggestions.map((goal) => (
            <article key={`${goal.goalTitle}-${goal.targetDate}`} className="goal-row">
              <strong>{goal.goalTitle}</strong>
              <p>
                今日 {goal.suggestedMinutesToday}分 / 達成日 {goal.targetDate}
              </p>
              <small>{goal.reason}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">長期目標を入れると、今日の作業量が表示されます。</p>
      )}
      {plan ? <p className="carryover">{plan.schedule.carryoverStrategy}</p> : null}
    </section>
  );
}

function GoalProgressPanel({ date, goals, logs }: { date: string; goals: string[]; logs: StoredGoalProgressLog[] }) {
  return (
    <section className="panel progress-log-panel">
      <div className="section-title">
        <h2>長期目標ログ</h2>
        <button type="submit" form="goal-progress-form" className="secondary">
          保存
        </button>
      </div>

      <form action={saveGoalProgressAction} id="goal-progress-form" className="goal-log-form">
        <input type="hidden" name="goalLogDate" value={date} />
        <label>
          目標
          <input name="goalTitle" list="goal-options" placeholder="1曲完成" required />
          <datalist id="goal-options">
            {goals.map((goal) => (
              <option key={goal} value={goal} />
            ))}
          </datalist>
        </label>

        <div className="grid-2 compact-grid">
          <label>
            作業時間
            <input name="workMinutes" type="number" min="0" max="1440" step="5" defaultValue={30} />
          </label>
          <label>
            自己評価
            <select name="rating" defaultValue="3">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
        </div>

        <label>
          やったこと
          <textarea name="did" rows={3} />
        </label>
        <label>
          進んだこと
          <textarea name="progressed" rows={3} />
        </label>
        <label>
          詰まったこと
          <textarea name="blocked" rows={3} />
        </label>
        <label>
          次にやりたいこと
          <textarea name="nextAction" rows={3} />
        </label>
      </form>

      <div className="log-list">
        {logs.length === 0 ? (
          <p className="muted">まだログがありません。</p>
        ) : (
          logs.map((log) => (
            <article className="log-row" key={log.id}>
              <strong>
                {log.date} / {log.goalTitle}
              </strong>
              <p>
                {log.workMinutes}分 / 評価 {log.rating}
              </p>
              <small>{[log.did, log.progressed, log.blocked, log.nextAction].filter(Boolean).join(" / ")}</small>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <strong>時間割はまだありません</strong>
      <p>左のフォームから今日の材料を入れて生成します。</p>
    </div>
  );
}

function priorityLabel(priority: StoredTask["priority"]) {
  return priority === "high" ? "高" : priority === "medium" ? "中" : "低";
}
