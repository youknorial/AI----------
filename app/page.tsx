import { createSongAction, saveSongProgressAction, updateSongStepsAction } from "./actions";
import { calculateCompletionRate, songStatusLabels, stepStatusLabels } from "@/lib/dtm";
import { generateDtmSuggestion } from "@/lib/dtm-ai";
import { getDtmDashboard } from "@/lib/db";
import { todayInJapan } from "@/lib/dates";
import { ProductionStepStatus, SongStatus, StoredSong, StoredSongProgressLog, StoredSongStep } from "@/lib/types";

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

  return (
    <main className="app-shell dtm-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">DTM Production MVP</p>
          <h1>DTM進捗管理AI</h1>
          <p className="topbar-copy">曲を途中で止めず、小さい完成を積み上げるための制作継続支援アプリです。</p>
        </div>
        <div className="status-pill">{process.env.OPENAI_API_KEY ? "AI提案: OpenAI" : "AI提案: ローカル"}</div>
      </header>

      <section className="dtm-layout">
        <aside className="panel song-sidebar">
          <div className="section-title">
            <h2>曲一覧</h2>
          </div>
          <SongList songs={songs} selectedSongId={selectedSong?.id ?? null} />
          <SongForm />
        </aside>

        <section className="dtm-main">
          {selectedSong ? (
            <>
              <SongDetail song={selectedSong} completionRate={completionRate} />
              <div className="dtm-grid">
                <StepBoard songId={selectedSong.id} steps={steps} />
                <SuggestionPanel suggestion={suggestion} />
              </div>
              <ProgressLogPanel song={selectedSong} logs={logs} />
            </>
          ) : (
            <section className="panel empty-state">
              <strong>最初の曲を登録しましょう</strong>
              <p>曲名、ジャンル、目標完成日を入れると制作工程と進捗ログを管理できます。</p>
            </section>
          )}
        </section>
      </section>
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

function SongDetail({ song, completionRate }: { song: StoredSong; completionRate: number }) {
  return (
    <section className="panel song-hero">
      <div>
        <p className="eyebrow">Selected Song</p>
        <h2>{song.title}</h2>
        <p className="muted">
          {song.genre || "ジャンル未設定"} / 目標完成日 {song.targetDate || "未設定"} / {songStatusLabels[song.currentStatus]}
        </p>
        {song.memo ? <p className="song-memo">{song.memo}</p> : null}
      </div>
      <div className="completion-box">
        <strong>{completionRate}%</strong>
        <span>完成</span>
        <div className="completion-bar">
          <div style={{ width: `${completionRate}%` }} />
        </div>
      </div>
    </section>
  );
}

function StepBoard({ songId, steps }: { songId: number; steps: StoredSongStep[] }) {
  return (
    <section className="panel">
      <div className="section-title">
        <h2>制作工程</h2>
        <button type="submit" form="song-steps-form" className="secondary">
          工程をまとめて更新
        </button>
      </div>
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
      </form>
    </section>
  );
}

function SuggestionPanel({ suggestion }: { suggestion: Awaited<ReturnType<typeof generateDtmSuggestion>> | null }) {
  return (
    <section className="panel suggestion-panel">
      <div className="section-title">
        <h2>AI提案</h2>
        <span className="mini-pill">{suggestion?.source === "openai" ? "OpenAI" : "Local"}</span>
      </div>
      {suggestion ? (
        <div className="suggestion-list">
          <SuggestionItem label="次にやること" value={suggestion.nextTask} />
          <SuggestionItem label="小さい完成目標" value={suggestion.microGoal} />
          <SuggestionItem label="軽いアドバイス" value={suggestion.advice} />
          <SuggestionItem label="次回候補" value={suggestion.nextSessionCandidate} />
        </div>
      ) : (
        <p className="muted">曲を登録すると、次の一歩を提案します。</p>
      )}
    </section>
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

function ProgressLogPanel({ song, logs }: { song: StoredSong; logs: StoredSongProgressLog[] }) {
  return (
    <section className="panel progress-log-panel">
      <div className="section-title">
        <h2>進捗ログ</h2>
        <button type="submit" form="song-progress-form" className="secondary">
          保存
        </button>
      </div>
      <form action={saveSongProgressAction} id="song-progress-form" className="goal-log-form">
        <input type="hidden" name="songId" value={song.id} />
        <div className="grid-3">
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
        <div className="grid-3">
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
      </form>

      <div className="log-list">
        {logs.length === 0 ? (
          <p className="muted">まだ進捗ログがありません。</p>
        ) : (
          logs.map((log) => (
            <article className="log-row" key={log.id}>
              <strong>
                {log.date} / {log.workMinutes}分 / 評価 {log.rating}
              </strong>
              <p>{log.did || "作業内容未記入"}</p>
              <small>{[log.blocked && `詰まり: ${log.blocked}`, log.nextAction && `次: ${log.nextAction}`].filter(Boolean).join(" / ")}</small>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

const songStatusOptions: SongStatus[] = ["idea", "writing", "arranging", "mixing", "mastering", "posted", "paused"];
const stepStatusOptions: ProductionStepStatus[] = ["not_started", "in_progress", "done"];
