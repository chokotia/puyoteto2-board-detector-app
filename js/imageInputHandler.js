/**
 * 画像入力処理モジュール
 * ファイル選択、クリップボード貼り付け、ドラッグアンドドロップを統一的に処理
 */
class ImageInputHandler {
    constructor(options = {}) {
        // 正しいIDを使用してuploadAreaを取得
        this.uploadArea = options.uploadArea || document.getElementById('uploadArea');
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
                console.log('ファイル選択イベントが発生しました');
                const file = e.target.files[0];
                if (file) {
                    console.log('選択されたファイル:', file.name, file.type);
                    this.processFile(file);
                }
            });
        }
        
        // アップロードエリアのクリックでファイル選択
        if (this.uploadArea) {
            this.uploadArea.addEventListener('click', (e) => {
                console.log('アップロードエリアがクリックされました');
                // 画像が既に読み込まれている場合はファイル選択を無効にする
                if (this.fileInput && !this.uploadArea.classList.contains('has-image')) {
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
            console.log('貼り付けイベントが発生しました');
            const items = e.clipboardData.items;
            
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    console.log('クリップボードから画像を検出しました');
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
        if (!this.uploadArea) {
            console.error('uploadArea要素が見つかりません');
            return;
        }
        
        // ブラウザのデフォルトのドラッグアンドドロップを防ぐ
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        // ドラッグオーバー時のスタイル制御
        this.uploadArea.addEventListener('dragenter', (e) => {
            console.log('ドラッグエンター');
            this.uploadArea.classList.add('drag-over');
        });
        
        this.uploadArea.addEventListener('dragover', (e) => {
            console.log('ドラッグオーバー');
            this.uploadArea.classList.add('drag-over');
        });
        
        this.uploadArea.addEventListener('dragleave', (e) => {
            console.log('ドラッグリーブ');
            // 要素から完全に離れた場合のみスタイルを削除
            if (!this.uploadArea.contains(e.relatedTarget)) {
                this.uploadArea.classList.remove('drag-over');
            }
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            console.log('ドロップイベントが発生しました');
            this.uploadArea.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            console.log('ドロップされたファイル:', files);
            
            const imageFile = files.find(file => this.isImageFile(file));
            
            if (imageFile) {
                console.log('有効な画像ファイルが見つかりました:', imageFile.name);
                this.processFile(imageFile);
            } else if (files.length > 0) {
                console.log('サポートされていないファイル形式');
                this.onError(new Error('サポートされていないファイル形式です。PNG、JPG、GIF、WebP形式の画像をドロップしてください。'));
            } else {
                console.log('ファイルが見つかりませんでした');
            }
        });
        
        // 全体のドラッグイベントも制御
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
        const isSupported = this.supportedTypes.includes(file.type);
        console.log(`ファイルタイプチェック: ${file.type} -> ${isSupported ? 'サポート' : 'サポート外'}`);
        return isSupported;
    }
    
    /**
     * ファイルを処理してImageオブジェクトに変換
     */
    processFile(file) {
        console.log('ファイル処理開始:', file.name, file.type);
        
        if (!this.isImageFile(file)) {
            this.onError(new Error(`サポートされていないファイル形式です: ${file.type}`));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            console.log('ファイル読み込み完了');
            const img = new Image();
            
            img.onload = () => {
                console.log('画像読み込み完了:', img.width, 'x', img.height);
                this.onImageLoaded({
                    image: img,
                    dataUrl: e.target.result,
                    file: file,
                    source: this.getInputSource(file)
                });
            };
            
            img.onerror = () => {
                console.error('画像の読み込みに失敗しました');
                this.onError(new Error('画像の読み込みに失敗しました。'));
            };
            
            img.src = e.target.result;
        };
        
        reader.onerror = () => {
            console.error('ファイルの読み込みに失敗しました');
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
        if (this.uploadArea) {
            this.uploadArea.classList.remove('drag-over', 'has-image');
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