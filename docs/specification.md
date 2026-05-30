# WebAssembly 圖片批次處理工具 規格書 (Specification)

請依據以下規格，實作 WebAssembly 圖片批次處理工具。

---

### 🛠️ 技術棧要求
1. **C 語言**: 核心處理邏輯，需相容 Emscripten。
2. **Web 前端**: Vanilla HTML, Vanilla CSS (使用 Dark Mode 質感設計), Vanilla ES6 JavaScript (使用 ES6 Module 載入 Wasm)。
3. **第三方庫**: 使用 CDN 引入 JSZip (用於打包 ZIP 檔案)。

---

### 📂 專案結構
專案須包含以下四個核心檔案：
1. `image-process.c`: 負責圖片裁切、旋轉、灰階等像素運算。
2. `index.html`: 前端使用者介面，包含圖片上傳、設定面版、畫布預覽。
3. `index.js`: 前端核心互動邏輯，負責控制 Wasm 模組、記憶體分配與打包，並整合各模組。
4. `preview.js`: 負責處理圖片預覽區相關的互動與繪圖邏輯（例如 Canvas 預覽、裁切框的繪製與滑鼠事件監聽等）。

---

### ⚙️ 詳細規格說明

#### 一、 C 語言核心 (`image-process.c`)
C 側要有以下結構體定義：
```c
typedef struct {
    uint8_t r, g, b, a;
} Pixel;
```

必須包含以下函數，並使用 `EMSCRIPTEN_KEEPALIVE` 導出：
1. **記憶體管理**:
    - `uint8_t* allocMemory(int size)`: 調用 `malloc` 分配記憶體，並返回指針，以便 JS 寫入/讀取像素資料。
    - `void freeMemory(void* ptr)`: 調用 `free` 釋放記憶體，避免記憶體洩漏。
2. **圖片處理算法**:
  - `void cropImage(uint8_t* src_ptr, int sw, int sh, int x, int y, int cw, int ch, uint8_t* dst_ptr)`:
    - 輸入：原始圖片指針、原始寬高、裁剪起點 (x, y)、裁剪寬高 (cw, ch)。
    - 輸出：將裁剪後的像素數據寫入 `dst_ptr`。
  - `void rotateImage(uint8_t* src_ptr, int w, int h, int degree, uint8_t* dst_ptr)`:
    - 支援 90、180、270 度旋轉。
    - 旋轉 90 與 270 度時，輸出目標的寬高會互換。將旋轉後的像素寫入 `dst_ptr`。
  - `void applyGrayscale(uint8_t* img_ptr, int w, int h)`:
    - 就地（In-place）將傳入的像素轉換為灰階。
    - 灰階計算公式使用亮度法：`gray = (r * 77 + g * 150 + b * 29) >> 8`。

*註：像素格式皆為 RGBA（每個像素佔 4 bytes）。*

#### 二、 前端使用者介面 (`index.html`)
請設計一個現代感、深色主題（Dark Mode）的響應式版面，版面配置與限制如下：
- **版面佈局**：
  - **檔案上傳與管理區** 放在**左上方**，**參數設定區** 放在**右上方**，下方則為整個寬度的**處理預覽區**。
  - 左上方區塊與右上方區塊的高度（height）固定。
  - 左上方的圖片清單區塊之高度需足夠呈現至少四列圖片；當圖片清單隨著使用者上傳更多圖片而超出時，該清單區塊需出現直向滾動條（scrollbar）。
  - 右上方參數設定區的高度需固定，且足夠完整呈現所有設定選項，不被遮擋。

主要分為三大區塊：
1. **檔案上傳與管理區**:
  - 支援多圖上傳（限制格式為 `.jpg, .jpeg, .png, .webp`）。
  - 顯示已上傳的圖片清單，清單中每張圖片要有「上移」、「下移」、「刪除」以及「預覽」按鈕。
  - 提供「清空」按鈕。
2. **參數設定區**:
  - **功能選擇**: 裁切（預設）、旋轉、灰階濾鏡。
  - **旋轉角度** (僅在選擇旋轉時顯示): 90 度、180 度、270 度。
  - **輸出格式**: JPG、PNG、WEBP。
  - **執行按鈕**: 依據所選功能動態調整文字（如「執行裁切」、「執行旋轉」）。
3. **處理預覽區**:
  - 包含一個 `<canvas>`，用於即時展示當前選中圖片的預覽效果。
  - 當選擇「裁切」時，允許使用者在 Canvas 上按住滑鼠拖曳框選（Crop Box）。框選時需有藍色半透明遮罩或邊框，**不必在框上方顯示當前選取的解析度**。
  - 當切換不同尺寸的圖片時，裁切框需按比例自動適應。
  - 底部顯示目前的狀態文字（例如：「預覽中: photo.jpg (800x600) - 框選進行裁切」）。

#### 三、 前端邏輯與 Wasm 整合 (`index.js` 及 `preview.js`)
1. **Wasm 載入**:
  - 使用 `import createModule from './image-process.js'` 導入 Emscripten 產生的膠水程式碼，並在初始化時載入模組。
2. **預覽邏輯 (切分至 `preview.js`)**:
  - 圖片預覽與互動相關的 JS 程式碼應完整切分至 `preview.js` 模組中。
  - 非「裁切」模式下（如旋轉或灰階），使用 HTML5 Canvas 內建的 `filter` 或 `ctx.transform` 進行快速預覽，無須每次都調用 Wasm。
  - 「裁切」模式下，Canvas 要繪製暗化的原圖，並將框選區域明亮顯示，同時追蹤滑鼠事件以更新選取範圍。
3. **批次處理與打包下載邏輯 (點擊「執行」按鈕時)**:
  - **防呆檢查**:
    - 批次處理前，若為裁切模式，必須確保用戶已框選範圍。
    - 若為裁切模式，檢查所有待處理圖片的**寬高比例**是否一致（不得有任何比例差異），若不一致則彈出警告「所有圖片比例必須相同才能套用同比例裁切」。
  - **Wasm 記憶體讀寫迴圈**:
    - 遍歷所有圖片，使用離屏 Canvas 取得圖片的 `ImageData.data` (Uint8ClampedArray)。
    - 計算所需的輸入與輸出記憶體大小 (`width * height * 4` bytes)。
    - 呼叫 `Module._allocMemory` 分配 Wasm 記憶體。
    - 使用 `Module.HEAPU8.set` 將像素複製進 Wasm 記憶體。
    - 根據選取的功能，呼叫對應的 Wasm 函數：
      - **裁切**: `Module._cropImage(...)`，將裁切比例套用至每張圖的實際解析度。
      - **旋轉**: `Module._rotateImage(...)`。
      - **灰階**: `Module._applyGrayscale(...)`。
    - 從 `Module.HEAPU8.subarray` 讀回處理後的像素，寫入離屏 Canvas，並調用 `toBlob` 轉為對應的圖片格式。
    - **重要**：處理完每張圖片後，必須調用 `Module._freeMemory` 釋放已分配的輸入/輸出指針。
  - **ZIP 打包**:
    - 使用 `JSZip` 將所有處理後的圖片 Blob 加入壓縮檔。
    - 檔名規則：保持上傳時的原檔名，僅副檔名根據實際的輸出格式變動（不加任何 `_processed` 後綴）。
    - 處理完成後，自動觸發瀏覽器下載 `image.zip`，並在畫面上顯示「完成！」。
