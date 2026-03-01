const listBody = document.getElementById('listBody');

// [추가] 날짜 포맷 변환 및 파싱 헬퍼 함수
function parseDateStr(str) {
    if (!str) return 0;
    let d = new Date(str).getTime();
    if (!isNaN(d)) return d;
    // 기존 데이터 호환: "2026. 3. 1." 형태를 "2026/3/1"로 변환 후 밀리초 추출
    d = new Date(str.replace(/\.\s*/g, '/').replace(/\/$/, '')).getTime();
    return isNaN(d) ? 0 : d;
}

function formatDisplayDate(str) {
    if (!str) return '';
    // 시분초 포맷(T 포함)인 경우 화면 표시용 날짜(2026. 3. 1.)로 깔끔하게 변환
    if (str.includes('T') || str.includes('-')) {
        return new Date(str).toLocaleDateString('ko-KR');
    }
    return str; // 기존 데이터는 그대로 출력
}

function renderSites() {
  chrome.storage.local.get({ allowedSites: [] }, (data) => {
    const sites = Array.isArray(data.allowedSites) ? data.allowedSites : [];
    document.getElementById('siteList').innerHTML = sites.map(s => `<span class="site-tag">${s} <b style="color:red; cursor:pointer;" data-site="${s}">×</b></span>`).join('');
  });
}

function renderList(filter = "") {
  chrome.storage.local.get({ bookList: [], sortOption: 'id_desc' }, (data) => {
    listBody.innerHTML = '';
    let list = Array.isArray(data.bookList) ? data.bookList : [];
    
    const filteredList = list.filter(b => b && b.title && b.title.toLowerCase().includes(filter.toLowerCase()));
    
    const countDisplay = document.getElementById('listCountDisplay');
    if (countDisplay) {
        if (filter.trim() === "") {
            countDisplay.innerHTML = `총 <span style="color:#007bff;">${filteredList.length}</span>건이 등록되어 있습니다.`;
        } else {
            countDisplay.innerHTML = `검색 결과: <span style="color:#e83e8c;">${filteredList.length}</span>건`;
        }
    }

    // [수정] 정밀해진 시간 기준 정렬 로직 적용
    let sortFn;
    switch(data.sortOption) {
        case 'title_asc': 
            sortFn = (a, b) => (a.title || '').localeCompare(b.title || ''); 
            break;
        case 'title_desc': 
            sortFn = (a, b) => (b.title || '').localeCompare(a.title || ''); 
            break;
        case 'date_asc': 
            sortFn = (a, b) => (parseDateStr(a.date) - parseDateStr(b.date)) || ((a.id || 0) - (b.id || 0)); 
            break;
        case 'date_desc': 
            sortFn = (a, b) => (parseDateStr(b.date) - parseDateStr(a.date)) || ((b.id || 0) - (a.id || 0));
            break;
        case 'id_asc': 
            sortFn = (a, b) => (a.id || 0) - (b.id || 0); 
            break;
        case 'id_desc': 
        default: 
            sortFn = (a, b) => (b.id || 0) - (a.id || 0); 
            break;
    }

    filteredList
      .sort(sortFn)
      .forEach(book => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><select class="edit-type" data-id="${book.id}"><option value="exclude" ${book.type==='exclude'?'selected':''}>제외</option><option value="incomplete" ${book.type==='incomplete'?'selected':''}>미완</option></select></td>
          <td><input type="text" class="edit-title" value="${book.title}" data-id="${book.id}"></td>
          <td><input type="text" class="edit-res" value="${book.resolution||''}" data-id="${book.id}"></td>
          <td><input type="text" class="edit-vol" value="${book.lastVol||''}" data-id="${book.id}"></td>
          <td>${formatDisplayDate(book.date)}</td>
          <td><button class="btn-save" data-id="${book.id}">수정</button><button class="btn-del" data-id="${book.id}">삭제</button></td>
        `;
        listBody.appendChild(tr);
      });
  });
}

// 1. 타입 일괄 수정 기능
document.getElementById('batchUpdateBtn').onclick = () => {
    const targetType = document.getElementById('batchTypeSelect').value;
    const filter = document.getElementById('searchInput').value.toLowerCase();
    
    if(!confirm(`현재 검색된 모든 항목을 [${targetType === 'exclude' ? '제외' : '미완'}] 타입으로 변경하시겠습니까?`)) return;

    chrome.storage.local.get({ bookList: [] }, (data) => {
        let list = Array.isArray(data.bookList) ? data.bookList : [];
        const today = new Date().toISOString(); // [수정] 시분초 포함 저장

        const updatedList = list.map(book => {
            if (book && book.title && book.title.toLowerCase().includes(filter)) {
                return { ...book, type: targetType, date: today };
            }
            return book;
        });

        chrome.storage.local.set({ bookList: updatedList }, () => {
            alert('일괄 수정이 완료되었습니다.');
            renderList(filter);
        });
    });
};

// 2. 데이터 백업 기능
document.getElementById('exportBtn').onclick = () => {
    chrome.storage.local.get({ bookList: [] }, (data) => {
        const blob = new Blob([JSON.stringify(data.bookList, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'list.json';
        a.click();
        URL.revokeObjectURL(url);

        const now = new Date();
        const backupTime = now.toLocaleString('ko-KR'); 
        chrome.storage.local.set({ lastBackup: backupTime }, () => {
            const timeSpan = document.getElementById('lastBackupTime');
            if(timeSpan) timeSpan.innerText = `최근 백업: ${backupTime}`;
        });
    });
};

// 3. 데이터 복구 기능
document.getElementById('importBtn').onclick = () => document.getElementById('fileInput').click();

document.getElementById('fileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('파일의 데이터가 기존 데이터와 교체됩니다. 계속하시겠습니까?')) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (Array.isArray(importedData)) {
                chrome.storage.local.set({ bookList: importedData }, () => {
                    alert('데이터 복구가 완료되었습니다.');
                    const filter = document.getElementById('searchInput').value;
                    renderList(filter);
                });
            } else {
                alert('올바른 JSON 형식이 아닙니다.');
            }
        } catch (err) {
            alert('파일을 읽는 중 오류가 발생했습니다.');
        }
        e.target.value = '';
    };
    reader.readAsText(file);
};

// 4. 일괄 저장 텍스트박스
document.getElementById('saveBtn').onclick = () => {
  const lines = document.getElementById('bulkInput').value.split('\n').filter(t => t.trim());
  chrome.storage.local.get({ bookList: [] }, (data) => {
    let currentList = Array.isArray(data.bookList) ? data.bookList : [];
    lines.forEach(line => {
      const resMatch = line.match(/\d{3,4}\s*px/gi);
      const volMatch = line.match(/~(\d+)/) || line.match(/(\d+)\s*(?:권|완결|화)/) || line.match(/(\d+)\s*$/);
      
      let cleanTitle = line
        .replace(/e-?book|e북/gi, '')
        .replace(/19금|19\+|N새글|고화질|저화질|무료/g, '')
        .replace(/\d{3,4}\s*px/gi, '')
        .replace(/\d+\s*[~-]\s*\d+/g, '')
        .replace(/\d+\s*권/g, '')
        .replace(/완결/g, '')
        .replace(/개$/g, '')
        .replace(/(\d+)?권/g, '')
        .replace(/(\d+)?완/g, '')
        .replace(/\s?권$/g, '')
        .replace(/\s?완$/g, '')
        .replace(/댓글\s*[+\d]*개?/gi, '')
        .replace(/[\[\(].*?[\]\)]/g, '')
        .replace(/[^a-zA-Z0-9가-힣\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const normalizedNewTitle = cleanTitle.replace(/\s+/g, '').toLowerCase()
      const existingIdx = currentList.findIndex(b => b.title.replace(/\s+/g, '').toLowerCase() === normalizedNewTitle);
      
      const bookData = { 
        type: "exclude", 
        title: cleanTitle, 
        resolution: resMatch ? Array.from(new Set(resMatch)).join(',') : "", 
        lastVol: volMatch ? parseInt(volMatch[1], 10).toString() : "", 
        date: new Date().toISOString(), // [수정] 시분초 포함 저장
        id: Date.now() + Math.random() 
      };

      if (existingIdx > -1) currentList[existingIdx] = { ...currentList[existingIdx], ...bookData };
      else currentList.unshift(bookData);
    });
    chrome.storage.local.set({ bookList: currentList }, () => { 
        document.getElementById('bulkInput').value = ''; 
        const filter = document.getElementById('searchInput').value;
        renderList(filter);
    });
  });
};

// 5. 버튼 클릭 이벤트 (삭제 및 수정)
document.body.onclick = (e) => {
  const id = parseFloat(e.target.dataset.id);
  const site = e.target.dataset.site;
  const currentFilter = document.getElementById('searchInput').value; 

  if (id && e.target.classList.contains('btn-del')) {
    chrome.storage.local.get({ bookList: [] }, (data) => {
      const list = Array.isArray(data.bookList) ? data.bookList : [];
      chrome.storage.local.set({ bookList: list.filter(b => b.id !== id) }, () => {
          renderList(currentFilter); 
      });
    });
  } else if (id && e.target.classList.contains('btn-save')) {
    chrome.storage.local.get({ bookList: [] }, (data) => {
      const list = Array.isArray(data.bookList) ? data.bookList : [];
      const idx = list.findIndex(b => b.id === id);
      const row = e.target.closest('tr');
      if (idx > -1) {
        const today = new Date().toISOString(); // [수정] 시분초 포함 갱신
        
        list[idx] = { 
            ...list[idx], 
            type: row.querySelector('.edit-type').value, 
            title: row.querySelector('.edit-title').value.trim(), 
            resolution: row.querySelector('.edit-res').value.trim(), 
            lastVol: row.querySelector('.edit-vol').value.trim(),
            date: today 
        };
        chrome.storage.local.set({ bookList: list }, () => {
            alert('수정 완료');
            renderList(currentFilter); 
        });
      }
    });
  } else if (site) {
    chrome.storage.local.get({ allowedSites: [] }, (data) => {
      const sites = Array.isArray(data.allowedSites) ? data.allowedSites : [];
      chrome.storage.local.set({ allowedSites: sites.filter(s => s !== site) }, renderSites);
    });
  }
};

document.getElementById('addSiteBtn').onclick = () => {
  const val = document.getElementById('siteInput').value.trim().replace(/^https?:\/\//, '').split('/')[0];
  if (val) chrome.storage.local.get({ allowedSites: [] }, (data) => { 
    const currentSites = Array.isArray(data.allowedSites) ? data.allowedSites : [];
    if (!currentSites.includes(val)) chrome.storage.local.set({ allowedSites: [...currentSites, val] }, () => { document.getElementById('siteInput').value = ''; renderSites(); }); 
  });
};

document.getElementById('searchInput').oninput = (e) => renderList(e.target.value);

document.getElementById('sortSelect').onchange = (e) => {
    chrome.storage.local.set({ sortOption: e.target.value }, () => {
        const filter = document.getElementById('searchInput').value;
        renderList(filter);
    });
};

document.addEventListener('DOMContentLoaded', () => { 
    chrome.storage.local.get({ lastBackup: null, sortOption: 'id_desc' }, (data) => {
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) sortSelect.value = data.sortOption;

        renderList(); 
        renderSites(); 

        const timeSpan = document.getElementById('lastBackupTime');
        if (timeSpan) {
            if (data.lastBackup) {
                timeSpan.innerText = `최근 백업: ${data.lastBackup}`;
            } else {
                timeSpan.innerText = `최근 백업: 기록 없음`;
            }
        }
    });
});