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
  "summary_source": "github_highlights | self_transcribed | official_notes | search",
  "mentioned_tickers": ["2330", "NVDA"],
  "our_take": "我們自己寫的一句：和持股的關聯"
}
```
> Dashboard 已依 `summary_source` 顯示來源 badge、把 portfolio 命中的 ticker 加 ★、有 `url` 才顯示「收聽整集」。

### 這個環境實測的網路可達性（決定做法）
| 來源 | 可達? | 說明 |
|---|---|---|
| `github.com` `git clone`（任意公開 repo） | ✅ | 已驗證可 clone 非本 repo 的公開專案 |
| `raw.githubusercontent.com` | ✅ | 200，可直接取單一檔案 |
| `api.github.com`（search / repos 任意） | ❌ | session 綁定，只允許本 repo scope → **無法用 API 搜尋** |
| `itunes.apple.com` / SoundOn（RSS/mp3） | ❌ | egress policy `403 / connect_rejected` |
| `gooayetranscript.com`、`vocus.cc`（逐字稿網站） | ❌ | egress policy `connect_rejected` |
| `ffmpeg` / `faster-whisper` | ❌ | 未安裝；模型權重下載大概也被擋 |

**結論**：現況唯一可行的取材路徑是 **git clone 一個「還在更新」的公開 GitHub 逐字稿/精華 repo**。

### 做法 ①（推薦，現況可跑）：GitHub 逐字稿 repo → 生成原創摘要
前置：需要一個**持續更新**的公開 repo URL（設為 `GOOAYE_REPO`）。
> ⚠️ 已知 `SLMT/gooaye-usa-highlights` 內容停在 2020、已廢棄，不可用。請提供 live repo。

pipeline（每日；股癌約週更 2 集，多數早上無新集 → no‑op）：
1. `git clone --depth 1 $GOOAYE_REPO` 或用 `raw.githubusercontent.com` 取索引。
2. 找出**最新一集**檔案（依日期/EP 編號排序）；比對是否比上次 `published` 新，沒有就沿用既有區塊。
3. 讀該集內容 → 由本模型**生成 3–5 句原創摘要**（`summary_source:"github_highlights"`）＋比對 portfolio 得 `mentioned_tickers` ＋一句 `our_take`。
   - ⚠️ 只輸出**我們自己的摘要/評述**，**不重製逐字稿全文**（著作權）；`url` 指向**官方**那集收聽連結。

### 做法 ②（需開通環境）：B‑前者，自己轉錄音檔
若放寬網路政策（允許 SoundOn/Apple + 模型 CDN）並在 setup script 裝 `ffmpeg` + `pip install faster-whisper`：
抓 RSS → 下載 mp3 → `ffmpeg` → `faster-whisper`(small/medium) 轉錄 → 生成原創摘要（`summary_source:"self_transcribed"`）。
邏輯同上，只是取材改成自轉錄。

### 待辦（卡在使用者輸入）
- [ ] 提供一個 **live 的 GitHub 逐字稿 repo URL** → 我把做法①整條接上（clone→找最新集→摘要→寫 podcast 區塊）。
- [ ] 或決定走做法②並放寬環境設定。

---

## 版本
- v3.1 — 加入 data_quality/降假精度、diff 近期性、podcast 區塊。Dashboard 對應 commit 見 git log。
- v3.2 — podcast 取材改以 GitHub repo 為主（實測 podcast 主機/逐字稿網站被 egress policy 擋，git clone 可用）。Dashboard 已實作 podcast 卡片＋來源 badge＋持股命中 ★。
