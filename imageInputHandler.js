/**
 * 画像入力処理モジュール
 * ファイル選択、クリップボード貼り付け、ドラッグアンドドロップを統一的に処理
 */
class ImageInputHandler {
    constructor(options = {}) {
        this.uploadSection = options.uploadSection || document.getElementById('uploadSection');
        this.fileInput = options.fileInput || document.getElementById('fileInput');
        this.onImageLoaded = options.onImageLoaded || (() => {});
        this.onError = options.onError || ((error) => console.error(error));
        
        this.supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
        
        this.init();
    }
    
    /**
     * 初期化処理
     */
    init() {
        this.setupFileInput();
        this.setupClipboardPaste();
        this.setupDragAndDrop();
        this.setupKeyboardFocus();
    }
    
    /**
     * ファイル入力の設定
     */
    setupFileInput() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.processFile(file);
                }
            });
        }
        
        // アップロードセクションのクリックでファイル選択
        if (this.uploadSection) {
            this.uploadSection.addEventListener('click', () => {
                if (this.fileInput && !this.uploadSection.classList.contains('has-image')) {
                    this.fileInput.click();
                }
            });
        }
    }
    
    /**
     * クリップボード貼り付けの設定
     */
    setupClipboardPaste() {
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData.items;
            
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    this.processFile(blob);
                    e.preventDefault();
                    break;
                }
            }
        });
    }
    
    /**
     * ドラッグアンドドロップの設定
     */
    setupDragAndDrop() {
        if (!this.uploadSection) return;
        
        // ドラッグオーバー時のスタイル制御
        this.uploadSection.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.uploadSection.classList.add('drag-over');
        });
        
        this.uploadSection.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 要素から完全に離れた場合のみスタイルを削除
            if (!this.uploadSection.contains(e.relatedTarget)) {
                this.uploadSection.classList.remove('drag-over');
            }
        });
        
        this.uploadSection.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.uploadSection.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            const imageFile = files.find(file => this.isImageFile(file));
            
            if (imageFile) {
                this.processFile(imageFile);
            } else if (files.length > 0) {
                this.onError(new Error('サポートされていないファイル形式です。PNG、JPG、GIF、WebP形式の画像をドロップしてください。'));
            }
        });
        
        // ブラウザのデフォルトのドラッグアンドドロップを無効化
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
    }
    
    /**
     * キーボードフォーカスの設定（貼り付け対応のため）
     */
    setupKeyboardFocus() {
        if (!document.body.hasAttribute('tabindex')) {
            document.body.setAttribute('tabindex', '-1');
        }
        document.body.focus();
    }
    
    /**
     * ファイルが画像かどうかチェック
     */
    isImageFile(file) {
        return this.supportedTypes.includes(file.type);
    }
    
    /**
     * ファイルを処理してImageオブジェクトに変換
     */
    processFile(file) {
        if (!this.isImageFile(file)) {
            this.onError(new Error(`サポートされていないファイル形式です: ${file.type}`));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                this.onImageLoaded({
                    image: img,
                    dataUrl: e.target.result,
                    file: file,
                    source: this.getInputSource(file)
                });
            };
            
            img.onerror = () => {
                this.onError(new Error('画像の読み込みに失敗しました。'));
            };
            
            img.src = e.target.result;
        };
        
        reader.onerror = () => {
            this.onError(new Error('ファイルの読み込みに失敗しました。'));
        };
        
        reader.readAsDataURL(file);
    }
    
    /**
     * 入力ソースを判定
     */
    getInputSource(file) {
        // ファイル名がない場合はクリップボードからの貼り付け
        if (!file.name || file.name === 'image.png') {
            return 'clipboard';
        }
        // lastModifiedが現在時刻に近い場合はドラッグアンドドロップかクリップボード
        const now = Date.now();
        if (Math.abs(now - file.lastModified) < 1000) {
            return 'drag-and-drop';
        }
        return 'file-input';
    }
    
    /**
     * アップロード状態をリセット
     */
    reset() {
        if (this.fileInput) {
            this.fileInput.value = '';
        }
        if (this.uploadSection) {
            this.uploadSection.classList.remove('drag-over', 'has-image');
        }
    }
    
    /**
     * 破棄処理
     */
    destroy() {
        // イベントリスナーの削除は複雑なので、必要に応じて実装
        // 通常はページリロード時に自動的にクリーンアップされる
    }
}

// 使用方法の例
/*
const imageHandler = new ImageInputHandler({
    uploadSection: document.getElementById('uploadSection'),
    fileInput: document.getElementById('fileInput'),
    onImageLoaded: (imageData) => {
        console.log('画像が読み込まれました:', imageData);
        // imageData.image: HTMLImageElement
        // imageData.dataUrl: base64形式のデータURL
        // imageData.file: Fileオブジェクト
        // imageData.source: 'file-input' | 'clipboard' | 'drag-and-drop'
    },
    onError: (error) => {
        console.error('エラー:', error.message);
    }
});
*/

// ES6モジュールとして使用する場合
// export default ImageInputHandler;