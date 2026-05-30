# WebAssembly 圖片批次處理工具 (C + Emscripten)

這是一個利用 WebAssembly (Wasm) 技術實現的高效能圖片批次處理工具。核心圖片處理邏輯使用 C 語言撰寫，並透過 Emscripten 編譯為 WebAssembly，前端則使用 Vanilla JavaScript 進行整合。

## 功能特點

- **高效能處理**：利用 WebAssembly 接近原生的執行速度進行圖片像素運算。
- **批次處理**：支援多圖上傳，並能一次性套用相同的處理邏輯（裁切、旋轉、灰階）。
- **互動式裁切**：提供直觀的畫布預覽與框選介面。
- **多種格式輸出**：支援將處理後的圖片匯出為 JPG、PNG 或 WEBP 格式。
- **打包下載**：處理完成後自動將所有圖片打包成 ZIP 檔供下載。

## 核心功能

1. **圖片裁切 (Crop)**：手動框選範圍，支援多圖同比例自動裁切。
2. **圖片旋轉 (Rotate)**：支援順時針 90 度、180 度及 270 度旋轉。
3. **灰階濾鏡 (Grayscale)**：使用 C 語言優化的演算法將圖片轉為灰階。

## 編譯 WebAssembly

若要修改核心處理邏輯（`image-process.c`），需要重新編譯 Wasm 檔案。

### 準備工作
確保已安裝 [Emscripten (emsdk)](https://emscripten.org/docs/getting_started/downloads.html) 並已在該終端機執行環境變數設定（例如：`emsdk.ps1 activate latest`）。

### 編譯指令
在專案根目錄執行以下指令：

```bash
emcc image-process.c -o image-process.js -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s "EXPORTED_RUNTIME_METHODS=['HEAPU8']" -s ALLOW_MEMORY_GROWTH=1
```

**參數說明：**
- `-s EXPORT_ES6=1 -s MODULARIZE=1`：將編譯出的 JS 膠水程式碼輸出為 ES6 模組格式，方便在現代瀏覽器中使用 `import` 載入。
- `-s "EXPORTED_RUNTIME_METHODS=['HEAPU8']"`：匯出 `HEAPU8` 物件，讓 JavaScript 能直接存取 Wasm 的線性記憶體。
- `-s ALLOW_MEMORY_GROWTH=1`：允許 WebAssembly 記憶體根據圖片大小自動擴張。

## 專案結構

- `image-process.c`: C 語言核心邏輯，包含圖片處理函式。
- `image-process.wasm`: 編譯後的 WebAssembly 二進制檔案。
- `image-process.js`: Emscripten 產生的 JavaScript 膠水程式碼。
- `index.html`: 前端使用者介面。
- `index.js`: 前端互動邏輯與 Wasm 整合介面。
- `docs/`: 相關設計文件與學習筆記。

## 如何運行

由於 WebAssembly 模組載入涉及跨來源限制（CORS），建議使用本地伺服器運行此專案：

1. 使用 VS Code 的 **Live Server** 擴充功能。
2. 或使用 Python：`python -m http.server 8000`。
3. 或使用 Node.js 的 `http-server`。

開啟瀏覽器並造訪對應位址即可開始使用。

## 技術細節

本專案展示了以下技術點：
- 如何在 C 中定義與 Web 共享的記憶體結構。
- 如何在 JavaScript 中分配（`malloc`）與釋放（`free`） Wasm 記憶體。
- 如何將 `ImageData` 從 Canvas 傳遞至 Wasm 並取回處理結果。
- 處理多圖時的非同步流程控制。

## 實作模式與協作流程

本專案採用 **AI-Agent 驅動開發模式 (Agent-Driven Development)** 進行實作。協作模式如下：

1. **需求與架構定義（人類主導）**：
   - 使用者提出專案的需求規格與技術棧要求（包含 C 語言、WebAssembly、Emscripten SDK、Vanilla HTML/CSS/JavaScript 以及 `pnpm` 包管理工具）。
   - 設計核心結構（如 `Pixel` 結構體）與 API 介面規格（如記憶體管理與圖片處理函數的簽名）。
   - 規格內容詳見 [specification.md](docs/specification.md)。

2. **程式碼實作與整合（AI Agent 主導）**：
   - AI Agent (如 Antigravity) 讀取規格與設計文件。
   - 實作 C 語言核心像素運算邏輯（[image-process.c](image-process.c)）並將其編譯為 WebAssembly 模組。
   - 搭建前端介面與編寫邏輯控制代碼（[index.html](index.html)、[index.js](index.js)、[preview.js](preview.js)）。
   - 遵循專案的記憶體管理與型別註解（JSDoc）規範，防止 Wasm 記憶體洩漏。

3. **開發歷程記錄**：
   - AI Agent 在實作過程中持續維護開發日誌 [development_log.md](docs/development_log.md)，記錄實作進度、遇到的挑戰（例如多圖寬高比檢查、Canvas 高解析度預覽與 Wasm 記憶體管理等）以及具體的解決方案，以建立清晰的開發足跡。
