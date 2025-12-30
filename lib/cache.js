const repoCache = new Map();

export function getCachedRepo(repoKey) {
  const cached = repoCache.get(repoKey);
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.data;
  }
  return null;
}

export function setCachedRepo(repoKey, data) {
  repoCache.set(repoKey, {
    data,
    timestamp: Date.now()
  });
}

export function clearCache() {
  repoCache.clear();
}

export function getCacheSize() {
  return repoCache.size;
}
