const BINARY_EXTENSIONS = [
  'exe', 'msi', 'dll', 'so', 'dylib', 'app', 'dmg', 'pkg', 'deb', 'rpm',
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'svg', 'webp', 'tiff', 'psd',
  'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'bin', 'dat', 'db', 'sqlite', 'lock'
];

const ALLOWED_TEXT_FILES = [
  'md', 'markdown', 'txt', 'readme', 'license', 'contributing', 'changelog',
  'gitignore', 'gitattributes', 'editorconfig', 'dockerignore'
];

const EXCLUDED_PATHS = [
  'node_modules', '.git/', 'dist/', 'build/', 'out/', '.next/',
  'coverage/', '.cache/', 'vendor/', '__pycache__/', '.pytest_cache/',
  'target/', 'bin/', 'obj/', '.idea/', '.vscode/', '.DS_Store'
];

export function isAnalyzableFile(path, size = 0) {
  const normalizedPath = path.toLowerCase();
  
  if (EXCLUDED_PATHS.some(excluded => normalizedPath.includes(excluded))) {
    return false;
  }
  
  const fileName = path.split('/').pop().toLowerCase();
  if (ALLOWED_TEXT_FILES.some(allowed => fileName.includes(allowed))) {
    return true;
  }
  
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext && BINARY_EXTENSIONS.includes(ext)) {
    return false;
  }
  
  if (size > 500000) {
    return false;
  }
  
  return true;
}

export function analyzeRepoLanguages(files) {
  const languageCount = {};
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  
  files.forEach(file => {
    const ext = file.path.split('.').pop()?.toLowerCase();
    const lang = getLanguageFromExtension(ext);
    
    if (!languageCount[lang]) {
      languageCount[lang] = { count: 0, bytes: 0 };
    }
    languageCount[lang].count++;
    languageCount[lang].bytes += file.size;
  });
  
  const languages = Object.entries(languageCount)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      bytes: stats.bytes,
      percentage: ((stats.bytes / totalSize) * 100).toFixed(1)
    }))
    .sort((a, b) => b.bytes - a.bytes);
  
  return {
    languages,
    totalFiles: files.length,
    totalSize
  };
}

function getLanguageFromExtension(ext) {
  const langMap = {
    js: 'JavaScript',
    jsx: 'JavaScript',
    ts: 'TypeScript',
    tsx: 'TypeScript',
    py: 'Python',
    java: 'Java',
    cpp: 'C++',
    cc: 'C++',
    cxx: 'C++',
    c: 'C',
    h: 'C/C++',
    cs: 'C#',
    go: 'Go',
    rs: 'Rust',
    php: 'PHP',
    rb: 'Ruby',
    swift: 'Swift',
    kt: 'Kotlin',
    scala: 'Scala',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    json: 'JSON',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    md: 'Markdown',
    sh: 'Shell',
    bash: 'Bash',
    sql: 'SQL',
    r: 'R',
    m: 'Objective-C',
    vue: 'Vue',
    dart: 'Dart',
    lua: 'Lua'
  };
  return langMap[ext] || 'Other';
}
