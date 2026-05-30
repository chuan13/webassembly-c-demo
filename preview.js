/**
 * @typedef {Object} PercentBox
 * @property {number} x - 裁切框左上角 X 百分比 (0.0 到 1.0)
 * @property {number} y - 裁切框左上角 Y 百分比 (0.0 到 1.0)
 * @property {number} w - 裁切框寬度百分比 (0.0 到 1.0)
 * @property {number} h - 裁切框高度百分比 (0.0 到 1.0)
 */

/**
 * @typedef {Object} Point
 * @property {number} x - X 座標
 * @property {number} y - Y 座標
 */

/**
 * 圖片處理預覽與互動模組
 */
export class ImagePreviewer {
    /**
     * @param {HTMLCanvasElement} canvas - 用於預覽的 Canvas 元素
     */
    constructor(canvas) {
        /** @type {HTMLCanvasElement} */
        this.canvas = canvas;
        /** @type {CanvasRenderingContext2D} */
        this.ctx = canvas.getContext('2d');
        
        /** @type {HTMLImageElement|null} */
        this.img = null;
        
        /** @type {'crop'|'rotate'|'grayscale'} */
        this.mode = 'crop';
        
        /** @type {90|180|270} */
        this.rotationAngle = 90;
        
        /**
         * 目前裁切框百分比，預設居中 80% 大小
         * @type {PercentBox}
         */
        this.cropPercent = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
        
        // 互動狀態
        /** @type {'idle'|'moving'|'resizing'|'creating'} */
        this.dragState = 'idle';
        /** @type {Point} */
        this.dragStart = { x: 0, y: 0 };
        /** @type {PercentBox} */
        this.dragStartBox = { x: 0, y: 0, w: 0, h: 0 };
        /** @type {string|null} */
        this.resizeHandle = null; // 'nw', 'ne', 'se', 'sw' 等
        
        // 註冊滑鼠與觸控事件
        this._initEvents();
    }

    /**
     * 設定預覽模式
     * @param {'crop'|'rotate'|'grayscale'} mode - 模式名稱
     */
    setMode(mode) {
        this.mode = mode;
        this.render();
    }

    /**
     * 設定目前預覽的圖片
     * @param {HTMLImageElement} imgElement - 圖片元素
     */
    setImage(imgElement) {
        this.img = imgElement;
        // 注意：不重置裁切百分比，除非之前沒有設定過。
        // 這能確保切換圖片時，裁切框按比例自動適應。
        this.render();
    }

    /**
     * 設定旋轉角度 (用於旋轉模式預覽)
     * @param {90|180|270} angle - 角度值
     */
    setRotation(angle) {
        this.rotationAngle = angle;
        if (this.mode === 'rotate') {
            this.render();
        }
    }

    /**
     * 獲取裁切框百分比
     * @returns {PercentBox}
     */
    getCropBoxPercent() {
        return { ...this.cropPercent };
    }

    /**
     * 設定裁切框百分比
     * @param {PercentBox} percentBox 
     */
    setCropBoxPercent(percentBox) {
        this.cropPercent = {
            x: Math.max(0, Math.min(1, percentBox.x)),
            y: Math.max(0, Math.min(1, percentBox.y)),
            w: Math.max(0.01, Math.min(1 - percentBox.x, percentBox.w)),
            h: Math.max(0.01, Math.min(1 - percentBox.y, percentBox.h))
        };
        this.render();
    }

    /**
     * 執行畫布渲染
     */
    render() {
        if (!this.img) return;

        const w = this.img.naturalWidth;
        const h = this.img.naturalHeight;

        // 重設 Filter
        this.ctx.filter = 'none';

        if (this.mode === 'rotate') {
            // 旋轉模式預覽
            const angle = this.rotationAngle;
            if (angle === 90 || angle === 270) {
                this.canvas.width = h;
                this.canvas.height = w;
            } else {
                this.canvas.width = w;
                this.canvas.height = h;
            }

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.save();
            
            // 進行畫布轉換以預覽旋轉
            if (angle === 90) {
                this.ctx.translate(h, 0);
                this.ctx.rotate((90 * Math.PI) / 180);
            } else if (angle === 180) {
                this.ctx.translate(w, h);
                this.ctx.rotate((180 * Math.PI) / 180);
            } else if (angle === 270) {
                this.ctx.translate(0, w);
                this.ctx.rotate((270 * Math.PI) / 180);
            }
            
            this.ctx.drawImage(this.img, 0, 0);
            this.ctx.restore();
            
        } else if (this.mode === 'grayscale') {
            // 灰階模式預覽 (利用 Canvas filter)
            this.canvas.width = w;
            this.canvas.height = h;
            this.ctx.clearRect(0, 0, w, h);
            this.ctx.save();
            this.ctx.filter = 'grayscale(100%)';
            this.ctx.drawImage(this.img, 0, 0);
            this.ctx.restore();
            
        } else {
            // 裁切模式預覽
            this.canvas.width = w;
            this.canvas.height = h;
            this.ctx.clearRect(0, 0, w, h);

            // 1. 繪製完整的原圖
            this.ctx.drawImage(this.img, 0, 0);

            // 2. 繪製半透明的黑色遮罩
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(0, 0, w, h);

            // 3. 計算裁切框的實際像素坐標
            const cx = this.cropPercent.x * w;
            const cy = this.cropPercent.y * h;
            const cw = this.cropPercent.w * w;
            const ch = this.cropPercent.h * h;

            // 4. 重繪裁切框內的圖像 (使其呈現 100% 亮度)
            if (cw > 0 && ch > 0) {
                this.ctx.drawImage(this.img, cx, cy, cw, ch, cx, cy, cw, ch);
            }

            // 5. 繪製亮藍色邊框
            this.ctx.strokeStyle = 'hsl(210, 100%, 60%)';
            this.ctx.lineWidth = Math.max(2, w / 400); // 隨解析度調整線條寬度以求清晰
            this.ctx.strokeRect(cx, cy, cw, ch);

            // 6. 繪製拖曳控制角點 (白色小方塊)
            const handleSize = Math.max(6, w / 150);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = 'hsl(210, 100%, 60%)';
            this.ctx.lineWidth = Math.max(1, w / 600);

            const corners = [
                { x: cx, y: cy }, // nw
                { x: cx + cw, y: cy }, // ne
                { x: cx + cw, y: cy + ch }, // se
                { x: cx, y: cy + ch } // sw
            ];

            corners.forEach(p => {
                this.ctx.fillRect(p.x - handleSize/2, p.y - handleSize/2, handleSize, handleSize);
                this.ctx.strokeRect(p.x - handleSize/2, p.y - handleSize/2, handleSize, handleSize);
            });
        }
    }

    /**
     * 初始化事件監聽
     * @private
     */
    _initEvents() {
        // 滑鼠按下
        this.canvas.addEventListener('mousedown', (e) => this._onStart(e));
        // 滑鼠移動
        window.addEventListener('mousemove', (e) => this._onMove(e));
        // 滑鼠放開
        window.addEventListener('mouseup', () => this._onEnd());

        // 觸控支援
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this._onStart(e.touches[0]);
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (this.dragState !== 'idle' && e.touches.length === 1) {
                this._onMove(e.touches[0]);
                e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('touchend', () => this._onEnd());
    }

    /**
     * 滑鼠或觸控開始
     * @param {MouseEvent|Touch} e 
     * @private
     */
    _onStart(e) {
        if (!this.img || this.mode !== 'crop') return;

        const rect = this.canvas.getBoundingClientRect();
        
        // 算出滑鼠在 Canvas display 上的比例坐標
        const clickXPercent = (e.clientX - rect.left) / rect.width;
        const clickYPercent = (e.clientY - rect.top) / rect.height;

        this.dragStart = { x: clickXPercent, y: clickYPercent };
        this.dragStartBox = { ...this.cropPercent };

        // 判定點擊落點 (角點檢測，使用顯示尺寸的容差)
        const hitTolerance = 15 / rect.width; // 15px 容差
        const hitToleranceY = 15 / rect.height;

        const cx = this.cropPercent.x;
        const cy = this.cropPercent.y;
        const cw = this.cropPercent.w;
        const ch = this.cropPercent.h;

        // 檢查四個角
        if (Math.abs(clickXPercent - cx) < hitTolerance && Math.abs(clickYPercent - cy) < hitToleranceY) {
            this.dragState = 'resizing';
            this.resizeHandle = 'nw';
        } else if (Math.abs(clickXPercent - (cx + cw)) < hitTolerance && Math.abs(clickYPercent - cy) < hitToleranceY) {
            this.dragState = 'resizing';
            this.resizeHandle = 'ne';
        } else if (Math.abs(clickXPercent - (cx + cw)) < hitTolerance && Math.abs(clickYPercent - (cy + ch)) < hitToleranceY) {
            this.dragState = 'resizing';
            this.resizeHandle = 'se';
        } else if (Math.abs(clickXPercent - cx) < hitTolerance && Math.abs(clickYPercent - (cy + ch)) < hitToleranceY) {
            this.dragState = 'resizing';
            this.resizeHandle = 'sw';
        } else if (clickXPercent >= cx && clickXPercent <= cx + cw && clickYPercent >= cy && clickYPercent <= cy + ch) {
            // 點在框內：移動框
            this.dragState = 'moving';
        } else {
            // 點在框外：重新建立一個新框
            this.dragState = 'creating';
            this.cropPercent = { x: clickXPercent, y: clickYPercent, w: 0, h: 0 };
        }
    }

    /**
     * 滑鼠或觸控移動
     * @param {MouseEvent|Touch} e 
     * @private
     */
    _onMove(e) {
        if (this.dragState === 'idle' || !this.img) return;

        const rect = this.canvas.getBoundingClientRect();
        
        // 目前滑鼠比例坐標，限制在 0.0 ~ 1.0 之間
        const currentXPercent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const currentYPercent = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

        const dx = currentXPercent - this.dragStart.x;
        const dy = currentYPercent - this.dragStart.y;

        if (this.dragState === 'moving') {
            // 平移裁切框，確保不越界
            let newX = this.dragStartBox.x + dx;
            let newY = this.dragStartBox.y + dy;

            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX + this.dragStartBox.w > 1) newX = 1 - this.dragStartBox.w;
            if (newY + this.dragStartBox.h > 1) newY = 1 - this.dragStartBox.h;

            this.cropPercent.x = newX;
            this.cropPercent.y = newY;
            
        } else if (this.dragState === 'resizing') {
            // 縮放裁切框
            const box = { ...this.dragStartBox };
            
            if (this.resizeHandle === 'se') {
                this.cropPercent.w = Math.max(0.01, Math.min(1 - box.x, box.w + dx));
                this.cropPercent.h = Math.max(0.01, Math.min(1 - box.y, box.h + dy));
            } else if (this.resizeHandle === 'sw') {
                const targetW = box.w - dx;
                if (targetW > 0.01 && box.x + dx >= 0) {
                    this.cropPercent.x = box.x + dx;
                    this.cropPercent.w = targetW;
                }
                this.cropPercent.h = Math.max(0.01, Math.min(1 - box.y, box.h + dy));
            } else if (this.resizeHandle === 'ne') {
                this.cropPercent.w = Math.max(0.01, Math.min(1 - box.x, box.w + dx));
                const targetH = box.h - dy;
                if (targetH > 0.01 && box.y + dy >= 0) {
                    this.cropPercent.y = box.y + dy;
                    this.cropPercent.h = targetH;
                }
            } else if (this.resizeHandle === 'nw') {
                const targetW = box.w - dx;
                const targetH = box.h - dy;
                if (targetW > 0.01 && box.x + dx >= 0) {
                    this.cropPercent.x = box.x + dx;
                    this.cropPercent.w = targetW;
                }
                if (targetH > 0.01 && box.y + dy >= 0) {
                    this.cropPercent.y = box.y + dy;
                    this.cropPercent.h = targetH;
                }
            }
            
        } else if (this.dragState === 'creating') {
            // 重新拉出框
            const startX = this.dragStart.x;
            const startY = this.dragStart.y;
            
            const x = Math.min(startX, currentXPercent);
            const y = Math.min(startY, currentYPercent);
            const w = Math.abs(currentXPercent - startX);
            const h = Math.abs(currentYPercent - startY);

            this.cropPercent = { x, y, w, h };
        }

        // 進行重繪
        this.render();
    }

    /**
     * 結束拖曳
     * @private
     */
    _onEnd() {
        if (this.dragState === 'idle') return;

        // 如果重新建立框的寬或高太小 (小於 1%)，則還原回預設大小 (80% 居中)
        if (this.dragState === 'creating' || this.dragState === 'resizing') {
            if (this.cropPercent.w < 0.015 || this.cropPercent.h < 0.015) {
                this.cropPercent = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
                this.render();
            }
        }

        this.dragState = 'idle';
        this.resizeHandle = null;
    }
}
