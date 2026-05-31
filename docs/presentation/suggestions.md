# 5 分鐘 WebAssembly 圖片批次處理專案報告建議與大綱

這份文件針對本專案的 5 分鐘報告進行重點發想與結構規劃。我們把報告拆解為三大核心區塊，並補充了技術深度十足的「遺漏亮點」，讓您的報告既有理論深度、又有實作亮點。

---

## ⏱️ 5 分鐘時間分配建議 (Time Budget)

| 時間 | 區塊主題 | 核心講解內容 |
| :--- | :--- | :--- |
| **0:00 - 0:30 (30s)** | **專案簡介** | 本專案的痛點（瀏覽器批次處理大量圖片的效能問題）與 WebAssembly 解決方案。 |
| **0:30 - 2:00 (90s)** | **C 側技術：`uint8_t` 與 `Pixel` 轉型** | 記憶體連續性、結構體無 padding 對齊、指針轉型的底層原理與 In-place 效能。 |
| **2:00 - 3:30 (90s)** | **Wasm 與 JS 數據交換** | Linear Memory 模型、`HEAPU8` 視圖、手動記憶體管理（`malloc`/`free`）以防洩漏。 |
| **3:30 - 4:30 (60s)** | **AI Agent 協作開發** | 如何建立自動化的「寫 code -> 部署 -> 瀏覽器測試 -> 修復」閉環 (Feedback Loop)。 |
| **4:30 - 5:00 (30s)** | **總結與 Q&A** | 核心收穫與效能對比總結。 |

---

## 💡 值得補充的「技術遺漏點」與說明

### 1. C 側：指針轉換的「硬核」原理
在 [image-process.c](../../image-process.c) 中，我們看到 `Pixel* src = (Pixel*)src_ptr;`。這裡非常值得向聽眾解釋**為什麼可以這樣轉型**：
*   **記憶體連續性 (Memory Layout)**：HTML5 Canvas 的 `ImageData.data` 是一個一維的 `Uint8ClampedArray`，其內部的排列順序是 `[R, G, B, A, R, G, B, A...]`。
*   **結構體對齊與無 Padding (Struct Alignment)**：
    ```c
    typedef struct {
        uint8_t r;
        uint8_t g;
        uint8_t b;
        uint8_t a;
    } Pixel;
    ```
    因為 `uint8_t` 大小為 1 byte，所以 `Pixel` 結構體的總大小恰好是 4 bytes。在 32-bit 或 64-bit 系統中，4 bytes 剛好能天然對齊，**不會被編譯器插入任何 Padding 字節**。因此，`Pixel` 在記憶體中的二進位結構，與 Canvas 的 RGBA 陣列完全一致。
*   **指標算術 (Pointer Alignment)**：這使得我們可以利用 `dst[i] = src[j]` 這種類似陣列的語法來存取像素，底層編譯出來的組合語言會自動將索引乘以 4，達到極致的存取效率。

### 2. JS / Wasm 側：記憶體「生命週期」與「無拷貝讀取」
在 [index.js](../../index.js) 中，JS 與 WebAssembly 之間的溝通只透過 **線性記憶體 (Linear Memory)**。這裡有兩個極具價值的亮點：
*   **指針本質上是整數 (Numbers)**：在 JS 中，`srcPtr` 和 `dstPtr` 只是數字（記憶體偏移量），JS 不能直接操作它們指向的 C 語言對象，必須透過 `wasmModule.HEAPU8` 來當作中間介面。
*   **手動記憶體管理 (Manual Memory Management)**：
    > [!IMPORTANT]
    > **Wasm 記憶體不會被 JavaScript 的垃圾回收 (GC) 自動釋放！**  
    > 批次處理（例如處理 100 張圖）時，如果在迴圈中調用 `_allocMemory` 而沒有成對地在 `finally` 區塊調用 `_freeMemory`，瀏覽器的分頁會立刻因為記憶體洩漏 (Memory Leak) 而崩潰。這是一個非常真實且重要的工程實踐挑戰。
*   **無拷貝性能優化 (Zero-copy View)**：
    我們使用 `wasmModule.HEAPU8.subarray(dstPtr, dstPtr + dstSize)`。`subarray` 與 `slice` 不同，它**不會複製記憶體**，而是建立一個輕量級的 TypedArray 視圖，直接映射到 Wasm 的線性記憶體中。這使我們在讀取 Wasm 輸出時達到零拷貝 (Zero-copy) 的極致性能。

### 3. AI Agent 實作：閉環自動化測試 (Feedback Loop)
給予 Agent `serve` 指令和 `chrome-devtools-mcp` 可以提煉為 **「Agent 自動化閉環 (Feedback Loop)」** 的概念：
*   **需求精準化**：提供明確的輸入輸出規格（例如 C 側定義無狀態的純函數，JS 側負責 Canvas 轉換與 Zip 壓縮），實現前後端分離的清晰架構。
*   **測試閉環**：
    1.  Agent 撰寫完代碼後，使用 `pnpm dlx serve` 架設本地伺服器。
    2.  利用 `chrome-devtools-mcp` 控制 Chrome 瀏覽器，自動模擬上傳圖片、點擊執行按鈕。
    3.  Agent 自動檢測瀏覽器主控台 (Console) 有無報錯（如 Wasm 未定義、記憶體溢出）。
    4.  若有報錯，Agent 自行讀取錯誤日誌，回頭修改代碼，直到測試通過。
    *這代表人類工程師不用當 Agent 的「人肉測試機」，Agent 自己就具備完整的除錯與驗證能力。*
