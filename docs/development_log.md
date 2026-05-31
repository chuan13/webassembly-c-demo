# WebAssembly 圖片批次處理工具 開發日誌 (Development Log)

本開發日誌記錄了此專案從無到有、整合 WebAssembly 與 Vanilla 前端的實作進度，以及在開發測試過程中所面臨的技術阻礙與相應解決方案。

---

## 1. 實作過程與進度

本專案的實作按步驟循序漸進，主要包含以下開發階段：

### 階段一：C 語言像素處理核心 (`image-process.c`)
- **實作內容**：定義 RGBA 結構體 `Pixel`。實作基本的圖片處理算法（裁切、旋轉、就地灰階化）。
- **關鍵點**：加入了裁切時的邊界安全檢查，避免讀取非法記憶體。

### 階段二：WebAssembly 模組編譯
- **實作內容**：在 Windows 11 PowerShell 環境下，從 [.claude/settings.local.json](../.claude/settings.local.json) 讀取 `env.EMSDK_PATH` 並加載 Emsdk 環境，執行編譯：
  ```powershell
  # 載入指定的 emsdk 環境，例如：
  # & "$env:EMSDK_PATH\emsdk.ps1" activate latest
  # 或使用舊版 cmd/env 腳本（視安裝版本而定）：. "$env:EMSDK_PATH\emsdk_env.ps1"
  emcc image-process.c -o image-process.js -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORTED_RUNTIME_METHODS="['HEAPU8']" -s ALLOW_MEMORY_GROWTH=1
  ```
- **產出**：成功產出 ES6 Module 膠水代碼 `image-process.js` 與 `image-process.wasm`。

### 階段三：前端 Glassmorphism 質感 UI 搭建 (`index.html`, `index.css`)
- **實作內容**：採用現代深色主題（Dark Mode），使用 HSL 色彩變數、`backdrop-filter: blur(16px)` 與微動畫。
- **排版規格限制**：左上（高度固定 `320px`，列表具備 `max-height` 滾動條）、右上（高度固定選項不遮擋）與下方（全寬預覽與狀態列）。

### 階段四：Canvas 預覽與互動模組 (`preview.js`)
- **實作內容**：利用 `ImagePreviewer` 類別管理 Canvas 繪圖與滑鼠、觸控事件。
- **快速預覽**：旋轉與灰階模式下，使用 Canvas 原生 `transform` 與 `filter` 進行即時預覽，避免頻繁調用 Wasm 影響流暢度。

### 階段五：核心邏輯與打包下載整合 (`index.js`)
- **實作內容**：加載 Wasm 模組、管理圖片清單（上移、下移、刪除、清空），並進行多圖長寬比例防呆檢查。
- **打包下載**：使用離屏 Canvas 取得像素，將資料複製進 Wasm HEAP，執行 C 函數後將處理後的 Blob 使用 JSZip 打包成 `image.zip` 下載。

### 階段六：實作模式文檔化 (`README.md`)
- **實作內容**：在 `README.md` 中新增「實作模式與協作流程」章節。
- **關鍵點**：詳細說明由人類主導規格與 API 設計、AI Agent (Antigravity) 進行程式碼實作與整合的開發模式，為未來參與此專案的 AI 代理人提供清晰的背景脈絡。

### 階段七：簡報與投影片產出 (`docs/presentation/`)
- **實作內容**：建立簡報發想檔案 `suggestions.md`、Markdown 格式投影片 `slides.md`，並使用 Vanilla JS & CSS 設計了動態、美觀且具備進度條與鍵盤控制功能的簡報網頁 `slides.html`。
- **關鍵點**：在文檔與 HTML 簡報中全面使用相對路徑連結（例如 `[image-process.c](../../image-process.c)`），確保所有環境下連結點擊之相容性，並提供極致暗色科技美學（Dark Mode）與一鍵列印成 PDF 的功能。

---

## 2. 遇到的阻礙與解決方案

我們在開發與測試階段面臨了以下技術挑戰，並透過相對應的代碼優化與設計模式予以解決：

### 項目一：Wasm 批次處理時的記憶體洩漏風險 (Memory Leak)
- **阻礙描述**：當使用者批次上傳多張大圖（每張可能達數百萬像素）時，如果其中有一張圖片在運算中出錯，或者直接進行循環運算，JS 分配的 Wasm 記憶體（透過 `Module._allocMemory` 申請）若沒有被及時釋放，會導致 Wasm 線性記憶體（Linear Memory）迅速耗盡，進而引發瀏覽器頁面崩潰或 Tab 重新整理。
- **解決方案**：在遍歷圖片的迴圈中，將分配記憶體與 C 運算邏輯包覆在 `try` 中，並將 `_freeMemory` 的呼叫放在 `finally` 中。這確保了不論圖片處理成功、失敗還是拋出異常，Wasm 的記憶體指標都一定會被釋放。
  ```javascript
  try {
      srcPtr = wasmModule._allocMemory(srcSize);
      wasmModule.HEAPU8.set(pixels, srcPtr);
      // 呼叫 Wasm 核心運算函數...
  } finally {
      if (srcPtr) wasmModule._freeMemory(srcPtr);
      if (dstPtr) wasmModule._freeMemory(dstPtr);
  }
  ```

### 項目二：裁切框在不同解析度圖片間的自適應與事件判定
- **阻礙描述**：當上傳 4K 大圖時，網頁上的 Canvas 是以 CSS `max-width: 100%` 進行等比縮放顯示的。直接在滑鼠事件中（如 `offsetX`）使用像素坐標會導致裁切框大小混亂。此外，當切換不同解析度的圖片時，裁切框如果不做適應，會讓裁切結果移位或超出邊界。
- **解決方案**：在 `preview.js` 中將裁切框的位置與大小完全使用 `0.0` 到 `1.0` 的百分比保存（Percent Box）。
  1. 使用 `canvas.getBoundingClientRect()` 獲取 CSS 顯示大小，將滑鼠位置轉為百分比：
     `const clickXPercent = (e.clientX - rect.left) / rect.width`
  2. 渲染時，將百分比乘以 Canvas 的實際解析度：
     `const cx = cropPercent.x * canvas.width`
  3. 批次處理時，用百分比乘以每張圖片各自的原始像素：
     `const cw = Math.round(cropPercent.w * w)`
  這使裁切框能完美自適應任何圖片尺寸，並且當切換不同圖片時，相同的百分比會被正確地套用在不同寬高比的圖片上。

### 項目三：DOM 覆寫導致按鈕文字更新失效 Bug (經典 Bug)
- **阻礙描述**：在執行批次處理時，我們為了顯示 Loading Spinner，使用 `innerHTML` 覆寫了執行按鈕：
  `btnExecuteProcess.innerHTML = '<div class="spinner"></div> <span>處理中...</span>'`
  這導致了原本在全域宣告中快照引用的 `const btnExecuteText = document.getElementById('btn-execute-text')` 物件所對應的 DOM 節點被永久銷毀。處理完成後，雖然執行了 `btnExecuteText.textContent = '...'`，但由於引用指向已被銷毀的舊節點，導致執行按鈕文字變為空字串。
- **解決方案**：廢除開頭宣告的全域 `btnExecuteText` 快照。每次需要更新按鈕文字時，皆使用 `document.getElementById('btn-execute-text')` 進行即時查詢，或者在重置按鈕 `innerHTML` 的同時，動態查詢新建立的 span 元素並更新文字。這徹底解決了節點被銷毀後無法寫入文字的 Bug。

---

## 3. 使用者回報錯誤之調試記錄 (Debug Log)

在完成初版實作後，根據使用者測試回報，我們針對以下兩個問題進行了調試與修正：

### 項目一：處理預覽區的 Placeholder 與實際預覽同時呈現
- **阻礙描述**：上傳圖片並載入預覽後，Canvas 正確繪製了預覽圖片與裁切框，但背景仍能看見「請先上傳並選擇一張圖片以進行預覽」的 Placeholder 文字與圖示。
- **原因分析**：在 `index.js` 的 `setActiveImage` 中，代碼執行了 `previewPlaceholder.classList.add('hidden')` 與 `canvasWrapper.classList.remove('hidden')`。然而在樣式表 `index.css` 中，完全沒有定義 `.hidden` 工具類別，導致 `classList.add` 無實質隱藏效果。
- **解決方案**：在 `index.css` 的結尾處新增工具類別定義，強制覆寫所有顯示樣式：
  ```css
  .hidden {
      display: none !important;
  }
  ```

### 項目二：僅剩最後一張圖片時按刪除需要按兩次
- **阻礙描述**：在圖片管理清單中僅剩最後一張圖片時，點擊該項目的「刪除」按鈕，清單上仍會殘留該項 HTML，必須再點擊一次刪除按鈕才會將其清除。
- **原因分析**：在 `index.js` 的 `deleteImage` 中，如果被刪除的圖片是當前活動預覽的圖片（`activeImageId === imageId`），且列表變為空，代碼走 `else` 子分支重置預覽區的隱藏狀態。但在該分支中**漏掉了對 `renderImageList()` 的調用**，導致最後一張圖片的 DOM 項目未能即時在畫面上被重繪清除。
- **解決方案**：重構 `deleteImage` 函數邏輯，確保在任何刪除分支（不論是刪除選中項、非選中項，或是刪除最後一項使清單變為空時）的最後，皆確實執行 `renderImageList()`，使 UI 清單與底層資料狀態始終保持即時同步。

### 項目三：旋轉功能有三列參數設定導致參數設定區固定高度不夠高
- **阻礙描述**：當使用者選擇「旋轉」處理功能時，參數設定卡片會多展開一列「旋轉角度」設定。由於原卡片固定高度設定為 `320px`，這導致卡片內部空間不足以完全呈現三列選項與底部的執行按鈕，進而使「執行批次旋轉」按鈕被溢出截斷或遮擋，無法完整顯示與操作。
- **原因分析**：在 `index.css` 中限制了上方卡片高度為固定值：`.upload-card, .settings-card { height: 320px; }`。固定高度在動態選單增多時缺乏彈性，在經過 `360px` 的初步調整後，在特定字型與 padding 下仍有緊湊溢出的風險，需提供更寬裕的安全邊際。
- **解決方案**：
  1. 將上方卡片固定高度調高至 **`380px`**，為參數區提供最充足的垂直安全空間，保證三列參數設定與執行按鈕完全呈現：
     ```css
     .upload-card, .settings-card {
         height: 380px;
     }
     ```
  2. 同步將左側圖片清單 `.image-list-container` 的最大高度 `max-height` 提高至 **`245px`**，以維持兩側卡片排版的高度對稱性與美觀性。

### 項目四：-webkit-background-clip 缺少標準屬性警告 (Lint Warning)
- **阻礙描述**：在 CSS 的 `h1` 標題樣式中，我們僅寫了前綴屬性 `-webkit-background-clip: text` 以配合漸層填充，但未定義標準無前綴的 `background-clip` 屬性。這在 Lint 工具或代碼相容性分析器中觸發了相容性警告，提示可能造成部分現代瀏覽器相容問題。
- **原因分析**：雖然 Chrome 與 Safari 完美相容 `-webkit-` 前綴，但 W3C 標準中已將 `background-clip: text` 收錄為標準規格。最佳實作必須同時聲明前綴屬性與標準屬性，且依層疊規則將標準屬性置後，以便未來引擎優先解析。
- **解決方案**：在 `index.css` 的 `h1` 類別中，於前綴屬性正下方加載標準的 `background-clip: text` 定義：
  ```css
  h1 {
      -webkit-background-clip: text;
      background-clip: text;
  }
  ```


