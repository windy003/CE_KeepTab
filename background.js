// 存储被锁定的标签ID
let lockedTabs = new Set();
// 存储标签ID到URL的映射
let tabUrlMap = new Map();
// 存储标签位置信息（ID -> {url, windowId, index}）
let tabPositionMap = new Map();

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
    tabPositionMap.clear();
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
    const tabPosition = tabPositionMap.get(tabId);
    if (tabPosition) {
      chrome.storage.local.get(['isLocked'], function(result) {
        if (result.isLocked) {
          // 在原来的位置重新打开标签
          setTimeout(function() {
            chrome.tabs.create({ 
              url: tabPosition.url,
              windowId: tabPosition.windowId,
              index: tabPosition.index
            }, function(newTab) {
              if (newTab) {
                lockedTabs.add(newTab.id);
                tabUrlMap.set(newTab.id, tabPosition.url);
                tabPositionMap.set(newTab.id, {
                  url: tabPosition.url,
                  windowId: newTab.windowId,
                  index: newTab.index
                });
                console.log('Reopened locked tab at position:', tabPosition.index, tabPosition.url);
              }
            });
          }, 100);
        }
      });
    }
    // 清理映射
    lockedTabs.delete(tabId);
    tabUrlMap.delete(tabId);
    tabPositionMap.delete(tabId);
  }
});

// 监听标签页更新，确保脚本持续有效
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (lockedTabs.has(tabId)) {
    // 页面开始加载时就注入脚本
    if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: preventClose
      }).catch(err => console.log('Script injection failed:', err));
    }
  }
});

// 定期检查并重新注入脚本（防止脚本失效）
setInterval(function() {
  lockedTabs.forEach(function(tabId) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: preventClose
    }).catch(err => {
      // 如果注入失败，可能标签已关闭，从集合中移除
      console.log('Script re-injection failed for tab:', tabId, err);
    });
  });
}, 5000); // 每5秒检查一次

// 注入到页面的函数，用于阻止关闭
function preventClose() {
  // 防止重复注入
  if (window.tabLockerInjected) {
    return;
  }
  window.tabLockerInjected = true;
  
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
  
  // 定期检查并重新绑定监听器（防止被页面脚本覆盖）
  setInterval(function() {
    if (!window.tabLockerKeyListener) {
      window.tabLockerKeyListener = function(e) {
        if (e.ctrlKey && e.key === 'w') {
          e.preventDefault();
          e.stopPropagation();
          alert('此标签页已被锁定，无法关闭。');
        }
      };
      document.addEventListener('keydown', window.tabLockerKeyListener, true);
    }
  }, 1000);
}

// 检查URL是否匹配锁定列表
function checkAndLockTab(tabId, url) {
  chrome.storage.local.get(['lockedUrls', 'isLocked'], function(result) {
    if (result.isLocked && result.lockedUrls && result.lockedUrls.length > 0) {
      result.lockedUrls.forEach(function(lockedUrl) {
        if (urlMatches(url, lockedUrl)) {
          // 获取标签完整信息以记录位置
          chrome.tabs.get(tabId, function(tab) {
            if (tab) {
              lockedTabs.add(tabId);
              tabUrlMap.set(tabId, url);
              tabPositionMap.set(tabId, {
                url: url,
                windowId: tab.windowId,
                index: tab.index
              });
              console.log('Tab locked:', url, 'at position:', tab.index);
              
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
              tabPositionMap.set(tab.id, {
                url: tab.url,
                windowId: tab.windowId,
                index: tab.index
              });
              
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
    
    // 精确匹配整个URL（包括协议、域名、端口、路径）
    return current.href === locked.href;
  } catch (e) {
    // 如果URL解析失败，进行精确的字符串匹配
    return currentUrl === lockedUrl;
  }
}