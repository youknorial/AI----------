import { createSongAction, saveSongProgressAction, updateSongStepsAction } from "./actions";
import { calculateCompletionRate, findNextStep, songStatusLabels, stepStatusLabels } from "@/lib/dtm";
import { generateDtmSuggestion } from "@/lib/dtm-ai";
import { getDtmDashboard } from "@/lib/db";
import { todayInJapan } from "@/lib/dates";
import { DtmSuggestion, ProductionStepStatus, SongStatus, StoredSong, StoredSongProgressLog, StoredSongStep } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const selectedSongId = Number(params.song ?? "");
  const { songs, selectedSong, steps, logs } = getDtmDashboard(Number.isInteger(selectedSongId) ? selectedSongId : undefined);
  const suggestion = selectedSong ? await generateDtmSuggestion({ song: selectedSong, steps, logs }) : null;
  const completionRate = calculateCompletionRate(steps);
  const doneCount = steps.filter((step) => step.status === "done").length;
  const nextStep = findNextStep(steps);

  return (
    <main className="app-shell dtm-shell mobile-app">
      <header className="mobile-topbar">
        <div>
          <p className="eyebrow">DTM Production MVP</p>
          <h1>DTM進捗管理AI</h1>
        </div>
        <div className="status-pill">{process.env.OPENAI_API_KEY ? "AI提案: OpenAI" : "AI提案: ローカル"}</div>
      </header>

      {selectedSong ? (
        <section className="mobile-stack">
          <TodayFocus song={selectedSong} completionRate={completionRate} doneCount={doneCount} totalCount={steps.length} nextStepName={nextStep?.name ?? "次の工程"} suggestion={suggestion} />
          <ProgressLogPanel song={selectedSong} logs={logs} compact />
          <StepBoard songId={selectedSong.id} steps={steps} completionRate={completionRate} doneCount={doneCount} />
          <SuggestionPanel suggestion={suggestion} />
          <PastLogsPanel logs={logs} />
          <SongMemo song={selectedSong} />
          <SongSwitcher songs={songs} selectedSongId={selectedSong.id} />
        </section>
      ) : (
        <section className="mobile-stack">
          <section className="panel empty-state compact-empty">
            <strong>最初の曲を登録しましょう</strong>
            <p>曲を1つ登録すると、今日やること、完成率、次工程が毎日すぐ見られます。</p>
          </section>
          <details className="panel mobile-details" open>
            <summary>曲追加フォーム</summary>
            <SongForm />
          </details>
        </section>
      )}
    </main>
  );
}

function SongList({ songs, selectedSongId }: { songs: StoredSong[]; selectedSongId: number | null }) {
  if (songs.length === 0) {
    return <p className="muted">まだ曲がありません。</p>;
  }

  return (
    <div className="song-list">
      {songs.map((song) => (
        <a className={`song-link ${song.id === selectedSongId ? "active" : ""}`} href={`/?song=${song.id}`} key={song.id}>
          <strong>{song.title}</strong>
          <small>
            {song.genre || "ジャンル未設定"} / {songStatusLabels[song.currentStatus]}
          </small>
        </a>
      ))}
    </div>
  );
}

function SongForm() {
  return (
    <form action={createSongAction} className="song-form">
      <h3>曲を追加</h3>
      <label>
        曲名
        <input name="title" placeholder="新曲デモ" required />
      </label>
      <label>
        ジャンル
        <input name="genre" placeholder="Future Bass / Rock / Ballad" />
      </label>
      <label>
        目標完成日
        <input name="targetDate" type="date" defaultValue={todayInJapan()} />
      </label>
      <label>
        現在状態
        <select name="currentStatus" defaultValue="idea">
          {songStatusOptions.map((status) => (
            <option key={status} value={status}>
              {songStatusLabels[status]}
            </option>
          ))}
        </select>
      </label>
      <label>
        メモ
        <textarea name="memo" rows={4} placeholder="参考曲、方向性、完成条件など" />
      </label>
      <button type="submit">追加</button>
    </form>
  );
}

function TodayFocus({
  song,
  completionRate,
  doneCount,
  totalCount,
  nextStepName,
  suggestion
}: {
  song: StoredSong;
  completionRate: number;
  doneCount: number;
  totalCount: number;
  nextStepName: string;
  suggestion: DtmSuggestion | null;
}) {
  return (
    <section className="panel today-card">
      <div className="today-header">
        <div>
          <p className="eyebrow">今日の制作</p>
          <h2>{song.title}</h2>
          <p className="muted">{song.genre || "ジャンル未設定"} / {songStatusLabels[song.currentStatus]}</p>
        </div>
        <div className="today-rate">
          <strong>{completionRate}%</strong>
          <span>{doneCount}/{totalCount || 0}</span>
        </div>
      </div>

      <div className="completion-bar mobile-progress">
        <div style={{ width: `${completionRate}%` }} />
      </div>

      <article className="today-action">
        <small>今日やること</small>
        <p>{suggestion?.nextTask ?? `${nextStepName}を30分だけ進めましょう`}</p>
      </article>

      <div className="next-step-strip">
        <span>次工程</span>
        <strong>{nextStepName}</strong>
      </div>

      <a className="primary-link-button" href="#progress-log">
        進捗ログを追加
      </a>
    </section>
  );
}

function StepBoard({ songId, steps, completionRate, doneCount }: { songId: number; steps: StoredSongStep[]; completionRate: number; doneCount: number }) {
  return (
    <details className="panel mobile-details">
      <summary>
        制作工程
        <span>
          {doneCount}/{steps.length} 完了 / {completionRate}%
        </span>
      </summary>
      <form action={updateSongStepsAction} className="step-list" id="song-steps-form">
        <input type="hidden" name="songId" value={songId} />
        {steps.map((step) => (
          <div className={`step-row status-${step.status}`} key={step.id}>
            <strong>{step.name}</strong>
            <select name={`stepStatus:${step.id}`} defaultValue={step.status}>
              {stepStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {stepStatusLabels[status]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button type="submit" className="secondary">
          工程をまとめて更新
        </button>
      </form>
    </details>
  );
}

function SuggestionPanel({ suggestion }: { suggestion: Awaited<ReturnType<typeof generateDtmSuggestion>> | null }) {
  return (
    <details className="panel mobile-details suggestion-panel">
      <summary>
        AI提案の詳細
        <span>{suggestion?.source === "openai" ? "OpenAI" : "Local"}</span>
      </summary>
      {suggestion ? (
        <div className="suggestion-list">
          <SuggestionItem label="小さい完成目標" value={suggestion.microGoal} />
          <SuggestionItem label="軽いアドバイス" value={suggestion.advice} />
          <SuggestionItem label="次回候補" value={suggestion.nextSessionCandidate} />
        </div>
      ) : (
        <p className="muted">曲を登録すると、次の一歩を提案します。</p>
      )}
    </details>
  );
}

function SuggestionItem({ label, value }: { label: string; value: string }) {
  return (
    <article className="suggestion-item">
      <small>{label}</small>
      <p>{value}</p>
    </article>
  );
}

function ProgressLogPanel({ song, logs, compact = false }: { song: StoredSong; logs: StoredSongProgressLog[]; compact?: boolean }) {
  const latestLog = logs[0];

  return (
    <details className="panel mobile-details progress-log-panel" id="progress-log">
      <summary>
        進捗ログを追加
        {latestLog && compact ? <span>最新: {latestLog.date}</span> : null}
      </summary>
      <form action={saveSongProgressAction} id="song-progress-form" className="goal-log-form">
        <input type="hidden" name="songId" value={song.id} />
        <div className="mobile-form-grid">
          <label>
            日付
            <input name="date" type="date" defaultValue={todayInJapan()} />
          </label>
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
        <div className="mobile-form-grid">
          <label>
            やったこと
            <textarea name="did" rows={4} placeholder="サビのコードを作った" />
          </label>
          <label>
            詰まったこと
            <textarea name="blocked" rows={4} placeholder="メロディが単調に感じる" />
          </label>
          <label>
            次にやりたいこと
            <textarea name="nextAction" rows={4} placeholder="8小節だけメロディを作る" />
          </label>
        </div>
        <button type="submit">保存</button>
      </form>
    </details>
  );
}

function PastLogsPanel({ logs }: { logs: StoredSongProgressLog[] }) {
  const latestLog = logs[0];
  const olderLogs = logs.slice(1);

  return (
    <section className="panel latest-log-panel">
      <div className="section-title compact-title">
        <h2>最新ログ</h2>
      </div>
      {latestLog ? <LogRow log={latestLog} /> : <p className="muted">まだ進捗ログがありません。</p>}
      {olderLogs.length > 0 ? (
        <details className="inline-details">
          <summary>過去ログをすべて見る</summary>
          <div className="log-list">
            {olderLogs.map((log) => (
              <LogRow log={log} key={log.id} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function LogRow({ log }: { log: StoredSongProgressLog }) {
  return (
    <article className="log-row">
      <strong>
        {log.date} / {log.workMinutes}分 / 評価 {log.rating}
      </strong>
      <p>{log.did || "作業内容未記入"}</p>
      <small>{[log.blocked && `詰まり: ${log.blocked}`, log.nextAction && `次: ${log.nextAction}`].filter(Boolean).join(" / ")}</small>
    </article>
  );
}

function SongMemo({ song }: { song: StoredSong }) {
  return (
    <details className="panel mobile-details">
      <summary>
        詳細メモ
        <span>{song.targetDate ? `目標 ${song.targetDate}` : "未設定"}</span>
      </summary>
      <p className="song-memo">{song.memo || "メモはまだありません。"}</p>
    </details>
  );
}

function SongSwitcher({ songs, selectedSongId }: { songs: StoredSong[]; selectedSongId: number }) {
  return (
    <details className="panel mobile-details">
      <summary>
        曲の切り替え・追加
        <span>{songs.length}曲</span>
      </summary>
      <SongList songs={songs} selectedSongId={selectedSongId} />
      <details className="inline-details">
        <summary>曲追加フォームを開く</summary>
        <SongForm />
      </details>
    </details>
  );
}

const songStatusOptions: SongStatus[] = ["idea", "writing", "arranging", "mixing", "mastering", "posted", "paused"];
const stepStatusOptions: ProductionStepStatus[] = ["not_started", "in_progress", "done"];
