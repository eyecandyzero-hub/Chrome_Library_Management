let lastRightClickedTitle = "";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RIGHT_CLICK_TITLE") {
    lastRightClickedTitle = message.title;
  }
  
  // =========================================================
  // [1] GIGAFILE 직통 다운로드 (히토미 방식)
  // =========================================================
  else if (message.action === "DOWNLOAD_GIGAFILE") {
    (async () => {
      try {
        let url = message.url;
        let pw = message.password || "";

        let res = await fetch(url);
        let finalUrl = res.url;

        let hostMatch = finalUrl.match(/https?:\/\/([^\/]+)/);
        let host = hostMatch ? hostMatch[1] : "94.gigafile.nu";
        let fileIdMatch = finalUrl.match(/[?&]file=([0-9]{4}-[0-9a-zA-Z]+)/) || finalUrl.match(/\/([0-9]{4}-[0-9a-zA-Z]+)(?:[?&\/]|$)/);
        let fileId = fileIdMatch ? fileIdMatch[1] : null;

        if (!fileId) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "❌ 파일 ID를 찾을 수 없습니다.", isError: true });
          return;
        }

        let dlUrl = `https://${host}/dl_zip.php?file=${fileId}`;
        if (pw) dlUrl += `&dlkey=${encodeURIComponent(pw)}`;

        chrome.downloads.download({ url: dlUrl, conflictAction: "uniquify" }, (downloadId) => {
            if (chrome.runtime.lastError) chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "❌ 다운로드 시작 실패: " + chrome.runtime.lastError.message, isError: true });
            else chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "✅ Gigafile 백그라운드 다운로드가 시작되었습니다!" });
        });

      } catch (error) {
        chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "❌ 주소 해석 중 에러가 발생했습니다.", isError: true });
      }
    })();
    return true; 
  }

  // =========================================================
  // [2] GOFILE 직통 다운로드 (히토미 방식 완벽 이식)
  // =========================================================
  else if (message.action === "DOWNLOAD_GOFILE") {
    (async () => {
        try {
            let url = message.url;
            let pw = message.password || "";
            let fileIdMatch = url.match(/gofile\.io\/(?:d|download)\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]c=([a-zA-Z0-9_-]+)/);
            let fileId = fileIdMatch ? fileIdMatch[1] : null;

            if (!fileId) {
                chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "❌ Gofile 파일 ID를 찾을 수 없습니다.", isError: true });
                return;
            }

            // 1. 임시 토큰(accountToken) 발급
            let accRes = await fetch('https://api.gofile.io/accounts', { method: 'POST' });
            let accData = await accRes.json();
            if (accData.status !== 'ok') throw new Error("계정 토큰 발급 실패");
            let token = accData.data.token;

            // 2. 다운로드 권한을 위해 브라우저 쿠키에 토큰 강제 주입
            await chrome.cookies.set({
                url: "https://gofile.io",
                name: "accountToken",
                value: token,
                domain: ".gofile.io",
                path: "/"
            });

            // 3. 보안 통과를 위한 wt 파라미터 추출
            let wt = "abcde";
            try {
                let jsRes = await fetch('https://gofile.io/dist/js/alljs.js');
                if(!jsRes.ok) jsRes = await fetch('https://gofile.io/dist/js/config.js');
                let jsText = await jsRes.text();
                let wtMatch = jsText.match(/(?:appdata\.wt|["']?wt["']?)\s*[:=]\s*["']([a-zA-Z0-9]{4,64})["']/i);
                if (wtMatch) wt = wtMatch[1];
            } catch(e) {}

            // 4. 패스워드 SHA-256 암호화 및 API 호출
            let apiUrl = `https://api.gofile.io/contents/${fileId}?wt=${wt}`;
            if (pw) {
                const encoder = new TextEncoder();
                const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(pw));
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                apiUrl += `&password=${hashHex}`;
            }

            let contentRes = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            let contentData = await contentRes.json();

            if (contentData.status && contentData.status.includes('password')) {
                chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "❌ Gofile 비밀번호가 틀렸거나 누락되었습니다.", isError: true });
                return;
            }
            if (contentData.status !== 'ok') throw new Error(contentData.status);

            // 5. 폴더 구조 내에서 실제 파일 다운로드 링크만 쏙쏙 뽑아내기
            let downloadLinks = [];
            function extractLinks(obj) {
                if (!obj) return;
                if (obj.type === 'file' && (obj.link || obj.directLink || obj.downloadLink)) {
                    downloadLinks.push(obj.link || obj.directLink || obj.downloadLink);
                } else if (obj.children) {
                    if (Array.isArray(obj.children)) obj.children.forEach(extractLinks);
                    else if (typeof obj.children === 'object') Object.values(obj.children).forEach(extractLinks);
                }
            }
            extractLinks(contentData.data);

            if (downloadLinks.length === 0) {
                chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "❌ Gofile 다운로드할 파일을 찾지 못했습니다.", isError: true });
                return;
            }

            // 6. 브라우저 네이티브 다운로드 시작
            for (let link of downloadLinks) {
                chrome.downloads.download({ url: link, conflictAction: "uniquify" });
            }
            chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: `✅ ${downloadLinks.length}개의 Gofile 다운로드가 시작되었습니다!` });
            
        } catch (error) {
            chrome.tabs.sendMessage(sender.tab.id, { action: "SHOW_INFO_TOAST", msg: "❌ Gofile 처리 에러: " + error.message, isError: true });
        }
    })();
    return true;
  }
});

// 우클릭 관리 (기존 유지)
function createIndependentMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "addExclude", title: "1.제외 추가", contexts: ["link", "selection"] });
    setTimeout(() => { chrome.contextMenus.create({ id: "addIncomplete", title: "2.미완 추가", contexts: ["link", "selection"] }); }, 150);
  });
}
chrome.runtime.onInstalled.addListener(createIndependentMenus);
chrome.runtime.onStartup.addListener(createIndependentMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const type = info.menuItemId === "addExclude" ? "exclude" : "incomplete";
  let rawTitle = (info.selectionText || lastRightClickedTitle || info.linkText || "").trim();
  if (!rawTitle) return;

  const resMatch = rawTitle.match(/\d{3,4}\s*px/gi);
  const resolution = resMatch ? Array.from(new Set(resMatch)).join(',') : "";
  let lastVol = "";
  const rangeMatch = rawTitle.match(/(\d+)\s*[~-]\s*(\d+)/);
  const volMatch = rawTitle.match(/(\d+)\s*(?:권|화|부)/);
  const endNumMatch = rawTitle.match(/(\d+)\s*(?=[\[\(]|$)/);

  if (rangeMatch) lastVol = rangeMatch[2];
  else if (volMatch) lastVol = volMatch[1];
  else if (endNumMatch) lastVol = endNumMatch[1];

  let cleanTitle = rawTitle.replace(/<!--[\s\S]*?-->/g, '').replace(/e-?book|e북/gi, '').replace(/19금|19\+|N새글|고화질|저화질|무료/g, '').replace(/댓글\s*[+\d]*개?/gi, '').replace(/[\[\(].*?[\]\)]/g, ' ').replace(/\d{3,4}\s*px/gi, ' ').replace(/\d+\s*[~-]\s*\d+/g, ' ').replace(/[：:—\-\/]/g, ' ').replace(/\d+\s*(?:권|화)/g, ' ').replace(/완결[!?.~]*/g, ' ').replace(/\s+(완|화|권)[!?.~]*(?=\s|$)/g, ' ').replace(/\+\s*\d+\s*$/g, ' ').replace(/\s+/g, ' ').trim();
  const dateString = new Date().toISOString(); 

  chrome.storage.local.get({ bookList: [] }, (data) => {
    let list = Array.isArray(data.bookList) ? data.bookList : [];
    let savedBookObj = null; 
    const existingIndex = list.findIndex(b => b.title === cleanTitle || (cleanTitle.includes(b.title) && Math.abs(cleanTitle.length - b.title.length) < 5));

    if (existingIndex > -1) {
      list[existingIndex].lastVol = lastVol || list[existingIndex].lastVol;
      list[existingIndex].resolution = resolution || list[existingIndex].resolution;
      list[existingIndex].type = type; 
      list[existingIndex].date = dateString; 
      savedBookObj = list[existingIndex]; 
    } else {
      savedBookObj = { id: Date.now(), title: cleanTitle, type: type, resolution: resolution, lastVol: lastVol, date: dateString };
      list.unshift(savedBookObj);
    }
    
    chrome.storage.local.set({ bookList: list }, () => {
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "SHOW_TOAST", book: savedBookObj }).catch(() => {});
      }
    });
  });
});