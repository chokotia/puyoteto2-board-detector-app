// ONNXモデルをロード（Promise版）
async function loadModel() {
    if (modelLoadingPromise) {
        return modelLoadingPromise; // 既に読み込み中の場合は同じPromiseを返す
    }

    modelLoadingPromise = (async () => {
        try {
            showStatus('🔄 モデルを読み込み中...', 'loading');
            console.log('モデル読み込み開始');
            
            session = await ort.InferenceSession.create('./models/tetris_mobilenet_v3_small.onnx');

            showStatus('✅ モデルが正常に読み込まれました', 'success');
            console.log('モデル読み込み完了');
            
            return session;
        } catch (error) {
            console.error('モデルの読み込みに失敗:', error);
            showStatus('❌ エラー: モデルファイル(tetris_mobilenet_v3_small.onnx)が見つかりません', 'error');
            throw error;
        }
    })();

    return modelLoadingPromise;
}
