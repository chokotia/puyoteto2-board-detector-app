let session = null;
let uploadedImage = null;
let currentFumenUrl = '';

// ラベル名の定義
const LABEL_NAMES = [
    "_", "I", "O", "T", "L", "J", "S", "Z", "X"
];

// サンプル画像を読み込む（SAMPLE_IMAGESを使用）
function loadSampleImage() {
    if (typeof SAMPLE_IMAGES === 'undefined' || !Array.isArray(SAMPLE_IMAGES) || SAMPLE_IMAGES.length === 0) {
        showStatus('❌ エラー: サンプル画像が見つかりません', 'error');
        return;
    }

    const randomIndex = Math.floor(Math.random() * SAMPLE_IMAGES.length);
    const selectedImage = SAMPLE_IMAGES[randomIndex];

    const img = new Image();
    img.onload = function() {
        uploadedImage = img;
        
        // 新しいレイアウトで画像を表示（初期化も含む）
        showImagePreview(selectedImage);

        // モデルが読み込まれている場合は自動で分析開始
        if (session) {
            analyzeBoardImage();
        } else {
            showStatus('✅ サンプル画像が読み込まれました。モデルの読み込み完了をお待ちください。', 'success');
        }
    };
    img.onerror = function() {
        showStatus('❌ エラー: サンプル画像の読み込みに失敗しました', 'error');
    };
    img.src = selectedImage;
}

// 数字列をFumen用のフィールド文字列に変換
function convertToFumenField(numberString) {
    if (numberString.length !== 200) {
        throw new Error('数字列は200文字である必要があります');
    }
    
    let fumenField = '';
    
    // 10列×20行の数字列を処理
    // 上から下へ、左から右への順序でFumen形式に変換
    for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 10; col++) {
            const index = col * 20 + row; // 列優先の順序
            const number = parseInt(numberString[index]);
            const label = LABEL_NAMES[number];
            fumenField += label;
        }
    }
    
    return fumenField;
}

// 数字列からFumen URLを生成
function generateFumenUrl(numberString) {
    try {
        const fieldStr = convertToFumenField(numberString);
        const field = tetrisFumen.Field.create(fieldStr);
        
        const pages = [{ field, comment: '' }];
        const fumen = tetrisFumen.encoder.encode(pages);
        
        return `https://knewjade.github.io/fumen-for-mobile/#?d=${fumen}`;
        
    } catch (error) {
        console.error('Fumen URL生成エラー:', error);
        throw error;
    }
}

// Fumen URLを開く
function openFumenUrl() {
    if (currentFumenUrl) {
        window.open(currentFumenUrl, '_blank');
    }
}

// ONNXモデルをロード
async function loadModel() {
    try {
        showStatus('🔄 モデルを読み込み中...', 'loading');
        session = await ort.InferenceSession.create('./models/tetris_mobilenet_v3_small.onnx');

        showStatus('✅ モデルが正常に読み込まれました', 'success');
        console.log('モデル読み込み完了');
    } catch (error) {
        console.error('モデルの読み込みに失敗:', error);
        showStatus('❌ エラー: モデルファイル(tetris_mobilenet_v3_small.onnx)が見つかりません', 'error');
    }
}

// ステータス表示
function showStatus(message, type = '') {
    const statusDiv = document.getElementById('statusDiv');
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// 画像を前処理（224x224にリサイズして正規化）
function preprocessImage(imageElement, targetWidth = 224, targetHeight = 224) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);
    
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imageData.data;
    
    // RGB値を[0,1]に正規化
    const input = new Float32Array(1 * 3 * targetWidth * targetHeight);
    
    for (let i = 0; i < targetWidth * targetHeight; i++) {
        const r = data[i * 4] / 255.0;
        const g = data[i * 4 + 1] / 255.0;
        const b = data[i * 4 + 2] / 255.0;
        
        input[i] = r;
        input[targetWidth * targetHeight + i] = g;
        input[targetWidth * targetHeight * 2 + i] = b;
    }
    
    return input;
}

// 盤面分析メイン処理
async function analyzeBoardImage() {
    if (!session || !uploadedImage) return;
    
    // const analyzeBtn = document.getElementById('analyzeBtn');
    
    // analyzeBtn.disabled = true;
    // analyzeBtn.textContent = '🔍 分析中...';
    showStatus('📄 画像の前処理中（枠削除）...', 'loading');
    
     try {
        // 元の画像をCanvasに描画
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = uploadedImage.width;
        canvas.height = uploadedImage.height;
        ctx.drawImage(uploadedImage, 0, 0);
        
        // 枠削除の前処理を実行
        showStatus('🔄 枠削除処理を実行中...', 'loading');
        
        // canvasをbase64に変換
        const base64img = canvas.toDataURL('image/png');
        const cropper = new ColorFrameCropper();
        const cropperResults = await cropper.processBothPlayers(base64img);
        const croppedBase64 = cropperResults?.players["1P2P"]?.cropped?.base64;

        // croppedBase64をcanvasに変換
        const preprocessedCanvas = document.createElement('canvas');
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = () => {
                preprocessedCanvas.width = img.width;
                preprocessedCanvas.height = img.height;
                const ctx = preprocessedCanvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve();
            };
            img.onerror = reject;
            img.src = croppedBase64;
        });

        // 前処理後の画像をbase64でコンソール出力（目視確認用）
        console.log('🖼️ 前処理後の画像 (base64):', croppedBase64);
        
        // 前処理後の画像サイズを取得
        const preprocessedWidth = preprocessedCanvas.width;
        const preprocessedHeight = preprocessedCanvas.height;
        
        // セルサイズを再計算（前処理後の画像サイズに基づく）
        const cellWidth = preprocessedWidth / 10;
        const cellHeight = preprocessedHeight / 20;
        
        showStatus('🔄 盤面を10×20のセルに分割して分析中...', 'loading');
               
        const predictedLabels = [];
        
        // 10列×20行の各セルを処理
        for (let col = 0; col < 10; col++) {
            for (let row = 0; row < 20; row++) {
                // セル座標計算
                const x1 = Math.floor(col * cellWidth);
                const y1 = Math.floor(row * cellHeight);
                const x2 = Math.floor((col + 1) * cellWidth);
                const y2 = Math.floor((row + 1) * cellHeight);
                
                // セル画像を切り出し
                const cellCanvas = document.createElement('canvas');
                const cellCtx = cellCanvas.getContext('2d');
                const cellW = x2 - x1;
                const cellH = y2 - y1;
                
                cellCanvas.width = cellW;
                cellCanvas.height = cellH;
                cellCtx.drawImage(preprocessedCanvas, x1, y1, cellW, cellH, 0, 0, cellW, cellH);
                
                // セル画像をImageオブジェクトに変換
                let cellImg = new Image();
                await new Promise((resolve) => {
                    cellImg.onload = resolve;
                    cellImg.src = cellCanvas.toDataURL();
                });
                
                // 前処理
                const cellData = preprocessImage(cellImg);
                
                // 推論実行
                const inputTensor = new ort.Tensor('float32', cellData, [1, 3, 224, 224]);
                const outputMap = await session.run({ input: inputTensor });
                const output = outputMap.output.data;
                
                // 最大値のインデックスを取得
                let maxIndex = 0;
                let maxValue = output[0];
                // console.log("output", col, row, output);
                for (let i = 1; i < output.length; i++) {
                    if (output[i] > maxValue) {
                        maxValue = output[i];
                        maxIndex = i;
                    }
                }
                
                predictedLabels.push(maxIndex.toString());
                
                // 進捗表示
                const progress = Math.floor(((col * 20 + row + 1) / 200) * 100);
                showStatus(`🔄 分析中... ${progress}% (${col * 20 + row + 1}/200セル)`, 'loading');
            }
        }
        
        // 結果を表示
        const labelString = predictedLabels.join('');
        
        // テトリス盤面を描画
        showAnalysisResult(labelString);
        
        // Fumen URL生成
        try {
            currentFumenUrl = generateFumenUrl(labelString);
            showFumenButton();
            showStatus(`🎉 分析完了！Fumen譜面が生成されました`, 'success');
        } catch (fumenError) {
            console.error('Fumen URL生成エラー:', fumenError);
            currentFumenUrl = '';
            showStatus(`⚠️ 分析完了（Fumen URL生成でエラーが発生）`, 'error');
        }
        
        console.log(`予測結果: ${labelString}`);
        console.log(`Fumen URL: ${currentFumenUrl}`);
        
    } catch (error) {
        console.error('分析エラー:', error);
        showStatus('❌ エラー: 分析中に問題が発生しました', 'error');
    }
}

// クリップボードから画像を貼り付ける
function handlePaste(e) {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    uploadedImage = img;
                    
                    // 新しいレイアウトで画像を表示（初期化も含む）
                    showImagePreview(event.target.result);
                    
                    // モデルが読み込まれている場合は自動で分析開始
                    if (session) {
                        analyzeBoardImage();
                    } else {
                        showStatus('✅ クリップボードから画像が読み込まれました。モデルの読み込み完了をお待ちください。', 'success');
                    }
                };
                img.src = event.target.result;
            };
            
            reader.readAsDataURL(blob);
            e.preventDefault();
            break;
        }
    }
}

// キーボードイベントリスナーを追加
document.addEventListener('paste', handlePaste);

// フォーカス可能にするためのtabindex追加
document.addEventListener('DOMContentLoaded', function() {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
});

// ファイル入力処理
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    uploadedImage = img;
                    
                    // 新しいレイアウトで画像を表示（初期化も含む）
                    showImagePreview(e.target.result);
                    
                    // モデルが読み込まれている場合は自動で分析開始
                    if (session) {
                        analyzeBoardImage();
                    } else {
                        showStatus('✅ 画像が読み込まれました。モデルの読み込み完了をお待ちください。', 'success');
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// 初期化
loadModel();

const MINO_CLASSES = [
    "mino-empty", "mino-I", "mino-O", "mino-T", 
    "mino-L", "mino-J", "mino-S", "mino-Z", "mino-X"
];

function createTetrisBoard() {
    const board = document.getElementById('tetrisBoard');
    board.innerHTML = '';
    
    // 20行×10列のセルを作成
    for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 10; col++) {
            const cell = document.createElement('div');
            cell.className = 'cell mino-empty';
            cell.id = `cell-${row}-${col}`;
            board.appendChild(cell);
        }
    }
}

function drawTetrisBoard(input) {
    // 入力チェック
    if (input.length !== 200) {
        console.error(`入力データは200文字である必要があります。現在: ${input.length}文字`);
        return;
    }

    // 数字以外が含まれていないかチェック
    if (!/^[0-8]+$/.test(input)) {
        console.error('入力データは0-8の数字のみである必要があります。');
        return;
    }

    // 盤面を作成
    createTetrisBoard();

    // データを解析して盤面に反映
    for (let i = 0; i < 200; i++) {
        const minoIndex = parseInt(input[i]);
        
        // 列優先でのインデックス計算
        const col = Math.floor(i / 20);  // 列 (0-9)
        const row = i % 20;              // 行 (0-19)
        
        const cell = document.getElementById(`cell-${row}-${col}`);
        if (cell) {
            // 既存のミノクラスを除去
            MINO_CLASSES.forEach(cls => cell.classList.remove(cls));
            
            // 新しいミノクラスを追加
            cell.classList.add(MINO_CLASSES[minoIndex]);
        }
    }
}

// 画像表示の切り替え処理
function showImagePreview(imageSrc) {
    const uploadContent = document.getElementById('uploadContent');
    const analysisContent = document.getElementById('analysisContent');
    const previewImage = document.getElementById('previewImage');
    
    // アップロード内容を非表示にし、分析内容を表示
    uploadContent.style.display = 'none';
    analysisContent.style.display = 'block';
    
    // 画像を設定
    previewImage.src = imageSrc;
    
    // 初期化: テトリス盤面とFumen URLを非表示に
    initializeAnalysisResults();
    
    // クリックイベントを無効化
    document.getElementById('uploadSection').onclick = null;
}

// 分析結果の初期化
function initializeAnalysisResults() {
    // テトリス盤面を非表示
    document.getElementById('boardSection').style.display = 'none';
    
    // Fumen URLを非表示
    document.getElementById('fumenSection').style.display = 'none';
    
    // 現在のFumen URLをリセット
    currentFumenUrl = '';
}

// 分析結果でテトリス盤面を描画
function showAnalysisResult(boardData) {
    drawTetrisBoard(boardData);
    // テトリス盤面を表示
    document.getElementById('boardSection').style.display = 'block';
}

// Fumen ボタンを表示
function showFumenButton() {
    const fumenSection = document.getElementById('fumenSection');
    fumenSection.style.display = 'block';
}