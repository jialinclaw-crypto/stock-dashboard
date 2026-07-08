# Routine 生成規格 · v3.1（評估可信度 + 股癌整合）

> Dashboard 端（`index.html` / `assets/app.js` / `assets/styles.css`）已配合下列改動更新完成。
> 本檔記錄**排程 routine prompt 需要跟著改的生成規則** —— 因為排程 prompt 存在平台端、不在 repo 內，
> 請把以下規則併進你的每日 routine 指令。

---

## 1) 降假精度 + 資料溯源（評估可信度）

**問題**：目前 JSON 的 `rsi14` / `macd` / `ma_alignment` / `pe` / `pe_percentile_5y` 多為**模型估算**，
但寫成 `P65`、`RSI 58` 這種個位數精度，看起來像精算過 → 誤導。

**規則**：
- `price`、`change_pct`、指數點位 → 只用 WebSearch 抓到的**實際成交值**；抓不到就 `null`，不要猜。
- 技術面 / 估值屬**估算**，請降低假精度並標註來源：
  - `rsi14`：以 5 為級距（55、60…），不要給到個位/小數。
  - `pe_percentile_5y`：**改用區間字串**（`"低<25"` / `"中 25–75"` / `"高>75"`），或無把握就 `null`，不要給 `65`。
  - 每檔 `technicals` 與 `valuation` 各加 `"source": "estimated"`；若某欄真的來自可靠來源才標 `"actual"`。
- 新增每檔 `data_quality`：`{ "price": "actual|estimated|null", "technicals": "estimated", "valuation": "estimated" }`

> Dashboard 已在信號區加上「價格為實際、技術/估值為模型估算」的說明，並在每張卡的技術/估值區塊標 `估`。

## 2) `whats_changed` 比較基準：限「近期」同類型報告

**問題**：今天 diff 對比的是 6/23（15 天前），導致 5 檔全被標「方向翻轉」，其實只是兩週的正常變化。

**規則**：
- Step 0 選上一份同類型報告時，計算與今日的天數差 `age`。
- `age > 5` 天 → 仍照常輸出 `whats_changed`，但 diff 要**保守**（只列高把握的變化），
  且**務必**填 `compared_to_date`（Dashboard 會自動顯示「N 天前 ⚠️ 非近期」的警示，避免誤讀為最新輪動）。
- 找不到任何同類型報告 → 三個陣列全空（維持原規則）。

---

## 3) 股癌 Podcast 整合

### 目標 schema（Dashboard 已預留渲染；填了才顯示）
```json
"podcast": {
  "show": "Gooaye 股癌",
  "episode": "EPxxx 標題",
  "published": "2026-07-07",
  "url": "https://…官方收聽連結",
  "summary": "重點摘要（見下方來源規則）",
  "summary_source": "self_transcribed | official_notes | search",
  "mentioned_tickers": ["2330", "NVDA"],
  "our_take": "我們自己寫的一句：和持股的關聯"
}
```

### B‑前者（自己轉錄音檔 → 生成原創摘要）＝ 目標做法，**目前環境被擋，需先開通**

實測阻擋：
1. **網路政策**：`itunes.apple.com` / SoundOn 主機 → egress proxy 回 `403 政策拒絕`（抓不到 mp3）。
2. **無 STT 工具**：環境缺 `ffmpeg` 與 `faster-whisper`；模型權重下載也可能被政策擋。

**開通步驟（環境設定，使用者端）**：參考 https://code.claude.com/docs/en/claude-code-on-the-web
- 放寬該 routine 環境的**網路政策**：允許 podcast 主機（SoundOn / Apple feed）與模型權重 CDN。
- 在**環境 setup script** 安裝：`ffmpeg` 與 `pip install faster-whisper`（首次會下載模型）。

**開通後的 pipeline（僅在有新集時執行，股癌約週更 2 集 → 多數早上是 no‑op）**：
1. 抓 RSS（browser UA），比對 `published` 是否比上次記錄新；沒新集 → 沿用既有 `podcast` 區塊。
2. 有新集 → 下載 enclosure mp3 → `ffmpeg` 轉檔 → `faster-whisper`（建議 `small`/`medium`）轉逐字稿。
3. 由本模型**生成原創摘要**（`summary_source:"self_transcribed"`）：3–5 句重點 + `mentioned_tickers`（比對 portfolio）+ 一句 `our_take`。
   - ⚠️ 只輸出**我們自己的摘要/評述**，不重製逐字稿全文（著作權）。

### 過渡 A（政策未開通前的合規備援）
用 WebSearch 抓「股癌 最新一集」的**官方標題 / 日期 / 連結**，`summary` 取官方 show notes 節錄，
`summary_source:"official_notes"`，`our_take` 由本模型針對 portfolio 補一句關聯。**不使用第三方爬來的逐字稿**。

---

## 版本
- v3.1 — 加入 data_quality/降假精度、diff 近期性、podcast 區塊。Dashboard 對應 commit 見 git log。
