document.addEventListener('DOMContentLoaded', function() {
  const urlInput = document.getElementById('urlInput');
  const addBtn = document.getElementById('addBtn');
  const unlockBtn = document.getElementById('unlockBtn');
  const lockedUrlsContainer = document.getElementById('lockedUrls');
  const status = document.getElementById('status');

  // 加载已锁定的URLs
  loadLockedUrls();
  updateStatus();

  // 添加URL
  addBtn.addEventListener('click', addUrl);
  urlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addUrl();
    }
  });

  // 解锁所有标签
  unlockBtn.addEventListener('click', function() {
    chrome.storage.local.set({ 
      lockedUrls: [], 
      isLocked: false 
    }, function() {
      chrome.runtime.sendMessage({ action: 'unlock' });
      loadLockedUrls();
      updateStatus();
    });
  });

  function addUrl() {
    const url = urlInput.value.trim();
    if (!url) return;

    // 简单的URL验证
    if (!isValidUrl(url)) {
      alert('请输入有效的URL地址');
      return;
    }

    chrome.storage.local.get(['lockedUrls'], function(result) {
      const lockedUrls = result.lockedUrls || [];
      
      if (!lockedUrls.includes(url)) {
        lockedUrls.push(url);
        chrome.storage.local.set({ 
          lockedUrls: lockedUrls, 
          isLocked: true 
        }, function() {
          chrome.runtime.sendMessage({ action: 'lock' });
          urlInput.value = '';
          loadLockedUrls();
          updateStatus();
        });
      } else {
        alert('该URL已经在锁定列表中');
      }
    });
  }

  function loadLockedUrls() {
    chrome.storage.local.get(['lockedUrls'], function(result) {
      const lockedUrls = result.lockedUrls || [];
      lockedUrlsContainer.innerHTML = '';

      lockedUrls.forEach(function(url, index) {
        const urlItem = document.createElement('div');
        urlItem.className = 'url-item';
        
        urlItem.innerHTML = `
          <span class="url-text">${url}</span>
          <button class="remove-btn" data-index="${index}">移除</button>
        `;
        
        lockedUrlsContainer.appendChild(urlItem);
      });

      // 添加移除按钮事件监听
      document.querySelectorAll('.remove-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const index = parseInt(this.getAttribute('data-index'));
          removeUrl(index);
        });
      });
    });
  }

  function removeUrl(index) {
    chrome.storage.local.get(['lockedUrls'], function(result) {
      const lockedUrls = result.lockedUrls || [];
      lockedUrls.splice(index, 1);
      
      const isLocked = lockedUrls.length > 0;
      chrome.storage.local.set({ 
        lockedUrls: lockedUrls, 
        isLocked: isLocked 
      }, function() {
        if (!isLocked) {
          chrome.runtime.sendMessage({ action: 'unlock' });
        }
        loadLockedUrls();
        updateStatus();
      });
    });
  }

  function updateStatus() {
    chrome.storage.local.get(['isLocked'], function(result) {
      const isLocked = result.isLocked || false;
      const statusSpan = status.querySelector('span');
      
      if (isLocked) {
        statusSpan.textContent = '标签已锁定';
        statusSpan.className = 'locked';
      } else {
        statusSpan.textContent = '标签未锁定';
        statusSpan.className = 'unlocked';
      }
    });
  }

  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      // 尝试添加协议
      try {
        new URL('http://' + string);
        return true;
      } catch (_) {
        return false;
      }
    }
  }
});