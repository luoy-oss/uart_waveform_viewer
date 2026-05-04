// ============================================================
//  国际化 (i18n)
// ============================================================
(function() {
  'use strict';

  const STORAGE_KEY = 'uwv-lang';
  const CUSTOM_TYPE_NAMES_KEY = 'uwv-custom-typeNames';
  let currentLocale = 'zh';
  let locales = { zh: null, en: null };

  function detectLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'zh' || saved === 'en')) return saved;
    const nav = navigator.language || navigator.userLanguage || 'zh';
    return nav.startsWith('zh') ? 'zh' : 'en';
  }

  async function loadLocale(lang) {
    if (locales[lang]) return locales[lang];
    // Check for inline locales (single-file build)
    if (window.__LOCALES__ && window.__LOCALES__[lang]) {
      locales[lang] = window.__LOCALES__[lang];
      return locales[lang];
    }
    try {
      const resp = await fetch('locales/' + lang + '.json');
      locales[lang] = await resp.json();
      return locales[lang];
    } catch (e) {
      console.error('Failed to load locale:', lang, e);
      return null;
    }
  }

  async function init() {
    currentLocale = detectLanguage();
    await loadLocale(currentLocale);
    applyToDOM();
    updateLangButton();
  }

  function t(key) {
    const locale = locales[currentLocale];
    if (!locale) return key;
    const keys = key.split('.');
    let val = locale;
    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        return key;
      }
    }
    return val;
  }

  function loadCustomTypeNames() {
    try {
      const raw = localStorage.getItem(CUSTOM_TYPE_NAMES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCustomTypeNames(obj) {
    localStorage.setItem(CUSTOM_TYPE_NAMES_KEY, JSON.stringify(obj));
  }

  function getDefaultTypeNames() {
    const locale = locales[currentLocale];
    return (locale && locale.typeNames) || {};
  }

  function getTypeNames() {
    const defaults = getDefaultTypeNames();
    const custom = loadCustomTypeNames();
    return Object.assign({}, defaults, custom);
  }

  async function setLocale(lang) {
    if (lang !== 'zh' && lang !== 'en') return;
    currentLocale = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    await loadLocale(lang);
    applyToDOM();
    updateLangButton();
    document.title = t('title');
  }

  function getLocale() {
    return currentLocale;
  }

  function applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      const key = el.getAttribute('data-i18n');
      const text = t(key);
      if (text !== key) {
        if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'color') {
          // Don't overwrite input values
        } else if (el.tagName === 'OPTION') {
          el.textContent = text;
        } else {
          el.textContent = text;
        }
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      const key = el.getAttribute('data-i18n-title');
      const text = t(key);
      if (text !== key) el.title = text;
    });

    document.querySelectorAll('select').forEach(function(sel) {
      sel.querySelectorAll('option[data-i18n]').forEach(function(opt) {
        const key = opt.getAttribute('data-i18n');
        const text = t(key);
        if (text !== key) opt.textContent = text;
      });
    });
  }

  function updateLangButton() {
    const btn = document.getElementById('btn-lang');
    if (btn) {
      btn.textContent = currentLocale === 'zh' ? 'EN' : '中';
    }
  }

  function toggleLanguage() {
    const newLang = currentLocale === 'zh' ? 'en' : 'zh';
    setLocale(newLang).then(function() {
      if (window.UWV.ui && window.UWV.ui.rebuildChannelList) {
        window.UWV.ui.rebuildChannelList();
      }
      if (window.UWV.ui && window.UWV.ui.updateStatusText) {
        window.UWV.ui.updateStatusText();
      }
    });
  }

  window.UWV = window.UWV || {};
  window.UWV.i18n = {
    init: init,
    t: t,
    setLocale: setLocale,
    getLocale: getLocale,
    getTypeNames: getTypeNames,
    getDefaultTypeNames: getDefaultTypeNames,
    loadCustomTypeNames: loadCustomTypeNames,
    saveCustomTypeNames: saveCustomTypeNames,
    toggleLanguage: toggleLanguage,
    applyToDOM: applyToDOM
  };
})();
