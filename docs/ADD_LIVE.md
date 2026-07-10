# 新しいライブの追加マニュアル

このドキュメントは、新しいライブ・舞台・イベントを追加するときの作業手順です。
HTMLをコピーして増やすのではなく、ライブデータを追加すると共通ページが自動で読み込む仕組みになっています。

## まず全体の流れ

1. 追加したい公演情報を整理する
2. `data/lives/_template.json` を参考にライブJSONを作る
3. 作ったJSONを `data/lives/{groupId}/{liveId}.json` に置く
4. `data/lives/index.json` に新しいライブを登録する
5. `node scripts/validate-live-data.mjs` で入力漏れやID重複を確認する
6. ブラウザで表示と検索を確認する
7. commit / push する
8. GitHub Pagesに反映されたら公開URLで確認する

## 必要なデータ

新しいライブを追加するときは、基本的に以下を用意します。

- 基本情報: グループ、ライブ名、年、LIVE/STAGE/EVENT、公式サイトURL
- セットリスト: 曲順、曲名、アーティスト名、日替わり情報
- 公演日程: 日付、時間、地域、会場
- 映像・円盤情報: 映像用セットリスト、特典映像、公式サイトURL
- グッズ一覧: 商品名、価格

情報をChatGPTへ渡すときは、`docs/ADD_LIVE_TEMPLATE.md` の形式を使うと整理しやすいです。

## 各ファイルの役割

- `data/lives/{groupId}/{liveId}.json`
  - 1つのライブの本体データです。
  - セットリスト、公演日程、映像・円盤、グッズをここに入れます。

- `data/lives/index.json`
  - サイトが読み込むライブ一覧の登録簿です。
  - ここに登録しないと、ライブ一覧や検索に出ません。

- `data/lives/_template.json`
  - 新しいライブJSONを作るためのテンプレートです。

- `js/live-registry.js`
  - 登録簿を読み、ライブ一覧や検索対象を自動生成する共通処理です。
  - 通常は編集しません。

- `scripts/validate-live-data.mjs`
  - ID重複や必須項目漏れを確認するチェック用スクリプトです。

- `data/memories.json`
  - Giscusコメントを検索に使うための生成データです。
  - 通常はGitHub Actionsが更新します。

## JSONファイルの配置場所

ライブJSONは以下に置きます。

```text
data/lives/{groupId}/{liveId}.json
```

例:

```text
data/lives/20th-century/chikyuwotobidasou-2024.json
data/lives/20th-century/utauhito-odoruhito-2026.json
```

`groupId` は `data/groups.json` にあるIDを使います。

現在使える主なID:

- `v6`
- `20th-century`
- `coming-century`
- `individual`

## index.jsonへの登録方法

ライブJSONを作ったら、`data/lives/index.json` に1件追加します。

```json
{
  "groupId": "20th-century",
  "liveId": "new-live-id",
  "path": "data/lives/20th-century/new-live-id.json",
  "displayOrder": 2026
}
```

注意点:

- `liveId` はライブJSON内の `id` と完全に一致させます。
- `groupId` はライブJSON内の `groupId` と完全に一致させます。
- `path` は作成したJSONファイルの場所です。
- `displayOrder` は並び順の補助情報です。基本は年を入れます。

## ライブJSONの基本形

```json
{
  "id": "new-live-id",
  "groupId": "20th-century",
  "type": "LIVE",
  "year": 2026,
  "title": "ライブタイトル",
  "officialUrl": "https://example.com",
  "sections": [],
  "performances": [],
  "setlists": [],
  "video": {
    "setlist": [],
    "bonusSections": []
  },
  "goods": []
}
```

実際に作るときは `data/lives/_template.json` をコピーして使います。

## IDの付け方

IDはコメント欄やURLに関係するため、公開後はできるだけ変更しないでください。

- `liveId`: 半角英数字とハイフンで、ライブを識別できる名前
- `performanceId`: `yyyymmdd-hhmm` 形式がおすすめ
- `goodsId`: 半角英数字とハイフンで、グッズ名が分かる名前
- セットリストID: 基本は `v1`。複数ある場合は `v2` など

例:

```text
liveId: chikyuwotobidasou-2024
performanceId: 20240604-1800
goodsId: uchu-penlight
```

## セットリストの書き方

```json
{
  "id": "v1",
  "name": "main setlist",
  "songs": [
    {
      "order": 1,
      "title": "曲名",
      "artist": "アーティスト名"
    }
  ]
}
```

日替わり曲は、同じ `order` のカードを複数入れて構いません。

```json
{
  "order": 9,
  "title": "日替わり曲A",
  "artist": "20th Century",
  "note": "日替わり"
}
```

総合ページでは、`v2` がある場合は `v2` を優先して表示します。
`v2` がない場合は最後のセットリストを使います。

## 公演日程の書き方

```json
{
  "id": "20260701-1800",
  "date": "2026-07-01",
  "time": "18:00",
  "area": "東京",
  "venue": "会場名"
}
```

同じ日に昼夜公演がある場合は、時間ごとに別データにします。

```json
{
  "id": "20260701-1400",
  "date": "2026-07-01",
  "time": "14:00",
  "area": "東京",
  "venue": "会場名"
}
```

## 映像・円盤情報の書き方

映像・円盤ページ専用のセットリストがある場合は、`video.setlist` に入れます。

```json
"video": {
  "setlist": [
    {
      "order": 1,
      "title": "曲名",
      "artist": "アーティスト名"
    }
  ],
  "bonusSections": [
    {
      "title": "初回盤 特典映像",
      "items": [
        "特典映像タイトル"
      ]
    }
  ]
}
```

`video.setlist` が空の場合は、総合ページで使うセットリストが映像・円盤ページにも表示されます。

## グッズ情報の書き方

```json
{
  "id": "goods-id",
  "name": "グッズ名",
  "price": 1000
}
```

価格は数字だけで入力します。
表示時に「円」が付きます。

## コメント欄（Giscus）の生成

コメント欄は、ページごとの識別子によって自動的に分かれます。
同じ識別子になるとコメントが混ざるため、ID重複に注意してください。

現在の識別子:

- 総合ページ: `section:{groupId}:{liveId}:general`
- グッズ全体: `section:{groupId}:{liveId}:goods`
- 総合側の曲: `song:{groupId}:{liveId}:{setlistId}:song-{index}:order-{order}:{titleSlug}`
- 映像・円盤側の曲: `video-song:{groupId}:{liveId}:{setlistId}:song-{index}:order-{order}:{titleSlug}`
- 公演内の思い出: `mc:{groupId}:{liveId}:{performanceId}` など
- グッズ個別: `goods:{groupId}:{liveId}:{goodsId}`

公開後に `liveId`、`performanceId`、`goodsId`、曲順、セットリストIDを変えると、別のコメント欄として扱われることがあります。

## 検索へ反映される仕組み

トップページとグループページの検索は、`data/lives/index.json` に登録されたライブを読み込みます。

検索対象:

- グループ名
- ライブ名
- 年
- 曲名
- 公演日
- 会場名
- 映像・円盤
- グッズ名
- Giscusコメントから生成された `data/memories.json`

コメント検索用の `data/memories.json` は、GitHub Actionsの `Sync memories` が更新します。

## GitHub Pagesへ反映されるまでの流れ

1. ローカルでデータを追加する
2. バリデーションを実行する
3. 表示確認する
4. commitする
5. GitHubへpushする
6. GitHub Pagesが更新される
7. 公開URLで確認する

GitHub Pagesは反映に少し時間がかかることがあります。
数十秒から数分待ってから再読み込みしてください。

## commit / pushまでの手順

確認用コマンド:

```bash
node scripts/validate-live-data.mjs
```

問題なければcommitしてpushします。

```bash
git status
git add .
git commit -m "Add new live data"
git push origin main
```

push後、GitHub Pagesで公開URLを確認します。

## ライブ追加時によくあるミス

- `data/lives/index.json` に登録し忘れる
- 登録簿の `liveId` とライブJSONの `id` が違う
- 登録簿の `groupId` とライブJSONの `groupId` が違う
- `liveId` が既存ライブと重複している
- `performanceId` が同じライブ内で重複している
- `goodsId` が同じライブ内で重複している
- セットリストIDが重複している
- 曲順や曲名を公開後に変えて、コメント欄が別扱いになる
- 映像・円盤専用曲ページにしたいのに `video.setlist` を入れ忘れる
- 公式サイトURLをライブJSONに入れ忘れる
- JSONのカンマ抜けや引用符抜けで読み込めない
- GitHub Pagesの反映待ちを不具合と勘違いする

## 迷ったとき

1. `docs/ADD_LIVE_TEMPLATE.md` に沿って情報を整理する
2. ChatGPTに「この内容をライブJSONにしてください」と依頼する
3. `data/lives/_template.json` と既存ライブJSONを参考にする
4. `node scripts/validate-live-data.mjs` で確認する
5. `docs/CHECKLIST.md` で公開前確認を行う
