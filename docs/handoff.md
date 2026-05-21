Stock Dashboard プロジェクト 引き継ぎドキュメント
プロジェクト概要
株価のリアルタイム表示・チャート・ポートフォリオ管理を備えたフルスタックダッシュボードアプリ。ポートフォリオ用の個人プロジェクト。
技術スタック(確定済み)

フロントエンド: Next.js 16 (App Router) + TypeScript + Tailwind CSS + Recharts
バックエンド: Hono + TypeScript
データベース: PostgreSQL (Docker) + Prisma
認証: Google OAuth via Auth.js (Phase 3で追加予定)
株価API: Alpha Vantage (1日25リクエスト制限あり)
モノレポ: pnpm workspaces + Turborepo
デプロイ予定: Vercel (web) + Render (api)

AI機能は今回のスコープから除外(将来追加可能性あり)
プロジェクト構造
stock-dashboard/
├── apps/
│   ├── web/                # Next.js (port 3000)
│   └── api/                # Hono (port 8080)
├── packages/
│   └── database/           # Prisma (共有パッケージ)
├── docker-compose.yml      # PostgreSQL
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
確定済み設計
機能要件
認証なし(パブリック)で使える機能:

人気銘柄の現在価格・変動率を一覧表示
任意銘柄の検索と詳細ページ
7日/30日/1年の価格チャート
複数銘柄の比較

ログイン後の機能:

Googleアカウントでのログイン
ウォッチリストの追加・削除
取引履歴の記録(BUY/SELL、株数、価格、日付)
取引履歴からの保有銘柄サマリー(移動平均法で算出)
ポートフォリオ全体の総評価額・総損益

主要な設計判断

損益計算方式: 移動平均法(シンプルさを優先)
通貨: USD建てのみ
取引手数料: 初版では常に0(将来拡張可能な設計)
取引履歴の編集・削除: 許可(学習目的のため柔軟性優先)

DBスキーマ(Prismaで実装済み)
以下のモデルがpackages/database/prisma/schema.prismaに定義済み、マイグレーション実行済み:

User (Google OAuth用、googleIdをユニークキー)
Stock (銘柄マスタ、symbolをユニークキー)
WatchlistItem (User と Stock の中間テーブル)
Transaction (取引履歴、TransactionType enum: BUY/SELL)
PriceCache (Alpha Vantage の結果キャッシュ)

APIエンドポイント設計(まだ実装していない)
Public:

GET /api/stocks/search?q=apple
GET /api/stocks/popular
GET /api/stocks/:symbol
GET /api/stocks/:symbol/history?range=7d|30d|1y
GET /api/stocks/compare?symbols=AAPL,MSFT&range=30d
POST /api/auth/google
GET /api/auth/me

Protected (要JWT):

GET/POST/DELETE /api/watchlist
GET/POST/PATCH/DELETE /api/transactions
GET /api/portfolio
GET /api/portfolio/summary

エラーレスポンス形式: { error: { code, message } }
現在の進捗状況
✅ 完了済み (Step 0 + Step 1)

 要件定義・DBスキーマ・APIエンドポイント設計
 GitHub リポジトリ作成 + クローン
 pnpm モノレポ構成 (apps/, packages/)
 Next.js (apps/web) スキャフォールド
 Hono (apps/api) スキャフォールド、ポート8080に変更
 Turborepo 導入 (pnpm dev で並列起動)
 .gitignore、README.md 作成
 初回コミット + GitHub push
 Docker Desktop インストール、docker-compose.yml 作成
 PostgreSQL コンテナ起動 (localhost:5432)
 TablePlus で DB 接続確認
 packages/database 作成、Prisma セットアップ
 Prisma v6.19系の新仕様(prisma.config.ts)対応
 スキーマ定義 + マイグレーション実行
 packages/database/src/index.ts で PrismaClient export
 apps/api から @stock-dashboard/database を依存追加
 apps/api に DB接続テスト用エンドポイント /health/db を実装
 apps/api/.env 設定
 動作確認: http://localhost:8080/health/db で {"status":"ok","userCount":0} 返却確認済み

⏳ 次にやること (Phase 1 開始準備)

Alpha Vantage API キーの取得

https://www.alphavantage.co/support/#api-key で取得
apps/api/.env に ALPHA_VANTAGE_API_KEY=... を追加
apps/api/.env.example にもキー名のみ追加(値は伏せる)


Phase 1 実装開始

Alpha Vantage クライアント作成 (apps/api/src/lib/alpha-vantage.ts)
キャッシュ層実装(PriceCache テーブル活用)
エンドポイント実装:

GET /api/stocks/popular
GET /api/stocks/:symbol


Next.js フロントで価格一覧テーブル表示
24時間変動率の緑/赤色分け



環境情報

OS: macOS
Node: v20以上
pnpm: v11.1.3
Docker Compose: v5.1.3
PostgreSQL: postgres:16 (Dockerコンテナ)
接続情報:

Host: localhost, Port: 5432
User: dev, Password: devpassword
DB: stock_dashboard



開発の進め方について
ユーザーは以下の特徴と希望を持っている:

初の独自プロジェクト: プロセス全体を学ぶことを最優先
コードをただ動かすより、理解することを重視
Hono + Next.js を使いたい(技術選定の希望)
将来の就職活動を意識してポートフォリオとして仕上げたい
AIへの依存と理解のバランスを意識している

進め方の原則:

ステップバイステップで進める
各コマンドの意味を説明する
「なぜそうするか」を伝える
エラーが出たら、原因と対処を一緒に考える
詰まりやすいポイントは事前に注意する
「動いた」で満足せず、定期的に振り返りの機会を作る

過去の重要なつまづきポイント(参考)

Next.js 16系のcreate-next-appがapps/web内に独自のpnpm-workspace.yamlを作る挙動: 作成後に手動で削除する必要あり
pnpm v11のERR_PNPM_IGNORED_BUILDS: sharp, unrs-resolver, esbuild, prisma 系で発生。pnpm approve-buildsで承認
TurborepoがpackageManagerフィールドを要求する: pnpm v11のdevEngines形式だけでは認識しないので、packageManagerも追加する必要あり
Prisma v6.19系の新仕様: prisma.config.tsが自動生成される、providerがデフォルトでprisma-client(prisma-client-jsではない)、出力先がgenerated/prismaになる