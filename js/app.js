// グローバル変数
let session = null;
let uploadedImage = null;
let currentFumenUrl = '';
let imageInputHandler = null;
let modelLoadingPromise = null; // モデル読み込みのPromiseを管理

// Fumen URLを開く
function openFumenUrl() {
    if (currentFumenUrl) {
        window.open(currentFumenUrl, '_blank');
    }
}

// ステータス表示
function showStatus(message, type = '') {
    const statusDiv = document.getElementById('statusDiv');
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// 盤面分析メイン処理
async function analyzeBoardImage() {
    console.log('analyzeBoardImage 開始');
    
    if (!session) {
        console.error('モデルが読み込まれていません');
        showStatus('❌ エラー: モデルが読み込まれていません', 'error');
        return;
    }
    
    if (!uploadedImage) {
        console.error('画像がアップロードされていません');
        showStatus('❌ エラー: 画像がアップロードされていません', 'error');
        return;
    }
    
    showStatus('📄 画像の前処理中（枠削除）...', 'loading');
    
    try {
        // 元の画像をCanvasに描画
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = uploadedImage.width;
        canvas.height = uploadedImage.height;
        ctx.drawImage(uploadedImage, 0, 0);
        
        // 枠削除処理
        showStatus('🔄 枠削除処理を実行中...', 'loading');
        const results = await cropColorFrames(canvas);
        const preprocessedCanvas = results?.players["1P2P"]?.cropped?.canvas || canvas;

        // デバッグ時に枠削除済みの画像確認用　base64画像
        // const preprocessedBase64Img = results?.players["1P2P"]?.cropped?.base64
        
        // 前処理後の画像サイズを取得
        const preprocessedWidth = preprocessedCanvas.width;
        const preprocessedHeight = preprocessedCanvas.height;
        console.log(`前処理後の画像サイズ: ${preprocessedWidth}x${preprocessedHeight}`);
        
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
        console.log(`予測結果: ${labelString}`);
        
        // テトリス盤面を描画
        showAnalysisResult(labelString);
        
        // Fumen URL生成
        try {
            currentFumenUrl = generateFumenUrl(labelString);
            showFumenButton();
            showStatus(`🎉 分析完了！Fumen譜面が生成されました`, 'success');
            console.log(`Fumen URL: ${currentFumenUrl}`);
        } catch (fumenError) {
            console.error('Fumen URL生成エラー:', fumenError);
            currentFumenUrl = '';
            showStatus(`⚠️ 分析完了（Fumen URL生成でエラーが発生）`, 'error');
        }

        openFumenUrl();
        
    } catch (error) {
        console.error('分析エラー:', error);
        showStatus('❌ エラー: 分析中に問題が発生しました', 'error');
    }
}

// 画像入力処理のコールバック関数
async function handleImageLoaded(imageData) {
    console.log('画像が読み込まれました:', imageData.source);
    
    // 既存の分析結果をリセット
    resetAnalysisState();
    
    // グローバル変数に画像を保存
    uploadedImage = imageData.image;
    
    // 画像プレビューを表示
    showImagePreview(imageData.dataUrl);
    
    // 入力ソースに応じたメッセージ表示
    const sourceMessages = {
        'file-input': '✅ ファイルから画像が読み込まれました',
        'clipboard': '✅ クリップボードから画像が読み込まれました',
        'drag-and-drop': '✅ ドラッグアンドドロップで画像が読み込まれました'
    };
    
    const message = sourceMessages[imageData.source] || '✅ 画像が読み込まれました';
    showStatus(message, 'success');
    
    // モデルの状態をチェックして解析開始
    await startAnalysisIfReady();
}

// 分析状態をリセット
function resetAnalysisState() {
    console.log('分析状態をリセットします');
    
    // 分析結果を非表示に
    initializeAnalysisResults();
    
    // 現在のFumen URLをリセット
    currentFumenUrl = '';
    
    // ファイル入力をリセット（重要：これによりchange イベントが再度発火する）
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }
}

// モデルと画像の両方が準備できている場合に解析を開始
async function startAnalysisIfReady() {
    console.log('解析開始チェック - モデル:', !!session, '画像:', !!uploadedImage);
    
    if (!uploadedImage) {
        console.log('画像がアップロードされていません');
        return;
    }

    try {
        if (!session) {
            console.log('モデルが読み込まれていないため、読み込みを待機します');
            showStatus('🔄 モデルの読み込みを待機中...', 'loading');
            
            // モデルの読み込みを待つ
            await loadModel();
        }
        
        if (session && uploadedImage) {
            console.log('モデルと画像の準備が完了。解析を開始します');
            showStatus('🚀 解析を開始します...', 'loading');
            setTimeout(() => analyzeBoardImage(), 300);
        }
    } catch (error) {
        console.error('モデル読み込みまたは解析開始でエラー:', error);
        showStatus('❌ エラー: 解析の開始に失敗しました', 'error');
    }
}

// 画像入力エラー処理のコールバック関数
function handleImageError(error) {
    console.error('画像入力エラー:', error);
    showStatus(`❌ エラー: ${error.message}`, 'error');
}

// 画像プレビュー表示
function showImagePreview(imageSrc) {
    const uploadContent = document.getElementById('uploadContent');
    const analysisContent = document.getElementById('analysisContent');
    const previewImage = document.getElementById('previewImage');
    const uploadArea = document.getElementById('uploadArea');
    
    console.log('画像プレビューを表示します');
    
    // アップロード内容を非表示にし、分析内容を表示
    uploadContent.style.display = 'none';
    analysisContent.style.display = 'block';
    
    // 画像を設定
    previewImage.src = imageSrc;
    
    // アップロードエリアに画像が読み込まれたことを示すクラスを追加
    if (uploadArea) {
        uploadArea.classList.add('has-image');
    }
    
    // 初期化: テトリス盤面とFumen URLを非表示に
    initializeAnalysisResults();
}

// 分析結果の初期化
function initializeAnalysisResults() {
    // テトリス盤面を非表示
    const boardSection = document.getElementById('boardSection');
    if (boardSection) {
        boardSection.style.display = 'none';
    }
    
    // Fumen URLを非表示
    const fumenSection = document.getElementById('fumenSection');
    if (fumenSection) {
        fumenSection.style.display = 'none';
    }
    
    // 現在のFumen URLをリセット
    currentFumenUrl = '';
}

// 分析結果でテトリス盤面を表示
function showAnalysisResult(boardData) {
    drawTetrisBoard(boardData);
    // テトリス盤面を表示
    const boardSection = document.getElementById('boardSection');
    if (boardSection) {
        boardSection.style.display = 'block';
    }
}

// Fumen ボタンを表示
function showFumenButton() {
    const fumenSection = document.getElementById('fumenSection');
    if (fumenSection) {
        fumenSection.style.display = 'block';
    }
}

// 初期化処理
async function initialize() {
    console.log('アプリケーション初期化開始');
    
    // 画像入力ハンドラーを初期化
    imageInputHandler = new ImageInputHandler({
        uploadArea: document.getElementById('uploadArea'),
        fileInput: document.getElementById('fileInput'),
        onImageLoaded: handleImageLoaded,
        onError: handleImageError
    });
    
    console.log('画像入力ハンドラーを初期化しました');
    
    // モデル読み込み開始（非同期）
    loadModel().catch(error => {
        console.error('モデル読み込み失敗:', error);
    });
}

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', initialize);