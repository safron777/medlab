// Ensure localStorage is available before any module is imported
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}
