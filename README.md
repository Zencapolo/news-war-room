# 即時新聞戰情系統

一個不依賴外部套件的 Node.js MVP。系統預設 AI、慈善、金融與教育新聞來源，用來擷取新聞、清洗內容、去重、產生摘要與趨勢標籤，並提供情緒、影響力、語義檢索、警告置頂與自訂監測主題。

## 功能

- 預設來源：內建 AI、慈善、金融與教育 Google News RSS 來源。
- 自訂監測主題：可新增、停用、刪除與重設主題。
- 資料永久保存：主題設定、新聞資料、歷史趨勢與警告會保存到 `data-store.json`。
- 新聞分析：摘要、中文趨勢標籤、情緒原因、影響力原因與語義分數。
- 篩選排序：支援分類、標籤、搜尋、影響力、情緒與時間排序。
- 今日重點與警告置頂：把高影響力新聞與警告集中在頁面上方。
- 每日摘要報告：彙整今日主軸、分類重點、趨勢、風險、追蹤狀態與建議行動。
- 新聞追蹤清單：可收藏重要新聞，標記為追蹤中、需回報或已處理。
- 關鍵字趨勢時間軸：可選關鍵字並查看 24 小時或 7 天出現趨勢。
- 行銷機會分析：替新聞計算行銷機會分數、受眾意圖、品牌風險、建議渠道與內容題材。
- 行銷行動任務板：可把行銷建議建立為任務，追蹤狀態、優先級與來源新聞。
- 任務篩選與看板：可依狀態、優先級、類型篩選任務，並以待處理、撰寫中、待審核、已發布、暫緩分欄管理。
- 任務詳情與草稿：每個行銷任務可保存目標受眾、CTA、預計發布日、備註與內容草稿。
- 匯出任務素材：可將行銷任務匯出為 Markdown，方便貼到文件、審稿流程或發布平台。
- 任務素材預覽 / 複製：可直接在任務卡預覽 Markdown，並一鍵複製到剪貼簿。
- 自動更新：前端每 1 分鐘刷新一次，後端依主題優先級控制抓取頻率。

## 啟動

```powershell
npm start
```

開啟：

```text
http://localhost:4174
```

## 資料保存

本機資料會寫入：

```text
D:\Codex\data-store.json
```

保存內容包含：

- `feeds`：目前監測主題與來源設定。
- `articles`：已擷取與分析後的新聞資料。
- `history`：趨勢標籤的時間序列統計。
- `alerts`：已觸發的警告。
- `watchlist`：收藏與追蹤中的新聞狀態。
- `lastRefresh`：最近一次更新狀態。

## API

```text
GET    /api/dashboard?q=AI&category=AI&tag=人工智慧&filter=high-impact&sort=impact
GET    /api/daily-report
GET    /api/trends?tag=人工智慧&range=24h
GET    /api/marketing-tasks
POST   /api/marketing-tasks
PATCH  /api/marketing-tasks/:id
DELETE /api/marketing-tasks/:id
GET    /api/marketing-tasks/:id/export
POST   /api/refresh
GET    /api/topics
POST   /api/topics
PATCH  /api/topics/:id
DELETE /api/topics/:id
POST   /api/topics/reset
GET    /api/watchlist
POST   /api/watchlist
PATCH  /api/watchlist/:articleId
DELETE /api/watchlist/:articleId
GET    /api/feeds
POST   /api/feeds
POST   /api/opml
```

新增監測主題：

```json
{
  "name": "長照",
  "query": "長照 OR 照護 OR 高齡 OR 失能",
  "priority": "hourly",
  "enabled": true
}
```

## 後續可強化

- 改用 SQLite、PostgreSQL 或向量資料庫承接大量新聞。
- 將簡易 hash vector 換成正式 embedding 與向量搜尋。
- 將摘要、標籤、情緒與影響力原因接上正式 LLM。
- 串接 LINE、Slack 或 Email webhook，真正送出告警。
- 加入背景 worker，避免 API request 承擔抓取任務。
