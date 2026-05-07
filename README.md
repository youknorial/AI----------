# AI秘書タスク管理アプリ MVP

毎日のタスク、固定予定、長期目標から、AIが1日の時間割を作るローカルMVPです。

## 技術構成

- Next.js App Router
- TypeScript
- SQLite (`better-sqlite3`)
- OpenAI API (`openai` SDK)

## セットアップ

Node.js LTSをインストールしたあと、このフォルダで実行します。

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShellでは環境ファイルを次のように作れます。

```powershell
Copy-Item .env.example .env.local
npm run dev
```

`.env.local` にAPIキーを入れるとOpenAI APIで生成します。未設定の場合はローカルの簡易ロジックで時間割を作ります。

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5
```

## 入力フォーマット

タスク詳細:

```text
企画書ドラフト, high, 90, 2026-05-08, 初稿まで
メール整理, medium, 30, 2026-05-06
```

固定予定:

```text
09:30-10:00 朝会
13:00-14:00 顧客MTG
```

長期目標:

```text
資格試験, 2026-07-31, 3600, 問題集を1周
新規サービス案, 2026-06-15, 1200
```

SQLite DBは `data/app.db` に作成されます。

## ローカルサイトにアクセスする手順

1. PowerShellを開く
2. プロジェクトフォルダへ移動

```powershell
cd "C:\Users\23570\OneDrive\Desktop\AI秘書タスク管理アプリ"
```

3. まず普通に起動

```powershell
npm run dev
```

4. ブラウザで開く

```text
http://localhost:3000
```

または:

```text
http://127.0.0.1:3000
```

### `npm` が見つからない場合

Node.jsを入れた直後のPowerShellだとPATHが反映されていないことがあります。その場合はPowerShellを開き直してください。

それでもだめなら、このコマンドで起動できます。

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
& "C:\Program Files\nodejs\npm.cmd" run dev
```

### 初回だけ必要な場合

`node_modules` が消えている、または依存関係エラーが出る場合は先にこれを実行します。

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
& "C:\Program Files\nodejs\npm.cmd" install
```

そのあと再度:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

### 期待する表示

PowerShellにこのような表示が出たら成功です。

```text
Local: http://localhost:3000
Ready
```

そのPowerShellは閉じずに置いてください。閉じるとサイトも止まります。

OpenAI APIキーが未設定でもサイト自体は開けます。その場合はローカル簡易生成モードで動きます。
