# WebAssembly 圖片批次處理工具實作計畫

本計畫旨在根據 [specification.md](specification.md) 的要求，實作一個高效能的 WebAssembly 圖片批次處理工具。專案包含 C 語言核心運算、現代深色主題的前端介面、圖片預覽與互動模組、以及批次處理與 ZIP 打包下載功能。

## User Review Required

> [!IMPORTANT]
> **編譯 WebAssembly 模組 (PowerShell Windows 環境)**
> - 在實作過程中，我們需要使用 Emscripten 進行編譯。
> - 本機編譯前需讀取設定檔 [.claude/settings.local.json](../.claude/settings.local.json) 中設定的 `env.EMSDK_PATH`。
> - 在執行編譯前，我們需要在該終端機 session 執行啟用腳本：
>   ```powershell
>   # 使用自訂設定的 EMSDK_PATH 啟用環境
>   # 例如：& "$env:EMSDK_PATH\emsdk.ps1" activate latest
>   ```
> - 接著執行以下編譯指令：
>   ```powershell
>   emcc image-process.c -o image-process.js -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s "EXPORTED_RUNTIME_METHODS=['HEAPU8']" -s ALLOW_MEMORY_GROWTH=1
>   ```

> [!TIP]
> **JSDoc 型別註解**
> - 根據您的程式語言偏好，我們在 `index.js` 與 `preview.js` 中會加入完整且詳細的 JSDoc 型別註解，以便於維護並提供良好的代碼提示。

## Design Decisions

> [!NOTE]
> **預設裁切框比例與自適應 (已確認)**：
> - 當使用者在當前圖片上框選了一個區域後，會儲存該區域相對於該圖片寬高的百分比比例（例如：起點 `x: 10%, y: 15%`，大小 `w: 50%, h: 40%`）。
> - 當切換至其他不同尺寸的圖片時，裁切框會自動套用該百分比比例，確保所有圖片都在同一比例下被裁切。
> - 若使用者尚未進行手動框選（例如剛載入圖片），系統預設會在圖片中央初始化一個 `80%` 大小的裁切框。

---

## Proposed Changes

### C 語言核心運算

#### [NEW] [image-process.c](../image-process.c)
- 定義 `Pixel` 結構體（包含 `r, g, b, a` 成員）。
- 實作記憶體管理函數 `allocMemory` 與 `freeMemory`。
- 實作 `cropImage`、`rotateImage` 與 `applyGrayscale`，並以 `EMSCRIPTEN_KEEPALIVE` 導出。
- 灰階計算公式使用亮度法：`gray = (r * 77 + g * 150 + b * 29) >> 8`。

---

### 前端使用者介面與樣式

#### [NEW] [index.html](../index.html)
- 採用現代深色主題（Dark Mode）進行視覺設計，利用漸層、半透明磨砂玻璃質感（Glassmorphism）與微動畫來優化使用者體驗。
- **佈局配置**：
  - 左上方：檔案上傳與管理區。
  - 右上方：參數設定區（包含功能選擇、角度選擇、輸出格式選擇、執行按鈕）。
  - 下方：整個寬度的處理預覽區。
- **細節控制**：
  - 圖片清單至少可容納四列，超出時顯示直向滾動條。
  - 右側參數區固定高度，確保不遮擋。
  - 底部顯示動態狀態文字。
- 使用 CDN 引入 JSZip 程式庫。

#### [NEW] [index.css](../index.css)
- 定義全局的 HSL 變數（深灰底色、柔和文字、亮藍色裝飾、按鈕動態反饋）。
- 實作響應式佈局以及滾動條樣式。

---

### 前端邏輯與 Wasm 整合

#### [NEW] [preview.js](../preview.js)
- 處理圖片預覽 Canvas 的繪製與滑鼠拖曳框選互動。
- 實作 `setMode`、`setImage`、`setRotation` 等介面。
- 非裁切模式下，使用 Canvas 內建的 `filter` 或 `ctx.transform` 進行快速預覽（不調用 Wasm）。
- 裁切模式下，繪製暗化背景，明亮顯示框選區域，追蹤滑鼠事件以更新選取範圍，確保裁切框按比例適應。
- 包含完整的 JSDoc 型別註解。

#### [NEW] [index.js](../index.js)
- 導入並初始化 WebAssembly 模組（`image-process.js`）。
- 管理上傳圖片清單（支援多圖、上移、下移、刪除、清空）。
- 圖片上傳時進行格式驗證。
- 實作防呆檢查：
  - 裁切模式下必須有框選範圍。
  - 檢查所有圖片的寬高比例是否一致（若不一致則彈出警告「所有圖片比例必須相同才能套用同比例裁切」）。
- 執行批次處理迴圈：
  - 計算記憶體大小、調用 Wasm 記憶體分配、將像素複製至 Wasm HEAP。
  - 套用對應圖片處理算法。
  - 讀回像素數據並透過離屏 Canvas 生成對應格式的 Blob。
  - **必備：在處理完每張圖片後，釋放記憶體。**
- 使用 JSZip 打包所有處理後的 Blob，保持原檔名並僅變更為新的副檔名（不加任何 `_processed` 後綴），打包完成後下載 `image.zip` 並更新狀態為「完成！」。
- 包含完整的 JSDoc 型別註解。

---

## Verification Plan

### Compile Test (Windows PowerShell)
- 在 PowerShell 終端機中，先讀取 [.claude/settings.local.json](../.claude/settings.local.json) 中的 `env.EMSDK_PATH` 並套用至環境變數，執行啟用腳本（例如：`& "$env:EMSDK_PATH\emsdk.ps1" activate latest`）啟用 emsdk 環境。
- 接著執行 `emcc` 編譯指令，確認生成 `image-process.js` 與 `image-process.wasm` 檔案，且無編譯錯誤。

### Manual Verification & Dev Server
- **啟動伺服器**：在工作目錄下執行 `pnpm dlx serve` 啟動本地伺服器.
- **測試圖檔來源**：本專案的 [test](../test) 目錄下包含多個圖檔，可在 `chrome-devtools` MCP 測試環節中上傳並進行各項功能驗證。
- **頁面功能驗證**：
  - 使用 `chrome-devtools` MCP 來載入網頁，確認載入無錯誤、樣式正常（Dark Mode）且 JS 正常執行。
  - **上傳圖片**：透過 chrome-devtools 驗證多圖上傳、清單排序（上移、下移）、刪除與清空，確認當圖片多於 4 列時顯示直向滾動條。
  - **預覽圖片**：
    - 裁切模式：驗證框選範圍功能，確認半透明遮罩顯示正常，切換不同尺寸圖片時裁切框能自動按比例適應。
    - 旋轉模式：驗證點擊角度後 Canvas 之即時預覽。
    - 灰階模式：驗證 Canvas 即時灰階濾鏡預覽。
  - **批次處理防呆與運算**：
    - 上傳不同比例的圖片執行裁切，驗證是否正確彈出警告。
    - 執行批次處理，驗證是否成功生成 ZIP 打包並自動下載 `image.zip`。
    - 確認處理後的圖片檔名符合 `[原名].[新格式]`（無 `_processed`）且效果正確。
