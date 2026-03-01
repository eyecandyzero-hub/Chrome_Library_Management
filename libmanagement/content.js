const PRE_DEFINED_SITES = [
  { 
    url: "tcafe21.com", 
    selector: ".board-hot-posts, #fboardlist",
    thumbSelector: "img", 
    excludeThumbSelector: ".board-thumbnail", 
    getHighResUrl: (src) => {
      if (!src) return "";
      return src.split('?')[0].replace(/\/thumb\d*-/, '/').replace(/_\d+x\d+(?=\.[a-zA-Z]+$)/, '');  
    }
  },
  { url: "ridibooks.com", selector: "#books_contents, .infinite-scroll-component " },
  { url: ".day", selector: ".list-board" },
  { url: "kaiv.net", selector: "#gall_ul" },
  { url: "example.com", selector: "#board_list" }
];

function getOrCreateHoverContainer() {
  let container = document.getElementById('book-manager-hover-preview');
  if (!container) {
    container = document.createElement('div');
    container.id = 'book-manager-hover-preview';
    container.style.cssText = `position: fixed; z-index: 9999999; display: none; max-width: 350px; max-height: 500px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); background: #111; overflow: hidden; pointer-events: none;`;
    const previewImg = document.createElement('img');
    previewImg.id = 'book-manager-hover-img';
    previewImg.style.cssText = `display: block; max-width: 350px; max-height: 500px; width: auto; height: auto; object-fit: contain;`;
    container.appendChild(previewImg);
    document.body.appendChild(container);
  }
  return container;
}

function getPureLinkText(link) {
  const clone = link.cloneNode(true);
  const unwantedElements = clone.querySelectorAll('.count, .book-badge');
  unwantedElements.forEach(el => el.remove());
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT, null, false);
  let commentNode;
  const commentsToRemove = [];
  while (commentNode = walker.nextNode()) { commentsToRemove.push(commentNode); }
  commentsToRemove.forEach(node => node.remove());
  return clone.textContent.trim();
}

function calculateLevenshtein(s1, s2) {
  const n1 = s1.replace(/[^a-zA-Z0-9가-힣\s]/g, '').toLowerCase().trim();
  const n2 = s2.replace(/[^a-zA-Z0-9가-힣\s]/g, '').toLowerCase().trim();
  const len1 = n1.length, len2 = n2.length;
  if (len1 === 0 || n1 === n2) return n1 === n2 ? 100 : 0;
  const matrix = Array.from(Array(len1 + 1), () => Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = n1[i-1] === n2[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i-1][j]+1, matrix[i][j-1]+1, matrix[i-1][j-1]+cost);
    }
  }
  return (1 - matrix[len1][len2] / Math.max(len1, len2)) * 100;
}

function getSimilarity(registered, siteTitle) {
  const regBody = registered.replace(/[^a-zA-Z0-9가-힣\s]/g, '').toLowerCase().trim();
  const siteBody = siteTitle.replace(/[^a-zA-Z0-9가-힣\s]/g, '').toLowerCase().trim();

  if (regBody === siteBody) return 100;
  const spinOffRegex = /(외전|이어\s*원|이어원|스핀오프|앤솔로지)/i;
  const isRegSpinOff = spinOffRegex.test(regBody);
  const isSiteSpinOff = spinOffRegex.test(siteBody);
  if (isRegSpinOff !== isSiteSpinOff) return 0; 

  const regNumbers = regBody.match(/\d+/g) || [];
  const siteNumbers = siteBody.match(/\d+/g) || [];
  if (regNumbers.length > 0) {
    const hasRequiredNumbers = regNumbers.every(num => siteNumbers.includes(num));
    if (!hasRequiredNumbers) return 0; 
  }

  const regWords = regBody.split(/\s+/).filter(w => w.length > 0);
  const siteWords = siteBody.split(/\s+/).filter(w => w.length > 0);
  const wordDiff = Math.abs(regWords.length - siteWords.length);

  const isSiteIncludesReg = siteBody.includes(regBody); 
  const isRegIncludesSite = regBody.includes(siteBody); 

  if (isSiteIncludesReg) {
    if (regBody.length <= 2) {
      if (!siteWords.includes(regBody)) return calculateLevenshtein(regBody, siteBody);
    }
    if (regWords.length <= 2) {
        if (wordDiff >= 2) return 60; 
    }
    if (wordDiff <= 3) return 95;
    if (wordDiff >= 4) return 75; 
  } else if (isRegIncludesSite) {
    if (siteWords.length === 1 || siteBody.length <= 2) {
      if (regWords.length > siteWords.length) return 60;
    }
    if (wordDiff <= 1) return 95; 
    return 60; 
  }
  return calculateLevenshtein(regBody, siteBody);
}

function cleanSiteTitle(title) {
  return title.replace(/<!--[\s\S]*?-->/g, '').replace(/e-?book|e북/gi, '').replace(/19금|19\+|N새글|고화질|저화질|무료/g, '').replace(/댓글\s*[+\d]*개?/gi, '').replace(/[\[\(].*?[\]\)]/g, ' ').replace(/\d{3,4}\s*px/gi, ' ').replace(/\d+\s*[~-]\s*\d+/g, ' ').replace(/[：:—\-\/]/g, ' ').replace(/\d+\s*(?:권|화)/g, ' ').replace(/완결[!?.~]*/g, ' ').replace(/\s+(완|화|권)[!?.~]*(?=\s|$)/g, ' ').replace(/\+\s*\d+\s*$/g, ' ').replace(/\s+/g, ' ').trim();
}

function showInfoToast(msg, isError = false) {
  let container = document.getElementById('book-manager-info-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'book-manager-info-toast-container';
    container.style.cssText = `position:fixed; bottom:20px; right:20px; z-index:999999; display:flex; flex-direction:column; gap:10px; pointer-events:none;`;
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.innerHTML = msg;
  toast.style.cssText = `background: ${isError ? '#dc3545' : '#17a2b8'}; color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.2); opacity: 0; transform: translateX(20px); transition: all 0.3s ease; white-space: nowrap;`;
  container.appendChild(toast);

  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
  
  // 👇 [수정됨] 다운로드 알림 5초(5000ms) 유지
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)';
    toast.addEventListener('transitionend', () => toast.remove());
  }, 5000);
}

function injectDirectDownloadButtons() {
  const tabBtns = Array.from(document.querySelectorAll('a, button, span')).filter(el => el.textContent.trim() === '탭열기');
  
  tabBtns.forEach(btn => {
      if (btn.nextElementSibling && btn.nextElementSibling.classList.contains('auto-dl-btn')) return;

      const container = btn.closest('div, tr, li, td') || btn.parentElement.parentElement;
      if (!container) return;

      let url = "";
      let pw = "";
      let targetType = "";

      if (btn.tagName === 'A' && btn.href && (btn.href.includes('gigafile.nu') || btn.href.includes('xgf.nu'))) {
          url = btn.href;
          targetType = "GIGAFILE";
      } else if (btn.tagName === 'A' && btn.href && btn.href.includes('gofile.io')) {
          url = btn.href;
          targetType = "GOFILE";
      } else {
          const input = container.querySelector('input[value*="gigafile.nu"], input[value*="xgf.nu"], input[value*="gofile.io"]');
          if (input) {
              url = input.value;
              if (url.includes('gigafile.nu') || url.includes('xgf.nu')) targetType = "GIGAFILE";
              else if (url.includes('gofile.io')) targetType = "GOFILE";
          }
      }

      if (url && targetType) {
          const inputs = Array.from(container.querySelectorAll('input[type="text"], input[type="password"]'));
          const urlInputIdx = inputs.findIndex(i => i.value.includes('gigafile.nu') || i.value.includes('xgf.nu') || i.value.includes('gofile.io'));
          if (urlInputIdx > -1 && urlInputIdx + 1 < inputs.length) {
              pw = inputs[urlInputIdx + 1].value;
          }

          const autoBtn = document.createElement('a');
          autoBtn.href = "#";
          autoBtn.className = "auto-dl-btn";
          autoBtn.innerHTML = "⚡ 바로다운로드";
          autoBtn.style.cssText = "display:inline-block; padding:3px 10px; margin-left:5px; background-color:#17a2b8; color:white; border-radius:3px; text-decoration:none; font-size:12px; font-weight:bold; cursor:pointer; vertical-align:middle; transition: background 0.2s;";
          
          autoBtn.onclick = (e) => {
              e.preventDefault();
              autoBtn.innerHTML = "⏳ 요청 중...";
              autoBtn.style.backgroundColor = "#6c757d";
              autoBtn.style.pointerEvents = "none";
              
              const platformName = targetType === 'GOFILE' ? 'Gofile' : 'Gigafile';
              showInfoToast(`🚀 ${platformName} 서버로 직접 다운로드를 요청합니다...`);
              
              chrome.runtime.sendMessage({
                  action: `DOWNLOAD_${targetType}`,
                  url: url,
                  password: pw
              });

              setTimeout(() => {
                  autoBtn.innerHTML = "⚡ 바로다운로드";
                  autoBtn.style.backgroundColor = "#17a2b8";
                  autoBtn.style.pointerEvents = "auto";
              }, 5000); 
          };
          
          btn.insertAdjacentElement('afterend', autoBtn);
      }
  });
}

function applyStyles() {
  if (!chrome.runtime?.id) return;
  
  injectDirectDownloadButtons();

  const hostname = window.location.hostname;
  chrome.storage.local.get({ allowedSites: [], bookList: [] }, (data) => {
    if (chrome.runtime.lastError) return;
    
    let config = PRE_DEFINED_SITES.find(s => hostname.includes(s.url));
    if (!config) {
      const userSites = Array.isArray(data.allowedSites) ? data.allowedSites : [];
      config = userSites.find(s => hostname.includes(typeof s === 'string' ? s : s.url));
    }
    if (!config) return;

    const list = Array.isArray(data.bookList) ? data.bookList : [];
    const targetSelector = (typeof config === 'object' && config.selector) ? config.selector : 'a';
    const targetAreas = document.querySelectorAll(targetSelector);
    
    targetAreas.forEach(area => {
      const links = area.tagName === 'A' ? [area] : area.querySelectorAll('a');
      
      links.forEach(link => {
        const originalText = getPureLinkText(link);
        const pureTitle = cleanSiteTitle(originalText);

        if (pureTitle.length < 2 || /^[ㄱ-ㅎㅏ-ㅣ\s]+$/.test(pureTitle)) return;
        
        let book = null;
        let maxScore = 0;
        
        list.forEach(b => {
          const score = getSimilarity(b.title, pureTitle);
          if (score >= 85 && score > maxScore) { maxScore = score; book = b; }
        });
        
        if (book) {
          const siteResMatch = originalText.match(/(\d{3,4})\s*px/i);
          const siteRes = siteResMatch ? parseInt(siteResMatch[1], 10) : 0;
          let siteVol = 0;
          const rangeMatch = originalText.match(/(\d+)\s*[~-]\s*(\d+)/);
          const singleMatch = originalText.match(/(\d+)\s*(?:권|화|부)/);
          const lastNumMatch = originalText.match(/(\d+)\s*(?=[\[\(]|$)/);
          if (rangeMatch) siteVol = parseInt(rangeMatch[2], 10);
          else if (singleMatch) siteVol = parseInt(singleMatch[1], 10);
          else if (lastNumMatch) siteVol = parseInt(lastNumMatch[1], 10);

          const regRes = book.resolution ? parseInt(book.resolution.replace(/[^0-9]/g, ''), 10) : 0;
          const regVol = book.lastVol ? parseInt(book.lastVol, 10) : 0;
          const displayScore = Math.round(maxScore);
          const resText = book.resolution || '-';
          const volText = book.lastVol ? book.lastVol + '권' : '-';

          let newBadgeHTML = '';
          let badgeStyle = '';

          if (book.type === "exclude") {
            link.style.setProperty("text-decoration", "line-through", "important");
            link.style.setProperty("color", "#aaaaaa", "important");
            link.style.setProperty("opacity", "0.5", "important");
            link.setAttribute("title", `[제외됨] ${book.title} (매칭률: ${displayScore}%)`);
            newBadgeHTML = `<span style="color:#999;">${resText}</span><span style="color:#ccc;"> | </span><span style="color:#999;">${volText}</span><span style="color:#adb5bd;font-size:9px;margin-left:4px;" title="매칭률">(${displayScore}%)</span>`;
            badgeStyle = "font-size:10px; background:#f8f9fa; border:1px solid #dee2e6; padding:2px 4px; border-radius:3px; margin-left:6px; vertical-align:middle; display:inline-block; line-height:1.2;";
          } else if (book.type === "incomplete") {
            const resColor = (siteRes > regRes && regRes > 0) ? "red" : "#007bff";
            const volColor = (siteVol > regVol && regVol > 0) ? "red" : "#007bff";
            const resWeight = resColor === "red" ? "bold" : "normal";
            const volWeight = volColor === "red" ? "bold" : "normal";
            link.style.setProperty("text-decoration", "none", "important");
            link.style.setProperty("color", "#0056b3", "important");
            link.style.setProperty("font-weight", "600", "important");
            link.style.setProperty("opacity", "1", "important");
            link.setAttribute("title", `[미완] ${book.title} (${displayScore}%)`);
            newBadgeHTML = `<span style="color:${resColor}; font-weight:${resWeight}">${resText}</span><span style="color:#007bff; opacity:0.5;"> | </span><span style="color:${volColor}; font-weight:${volWeight}">${volText}</span><span style="color:#868e96;font-size:9px;margin-left:4px;" title="매칭률">(${displayScore}%)</span>`;
            badgeStyle = "font-size:10px; background:#f0f7ff; border:1px solid #007bff; padding:2px 4px; border-radius:3px; margin-left:6px; vertical-align:middle; display:inline-block; line-height:1.2;";
          }

          const existingBadge = link.querySelector('.book-badge');
          if (existingBadge && existingBadge.innerHTML.trim() === newBadgeHTML.trim()) return;
          if (existingBadge) existingBadge.remove();
          const badge = document.createElement('span');
          badge.className = 'book-badge';
          badge.style.cssText = badgeStyle;
          badge.innerHTML = newBadgeHTML;
          link.appendChild(badge);

        } else {
          if (link.style.textDecoration || link.querySelector('.book-badge')) {
            link.style.removeProperty("text-decoration");
            link.style.removeProperty("color");
            link.style.removeProperty("opacity");
            link.style.removeProperty("font-weight");
            link.removeAttribute("title");
            const badge = link.querySelector('.book-badge');
            if (badge) badge.remove();
          }
        }
      });
    });
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.bookList || changes.allowedSites)) { applyStyles(); }
});

chrome.storage.local.get({ allowedSites: [] }, (data) => {
  const userSites = Array.isArray(data.allowedSites) ? data.allowedSites : [];
  const hostname = window.location.hostname;
  const isPreDefined = PRE_DEFINED_SITES.some(site => hostname.includes(site.url));
  const isUserDefined = userSites.some(site => hostname.includes(typeof site === 'string' ? site : site.url));

  if (isPreDefined || isUserDefined) {
    const fixStyle = document.createElement('style');
    fixStyle.textContent = `.list-subject > div[style*="float:left"],.list-subject > div[style*="float: left"] { position: relative !important; z-index: 10 !important; }.list-subject a.ellipsis { position: relative !important; z-index: 1 !important; }`;
    document.head.appendChild(fixStyle);

    applyStyles();
    
    new MutationObserver(() => {
      if (!chrome.runtime?.id) return; 
      applyStyles();
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener("contextmenu", (e) => {
      if (!chrome.runtime?.id) return; 
      const link = e.target.closest('a');
      if (link) { try { chrome.runtime.sendMessage({ type: "RIGHT_CLICK_TITLE", title: getPureLinkText(link) }); } catch (error) {} }
    }, true);

    const config = PRE_DEFINED_SITES.find(site => hostname.includes(site.url));
    if (config && config.thumbSelector && config.getHighResUrl) {
      const hoverContainer = getOrCreateHoverContainer();
      const previewImg = document.getElementById('book-manager-hover-img');

      document.addEventListener('mouseover', (e) => {
        const thumb = e.target.closest(config.thumbSelector);
        if (!thumb || thumb.tagName !== 'IMG') return;
        if (config.selector && !thumb.closest(config.selector)) return;
        if (config.excludeThumbSelector && thumb.closest(config.excludeThumbSelector)) return;
        const highResSrc = config.getHighResUrl(thumb.src);
        if (!highResSrc) return;
        previewImg.src = highResSrc;
        hoverContainer.style.display = 'block';
      });

      document.addEventListener('mousemove', (e) => {
        if (hoverContainer.style.display === 'block') {
          let x = e.clientX + 15, y = e.clientY + 15;
          const rect = hoverContainer.getBoundingClientRect();
          const w = rect.width || 350, h = rect.height || 500;
          if (x + w > window.innerWidth) x = e.clientX - w - 10;
          if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
          hoverContainer.style.left = x + 'px';
          hoverContainer.style.top = y + 'px';
        }
      });

      document.addEventListener('mouseout', (e) => {
        const thumb = e.target.closest(config.thumbSelector);
        if (thumb) { hoverContainer.style.display = 'none'; previewImg.src = ''; }
      });
    }
  }
});

function showToast(book) {
  let container = document.getElementById('book-manager-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'book-manager-toast-container';
    container.style.cssText = `position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); z-index: 999999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;`;
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const typeStr = book.type === 'exclude' ? '제외' : '미완';
  const typeColor = book.type === 'exclude' ? '#ff6b6b' : '#4dabf7'; 
  let details = [];
  if (book.resolution) details.push(book.resolution);
  if (book.lastVol) details.push(book.lastVol + '권');
  const detailStr = details.length > 0 ? ` <span style="color:#adb5bd; font-size:12px; font-weight:normal;">(${details.join(' | ')})</span>` : '';

  toast.innerHTML = `<span style="color:${typeColor}; margin-right:5px;">[${typeStr}]</span>${book.title}${detailStr}`;
  toast.style.cssText = `background: rgba(33, 37, 41, 0.95); color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.2); opacity: 0; transform: translateY(20px); transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); white-space: nowrap; text-align: center;`;
  container.appendChild(toast);

  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
  
  // 👇 [수정됨] 등록 알림도 5초(5000ms) 유지
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)';
    toast.addEventListener('transitionend', () => toast.remove());
  }, 5000);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SHOW_TOAST" && request.book) showToast(request.book);
  else if (request.action === "SHOW_INFO_TOAST") showInfoToast(request.msg, request.isError);
});