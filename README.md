# 📈 股市儀表板 · Stock Dashboard

台美股市自動報告儀表板，由 Anthropic 雲端 agent 每日定時抓取整理。

## 🌐 Live URL

https://jialinclaw-crypto.github.io/stock-dashboard/

## 📋 內容

- **📊 即時市場**：台股加權、SOX、Nasdaq、S&P 500（TradingView widget）
- **📋 報告中心**：開盤前簡報 / 收盤後分析 / 一週回顧，依日期排序可篩選
- **💼 我的部位**：自填持股，資料只存在瀏覽器 localStorage
- **📅 行事曆**：時間軸視圖

## 🤖 報告產生

由 Anthropic Claude Sonnet 4.6 雲端 agent 排程自動產生，存放於 `reports/` 資料夾。

- 📈 開盤前簡報：週一至週五 07:30 台北時間
- 📊 台股收盤後分析：週一至週五 14:00 台北時間
- 📅 一週回顧：每週六 09:00 台北時間

## ⚠️ 免責聲明

本儀表板內容僅供市場資訊整理，非投資建議。投資涉及風險，請審慎評估自身風險承受度。

---

🤖 Generated and maintained by [Claude Code](https://claude.com/claude-code)
