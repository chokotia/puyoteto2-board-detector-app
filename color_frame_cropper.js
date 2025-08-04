class ColorFrameCropper {
    constructor() {
        this.version = "1.0.0";
    }

    // Base64画像をImageDataに変換
    async base64ToImageData(base64) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                resolve(imageData);
            };
            img.src = base64;
        });
    }

    // ImageDataをBase64に変換
    imageDataToBase64(imageData) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    }

    // BGRからHSVに変換
    bgrToHsv(b, g, r) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;

        let h = 0;
        if (diff !== 0) {
            if (max === r) h = ((g - b) / diff) % 6;
            else if (max === g) h = (b - r) / diff + 2;
            else h = (r - g) / diff + 4;
        }
        h = Math.round(h * 30);
        if (h < 0) h += 180;

        const s = max === 0 ? 0 : Math.round((diff / max) * 255);
        const v = Math.round(max * 255);

        return [h, s, v];
    }

    // カラーマスクを抽出
    extractColorMask(imageData, color) {
        const { width, height, data } = imageData;
        const mask = new Uint8Array(width * height);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const pixelIndex = i / 4;

            const [h, s, v] = this.bgrToHsv(b, g, r);
            let inRange = false;

            if (color === 'red') {
                const range1 = (h >= 0 && h <= 10) && (s >= 50) && (v >= 120);
                const range2 = (h >= 160 && h <= 180) && (s >= 50) && (v >= 120);
                inRange = range1 || range2;
            } else if (color === 'blue') {
                inRange = (h >= 85 && h <= 110) && (s >= 50) && (v >= 100);
            }

            mask[pixelIndex] = inRange ? 255 : 0;
        }

        return { mask, width, height };
    }

    // 内側から外側に向かって枠の境界を検出
    findFrameBoundariesInsideOut(maskData, width, height, minRatio = 0.7, searchRatioX = 0.1, searchRatioY = 0.05) {
        const maxSearchX = Math.floor(width * searchRatioX);
        const maxSearchY = Math.floor(height * searchRatioY);

        let left = 0;
        for (let x = maxSearchX; x >= 0; x--) {
            let colSum = 0;
            for (let y = 0; y < height; y++) {
                if (maskData[y * width + x] > 0) colSum++;
            }
            if (colSum > height * minRatio) {
                left = x + 1;
                break;
            }
        }

        let right = width;
        for (let x = width - maxSearchX - 1; x < width; x++) {
            let colSum = 0;
            for (let y = 0; y < height; y++) {
                if (maskData[y * width + x] > 0) colSum++;
            }
            if (colSum > height * minRatio) {
                right = x;
                break;
            }
        }

        let top = 0;
        let topFrameRemoved = false;
        for (let y = maxSearchY; y >= 0; y--) {
            let rowSum = 0;
            for (let x = 0; x < width; x++) {
                if (maskData[y * width + x] > 0) rowSum++;
            }
            if (rowSum > width * minRatio) {
                top = y + 1;
                topFrameRemoved = true;
                break;
            }
        }

        let bottom = height;
        for (let y = height - maxSearchY - 1; y < height; y++) {
            let rowSum = 0;
            for (let x = 0; x < width; x++) {
                if (maskData[y * width + x] > 0) rowSum++;
            }
            if (rowSum > width * minRatio) {
                bottom = y;
                break;
            }
        }

        return { left, right, top, bottom, topFrameRemoved };
    }

    // デバッグ画像を作成
    createDebugImage(originalImageData, boundaries, searchRatioX = 0.1, searchRatioY = 0.05, additionalTopCrop = 0) {
        const { width, height } = originalImageData;
        const { left, right, top, bottom, topFrameRemoved } = boundaries;
        
        const debugImageData = new ImageData(
            new Uint8ClampedArray(originalImageData.data),
            width,
            height
        );

        const drawRect = (x1, y1, x2, y2, color, thickness = 3) => {
            for (let t = 0; t < thickness; t++) {
                for (let x = x1; x <= x2; x++) {
                    if (y1 + t >= 0 && y1 + t < height) {
                        const idx = ((y1 + t) * width + x) * 4;
                        debugImageData.data[idx] = color[0];
                        debugImageData.data[idx + 1] = color[1];
                        debugImageData.data[idx + 2] = color[2];
                    }
                    if (y2 - t >= 0 && y2 - t < height) {
                        const idx = ((y2 - t) * width + x) * 4;
                        debugImageData.data[idx] = color[0];
                        debugImageData.data[idx + 1] = color[1];
                        debugImageData.data[idx + 2] = color[2];
                    }
                }
                for (let y = y1; y <= y2; y++) {
                    if (x1 + t >= 0 && x1 + t < width) {
                        const idx = (y * width + (x1 + t)) * 4;
                        debugImageData.data[idx] = color[0];
                        debugImageData.data[idx + 1] = color[1];
                        debugImageData.data[idx + 2] = color[2];
                    }
                    if (x2 - t >= 0 && x2 - t < width) {
                        const idx = (y * width + (x2 - t)) * 4;
                        debugImageData.data[idx] = color[0];
                        debugImageData.data[idx + 1] = color[1];
                        debugImageData.data[idx + 2] = color[2];
                    }
                }
            }
        };

        // 切り取り領域を青で描画
        drawRect(left, top, right - 1, bottom - 1, [255, 0, 0]);

        // 上枠が削除された場合、追加削除部分を赤線で描画
        if (topFrameRemoved && additionalTopCrop > 0) {
            const originalTop = top - additionalTopCrop;
            for (let x = left; x < right; x++) {
                if (originalTop >= 0 && originalTop < height) {
                    const idx = (originalTop * width + x) * 4;
                    debugImageData.data[idx] = 0;
                    debugImageData.data[idx + 1] = 0;
                    debugImageData.data[idx + 2] = 255;
                }
            }
        }

        // 検索範囲を薄い線で描画
        const searchX = Math.floor(width * searchRatioX);
        const searchY = Math.floor(height * searchRatioY);
        drawRect(searchX, searchY, width - searchX - 1, height - searchY - 1, [128, 128, 128], 1);

        return debugImageData;
    }

    // マスク画像を作成
    createMaskImage(maskData, width, height) {
        const maskImageData = new ImageData(width, height);
        for (let i = 0; i < maskData.length; i++) {
            const pixelIndex = i * 4;
            const value = maskData[i];
            maskImageData.data[pixelIndex] = value;
            maskImageData.data[pixelIndex + 1] = value;
            maskImageData.data[pixelIndex + 2] = value;
            maskImageData.data[pixelIndex + 3] = 255;
        }
        return maskImageData;
    }

    // 画像をクロップ
    cropImage(imageData, left, right, top, bottom) {
        const { width, height, data } = imageData;
        const cropWidth = right - left;
        const cropHeight = bottom - top;
        
        if (cropWidth <= 0 || cropHeight <= 0) return null;

        const croppedData = new Uint8ClampedArray(cropWidth * cropHeight * 4);
        
        for (let y = 0; y < cropHeight; y++) {
            for (let x = 0; x < cropWidth; x++) {
                const srcIndex = ((top + y) * width + (left + x)) * 4;
                const dstIndex = (y * cropWidth + x) * 4;
                
                croppedData[dstIndex] = data[srcIndex];
                croppedData[dstIndex + 1] = data[srcIndex + 1];
                croppedData[dstIndex + 2] = data[srcIndex + 2];
                croppedData[dstIndex + 3] = data[srcIndex + 3];
            }
        }
        
        return new ImageData(croppedData, cropWidth, cropHeight);
    }

    // ============================================
    // PUBLIC API METHODS
    // ============================================

    /**
     * 単一プレイヤーの枠を検出・削除
     * @param {string} base64Image - Base64画像データ
     * @param {string} player - '1P' (blue) or '2P' (red)
     * @param {Object} options - オプション設定
     * @returns {Promise<Object>} 処理結果
     */
    async processSinglePlayer(base64Image, player, options = {}) {
        const {
            debug = false,
            additionalTopCropRatio = 1/50,
            logCallback = null
        } = options;

        const log = logCallback || (() => {});
        const color = player === '1P' ? 'blue' : 'red';
        
        log(`🎯 Processing ${player} (${color}) frame...`);
        
        const imageData = await this.base64ToImageData(base64Image);
        const { mask, width, height } = this.extractColorMask(imageData, color);
        const boundaries = this.findFrameBoundariesInsideOut(mask, width, height);
        const { left, right, top, bottom, topFrameRemoved } = boundaries;

        // 結果の妥当性チェック
        if (right - left < width * 0.7 || bottom - top < height * 0.7) {
            log(`⚠️ Crop too small for ${player}, skipping.`);
            return { success: false, error: 'Crop too small', player };
        }

        if (left >= right || top >= bottom) {
            log(`⚠️ Invalid boundaries for ${player}, skipping.`);
            return { success: false, error: 'Invalid boundaries', player };
        }

        // 上枠削除処理
        let additionalTopCrop = 0;
        let finalTop = top;
        if (topFrameRemoved) {
            const cropHeight = bottom - top;
            additionalTopCrop = Math.floor(cropHeight * additionalTopCropRatio);
            finalTop = top + additionalTopCrop;
            log(`🔝 Top frame removed, cropping additional ${additionalTopCrop}px from top`);
        }

        // 追加削除後の妥当性チェック
        if (bottom - finalTop < height * 0.3) {
            log(`⚠️ Crop too small after additional top cropping for ${player}`);
            return { success: false, error: 'Crop too small after top cropping', player };
        }

        // 画像をクロップ
        const croppedImageData = this.cropImage(imageData, left, right, finalTop, bottom);
        
        const result = {
            success: true,
            player,
            cropped: {
                imageData: croppedImageData,
                base64: this.imageDataToBase64(croppedImageData)
            },
            boundaries: { left, right, top: finalTop, bottom, topFrameRemoved },
            info: {
                originalSize: { width, height },
                croppedSize: { width: right - left, height: bottom - finalTop },
                additionalTopCrop
            }
        };

        // デバッグ情報を追加
        if (debug) {
            const maskImageData = this.createMaskImage(mask, width, height);
            const debugImageData = this.createDebugImage(
                imageData, 
                { ...boundaries, top: finalTop }, 
                0.1, 
                0.05, 
                additionalTopCrop
            );

            result.debug = {
                mask: {
                    imageData: maskImageData,
                    base64: this.imageDataToBase64(maskImageData)
                },
                debugImage: {
                    imageData: debugImageData,
                    base64: this.imageDataToBase64(debugImageData)
                }
            };
        }

        log(`✅ Successfully processed ${player}`);
        return result;
    }

    /**
     * 両プレイヤーの枠を検出・削除
     * @param {string} base64Image - Base64画像データ
     * @param {Object} options - オプション設定
     * @returns {Promise<Object>} 処理結果
     */
    async processBothPlayers(base64Image, options = {}) {
        const { logCallback = null } = options;
        const log = logCallback || (() => {});
        
        log(`🎯 Processing both players (1P + 2P)...`);

        const results = {
            success: true,
            players: {},
            errors: []
        };

        // 1P (Blue) を処理
        try {
            const player1Result = await this.processSinglePlayer(base64Image, '1P', options);
            results.players['1P'] = player1Result;
            if (!player1Result.success) {
                results.errors.push(`1P: ${player1Result.error}`);
            }
        } catch (error) {
            results.errors.push(`1P: ${error.message}`);
            results.players['1P'] = { success: false, error: error.message, player: '1P' };
        }

        // 2P (Red) を処理
        try {
            const player2Result = await this.processSinglePlayer(base64Image, '2P', options);
            results.players['2P'] = player2Result;
            if (!player2Result.success) {
                results.errors.push(`2P: ${player2Result.error}`);
            }
        } catch (error) {
            results.errors.push(`2P: ${error.message}`);
            results.players['2P'] = { success: false, error: error.message, player: '2P' };
        }

        // 1P2P を処理
        try {
            const base64Image_1P = results.players["1P"].cropped.base64
            const player2Result = await this.processSinglePlayer(base64Image_1P, '1P2P', options);
            results.players['1P2P'] = player2Result;
            if (!player2Result.success) {
                results.errors.push(`1P2P: ${player2Result.error}`);
            }
        } catch (error) {
            results.errors.push(`1P2P: ${error.message}`);
            results.players['1P2P'] = { success: false, error: error.message, player: '1P2P' };
        }


        results.success = results.errors.length === 0;
        
        if (results.success) {
            log(`✅ Successfully processed both players`);
        } else {
            log(`⚠️ Completed with ${results.errors.length} errors`);
        }

        return results;
    }
}
