// 存储被锁定的标签ID
let lockedTabs = new Set();
// 存储标签ID到URL的映射
let tabUrlMap = new Map();

// 监听扩展安装
chrome.runtime.onInstalled.addListener(function() {
  console.log('Tab Locker extension installed');
  // 初始化存储
  chrome.storage.local.set({
    lockedUrls: [],
    isLocked: false
  });
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'lock') {
    updateLockedTabs();
  } else if (request.action === 'unlock') {
    lockedTabs.clear();
    tabUrlMap.clear();
  }
});

// 监听标签更新事件
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    checkAndLockTab(tabId, tab.url);
  }
});

// 监听标签创建事件
chrome.tabs.onCreated.addListener(function(tab) {
  if (tab.url) {
    checkAndLockTab(tab.id, tab.url);
  }
});

// 监听标签关闭尝试事件
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  // 如果标签被锁定，尝试重新打开
  if (lockedTabs.has(tabId)) {
    const closedTabUrl = tabUrlMap.get(tabId);
    if (closedTabUrl) {
      chrome.storage.local.get(['isLocked'], function(result) {
        if (result.isLocked) {
          // 只重新打开被关闭的特定标签
          setTimeout(function() {
            chrome.tabs.create({ url: closedTabUrl }, function(newTab) {
              lockedTabs.add(newTab.id);
              tabUrlMap.set(newTab.id, closedTabUrl);
              console.log('Reopened locked tab:', closedTabUrl);
            });
          }, 100);
        }
      });
    }
    // 清理映射
    lockedTabs.delete(tabId);
    tabUrlMap.delete(tabId);
  }
});

// 更高级的方法：使用beforeunload监听
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && lockedTabs.has(tabId)) {
    // 注入脚本来阻止页面关闭
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: preventClose
    });
  }
});

// 注入到页面的函数，用于阻止关闭
function preventClose() {
  window.addEventListener('beforeunload', function(e) {
    e.preventDefault();
    e.returnValue = '';
    return '此标签页已被锁定，无法关闭。请点击扩展中的解锁按钮来解除锁定。';
  });
  
  // 阻止Ctrl+W等快捷键
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      alert('此标签页已被锁定，无法关闭。');
    }
  });
}

// 检查URL是否匹配锁定列表
function checkAndLockTab(tabId, url) {
  chrome.storage.local.get(['lockedUrls', 'isLocked'], function(result) {
    if (result.isLocked && result.lockedUrls && result.lockedUrls.length > 0) {
      result.lockedUrls.forEach(function(lockedUrl) {
        if (urlMatches(url, lockedUrl)) {
          lockedTabs.add(tabId);
          tabUrlMap.set(tabId, url);
          console.log('Tab locked:', url);
          
          // 注入防关闭脚本
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: preventClose
          }).catch(err => console.log('Script injection failed:', err));
        }
      });
    }
  });
}

// 更新所有锁定的标签
function updateLockedTabs() {
  chrome.storage.local.get(['lockedUrls', 'isLocked'], function(result) {
    if (result.isLocked && result.lockedUrls && result.lockedUrls.length > 0) {
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(function(tab) {
          result.lockedUrls.forEach(function(lockedUrl) {
            if (urlMatches(tab.url, lockedUrl)) {
              lockedTabs.add(tab.id);
              tabUrlMap.set(tab.id, tab.url);
              
              // 注入防关闭脚本
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: preventClose
              }).catch(err => console.log('Script injection failed:', err));
            }
          });
        });
      });
    }
  });
}

// URL匹配函数
function urlMatches(currentUrl, lockedUrl) {
  if (!currentUrl || !lockedUrl) return false;
  
  try {
    const current = new URL(currentUrl);
    const locked = new URL(lockedUrl.startsWith('http') ? lockedUrl : 'http://' + lockedUrl);
    
    // 检查域名匹配
    return current.hostname === locked.hostname;
  } catch (e) {
    // 如果URL解析失败，进行简单的字符串匹配
    return currentUrl.includes(lockedUrl) || lockedUrl.includes(currentUrl);
  }
}