# 新しいライブの追加手順

このサイトでは、ライブごとの情報を JSON データとして追加すると、共通ページがそのデータを読み込んで表示します。
2026年・2024年の既存ライブと同じURLやコメント欄の仕組みを保つため、HTMLをコピーして増やす必要はありません。

## 追加するファイル

1. `data/lives/{groupId}/{liveId}.json` を作成する
2. `data/lives/index.json` に登録する
3. 必要に応じて画像や補助データを追加する
4. `node scripts/validate-live-data.mjs` でチェックする
5. 表示確認後に commit / push する

テンプレートは `data/lives/_template.json` にあります。

## ライブ登録簿

`data/lives/index.json` は、サイトが読み込むライブ一覧です。
新しいライブを追加するときは、以下の形式で1件追加してください。

```json
{
  "groupId": "20th-century",
  "liveId": "new-live-id",
  "path": "data/lives/20th-century/new-live-id.json",
  "displayOrder": 2026
}
```

`groupId` は `data/groups.json` にあるIDを使います。
`liveId` はライブJSON内の `id` と必ず一致させます。

## ライブデータの必須項目

ライブJSONには最低限以下を入れます。

- `id`: ライブID。URLとコメント識別子に使います。
- `groupId`: グループID。
- `type`: `LIVE` など。
- `year`: 開催年。
- `title`: 表示タイトル。
- `officialUrl`: 公式リンク。ない場合は空文字でも可。
- `sections`: 総合・公演日程・映像・円盤・グッズの説明。
- `performances`: 公演日程。
- `setlists`: 総合側で使うセットリスト。
- `video`: 映像・円盤ページ用データ。
- `goods`: グッズ一覧。

## IDとslugの命名規則

- `liveId`: 半角英数字とハイフンで、ライブを識別できる名前にします。
- `performanceId`: `yyyymmdd-hhmm` 形式を推奨します。
- `goodsId`: 半角英数字とハイフンで、グッズ名が分かる名前にします。
- 曲は現在 `songId` を持たず、曲順・曲名・セットリストIDからページとコメント識別子を生成しています。

既存コメントとの互換性を守るため、既存ライブの `id`、セットリストID、曲順、グッズID、公演IDは不用意に変更しないでください。

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
`note`: `"日替わり"` を付けると、カード上にも表示されます。

総合ページでは `v2` があれば `v2` を優先し、なければ最後のセットリストを使います。

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

同じ日の昼夜公演は、時間を変えて別IDにしてください。

## 映像・円盤情報の書き方

`video.setlist` に曲を入れると、映像・円盤ページ専用の曲ページとして表示されます。
空配列の場合は、総合ページの優先セットリストが使われます。

```json
"video": {
  "setlist": [],
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

映像・円盤内の曲ページは `video-song.html` に遷移し、総合側の `song.html` とは別コメント欄になります。

## グッズ情報の書き方

```json
{
  "id": "goods-id",
  "name": "グッズ名",
  "price": 1000
}
```

`goodsId` はコメント識別子にも使うため、公開後は変更しないでください。

## コメント識別子の仕組み

現在のGiscus識別子は、既存コメントとの互換性を優先して以下の形式です。

- 総合ページ: `section:{groupId}:{liveId}:general`
- グッズ全体: `section:{groupId}:{liveId}:goods`
- 総合側の曲: `song:{groupId}:{liveId}:{setlistId}:song-{index}:order-{order}:{titleSlug}`
- 映像・円盤側の曲: `video-song:{groupId}:{liveId}:{setlistId}:song-{index}:order-{order}:{titleSlug}`
- 公演内の思い出: `mc:{groupId}:{liveId}:{performanceId}` など
- グッズ個別: `goods:{groupId}:{liveId}:{goodsId}`

IDや曲順を変えると新しいコメント欄として扱われる場合があります。

## 検索反映の仕組み

トップページとグループページの検索は `data/lives/index.json` を読み、登録済みライブを自動で検索対象にします。
検索対象には、グループ名、ライブ名、年、曲名、公演日、会場名、映像・円盤、グッズ名、Giscusから生成されたコメントデータが含まれます。

コメント検索用の `data/memories.json` は GitHub Actions の Sync memories が更新します。

## バリデーション

追加後は以下を実行してください。

```bash
node scripts/validate-live-data.mjs
```

チェック内容:

- `liveId` の重複
- `groupId` の存在
- 必須項目の欠落
- 公演IDの重複
- セットリストIDの重複
- 生成される曲キーの重複
- グッズIDの重複
- 生成URLの重複
- 登録簿とライブJSONのID不一致

## 動作確認チェックリスト

- グループページのLIVE一覧に追加ライブが出る
- 年ごとに新しい順で表示される
- コンサート詳細ページが開く
- 総合ページが開く
- 公演日程ページが開く
- 各公演ページが開く
- 映像・円盤ページが開く
- 映像・円盤内の曲ページが `video-song.html` に進む
- グッズ一覧が開く
- グッズ個別ページが開く
- Giscusが表示される
- 検索にライブ名・曲名・会場名・グッズ名が出る
- 同じページが検索で重複しない

## よくあるミス

- `data/lives/index.json` に追加し忘れる
- 登録簿の `liveId` とライブJSONの `id` が違う
- 公演IDやグッズIDが重複している
- 映像・円盤専用セットリストを入れ忘れ、総合セットリストと同じ内容になる
- 公開後にIDや曲順を変更して、コメント欄が別扱いになる
