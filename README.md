# LEISURE HOMME 出貨印單助手

幫蝦皮賣家把同一筆訂單的寄件單與裝箱單排在一起，方便列印、包貨。

**完全免費，以後也不會收費。目前僅支援熱感列印。**

目前版本：**v0.11.3**。新增功能與修正請見 <a href="CHANGELOG.md" target="_blank" rel="noopener noreferrer">更新紀錄</a>。

## 物流支援

| 物流方式 | 支援狀態 |
| --- | :---: |
| 蝦皮店到店-隔日到貨 | ✅ |
| 蝦皮店到店 | ✅ |
| 店到家宅配 | ✅ |
| 7-ELEVEN | ✅ |
| 新竹物流 | ✅ |
| 全家 | ❌ |
| 其他寄送方式 | ❌ |

✅ 可由助手整理寄件單與裝箱單；❌ 尚未支援，請使用蝦皮原本的下載方式。

## 安裝

1. <a href="https://github.com/chian5566/shopee-shipment-print-helper/releases/download/v0.11.3/shopee-shipment-print-helper-v0.11.3.zip" target="_blank" rel="noopener noreferrer">下載 v0.11.3 安裝檔</a>（`shopee-shipment-print-helper-v0.11.3.zip`），下載後解壓縮。
2. 在 Chrome 網址列輸入 `chrome://extensions/`，開啟右上角「開發人員模式」。
3. 按「載入未封裝項目」，選擇解壓縮後的資料夾（裡面要有 `manifest.json`）。
4. 重新整理蝦皮頁面，即可使用。安裝後請保留這個資料夾。

更新時，換成新版檔案，到同一個擴充功能頁面按助手的重新載入按鈕，再重新整理蝦皮頁面。

## 設計原則

本工具開放給所有蝦皮賣家使用。商品貨號、規格、顏色、尺寸與名稱均視為賣家自訂文字，不以 LEISURE HOMME 的商品編碼或品類推算資料。商品列、數量與訂單配對依蝦皮文件的欄位、座標及原始識別資訊處理；品牌名稱與作者贊助連結僅供顯示，不參與資料判斷。

## 使用

1. 前往蝦皮 <a href="https://seller.shopee.tw/portal/sale/mass/ship?mass_shipment_tab=301" target="_blank" rel="noopener noreferrer">批次出貨 → 下載出貨文件</a>。
2. 點「印」字圖示開啟助手，再點一次可關閉；確認要出貨的訂單（助手會先選取目前頁面的訂單）。
3. 同時勾選「寄件單」與「裝箱單」，寄件單選「熱感列印」（7-ELEVEN 使用原生服務單，不需選此格式）。
4. 按蝦皮的「下載所選文件」。
5. 助手顯示「文件已完成，可預覽」後，按「預覽文件」，再從預覽視窗列印。

列印紙張選 **100 × 150 mm**，目前建議自訂縮放 **125%**；先確認預覽再印。助手會將新竹物流寄件單預先縮至 80%，配合 125% 列印還原尺寸，避免滿版內容超出紙張。

7-ELEVEN 原單會在背景處理，等待助手完成即可；合併文件成功產生後會自動關閉原單。原始 QR 圖片在本機擷取，按訂單編號與裝箱單配對。不同來源版面會保留圖片長寬比例，較大的原單等比例縮小至 100 × 150 mm 內，較小的維持原大小；建議的 125% 列印設定同樣適用。**7-ELEVEN 與其他物流請分開下載。**

選「一般列印」時，仍可使用蝦皮原本的下載方式，但助手不會整理文件。重新整理頁面會清空助手的列印任務。

## 問題或建議

<a href="https://forms.gle/dWHwKoQnWCdBVqPn7" target="_blank" rel="noopener noreferrer">填寫回報表單</a>，簡單說明操作步驟即可，也可選填圖片或影片（最多 5 個，每個 100 MB）。

表單須登入 Google；上傳並提交附件時，Google 會記錄帳戶名稱、信箱與相片。截圖、影片請先遮住買家姓名、電話、地址等個資。

目前仍在測試，第一次使用請少量試印，確認訂單、商品內容與列印尺寸。

## 其他說明

出貨資料在你的電腦處理，助手不會自動上傳。這是獨立製作的工具，與蝦皮官方無關。

可免費用於自己的賣場，不可轉售或另行散布。詳見 <a href="LICENSE.md" target="_blank" rel="noopener noreferrer">使用條款</a> 與 <a href="PRIVACY.md" target="_blank" rel="noopener noreferrer">隱私說明</a>。

## 支持作者

此工具由 <a href="https://www.threads.com/@chian5566" target="_blank" rel="noopener noreferrer">@chian5566</a> 無償提供，若您覺得不錯想支持我，歡迎到 <a href="https://shopee.tw/shop/1853603/" target="_blank" rel="noopener noreferrer">LEISURE HOMME</a> 跟我買件衣服！我就會很開心了！

### 錯誤回報

失敗任務會顯示 Google 表單回報連結與「查看錯誤詳情」按鈕。點開視窗後可複製版本、失敗時間與階段、錯誤堆疊、文件大小與頁數、裝箱單辨識結果，再貼到回報表單。若無法自動複製，視窗會選取全文供手動複製。原始文件下載連結仍保留。
