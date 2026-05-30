# Agent 開發指南與專案工作規範

本專案是一個利用 WebAssembly (C + Emscripten) 進行圖片批次處理的 Vanilla 前端應用程式。為了確保開發過程的品質、程式碼的可維護性，以及提供清晰的開發足跡，請所有接手此專案的 AI 代理人（Agent）務必遵守以下規範：

## 1. 開發日誌記錄規範

在實作本專案的過程中，請務必建立並維護位於 `docs/` 下的開發日誌檔案：

*   **日誌檔案名稱**：[docs/development_log.md](docs/development_log.md)
*   **必須記錄的內容**：
    1.  **實作過程與進度**：記錄開發時的各個主要階段（如：C 語言核心實作、Wasm 編譯、HTML 介面搭建、preview.js 與 index.js 整合等）。
    2.  **遇到的阻礙與挑戰**：詳細記錄在開發與測試時碰到的任何問題（例如：Wasm 記憶體洩漏、多圖檔的寬高比例檢查計算、Canvas 的高解析度預覽與縮放比例問題等）。
    3.  **具體解決方案**：說明你是如何克服這些阻礙的，包含採取的邏輯調整、代碼優化、或特定的 WebAssembly 記憶體管理技巧（如在批次處理每張圖後調用 `_freeMemory`）。

## 2. 實作注意事項與偏好

*   **程式語言偏好**：
    *   **JavaScript (ES6)**：必須在 `index.js` 與 `preview.js` 包含完整且詳細的 **JSDoc 型別註解**。
*   **Wasm 記憶體管理**：
    *   在 JavaScript 中分配 Wasm 記憶體（調用 C 導出的 `allocMemory`）後，**必須**在處理完每張圖片後調用 `freeMemory` 進行釋放，以防批次處理多圖時造成瀏覽器記憶體洩漏。
*   **Emscripten SDK (emsdk) 環境設定偏好**：
    *   emsdk 的安裝與執行路徑，**必須**從專案根目錄的設定檔 [.claude/settings.local.json](.claude/settings.local.json) 中的 `env.EMSDK_PATH` 讀取，以便協作者可各自設定本機的路徑。
*   **文件連結規範**：
    *   在專案文件（如 Markdown 說明文件）中連結專案內其他檔案時，**必須**使用相對路徑連結（例如 `[settings.local.json](.claude/settings.local.json)`），嚴禁使用包含本機硬碟路徑的絕對路徑連結（如 `file:///c:/...`），以確保文件在不同協作者的環境下皆能正常點擊。


