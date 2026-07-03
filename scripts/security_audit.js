// Repository-wide Open Source Readiness & Security Audit Scanner
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const excludeDirs = ['.git', 'node_modules', 'dist', '.gemini', '.tempmediaStorage'];
const findings = [];

function scanDir(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (excludeDirs.includes(item)) continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else {
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath) {
  const ext = path.extname(filePath);
  const skipExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.db', '.db-shm', '.db-wal', '.tar.gz', '.zip'];
  if (skipExts.includes(ext)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Skip lock and vendor files
  if (filePath.includes('package-lock.json')) return;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const lowerLine = line.toLowerCase();
    const relPath = path.relative(projectRoot, filePath);

    // 1. Personal username scanner
    if (line.includes('developer') || line.includes('developer') || line.includes('developer') || line.includes('gmail.com')) {
      // Ignore matches in audit logs files, checklist files, or scanner files themselves
      if (!relPath.includes('OPEN_SOURCE') && !relPath.includes('security_audit.js') && !relPath.includes('check_docs.js')) {
        findings.push({
          severity: 'Critical',
          file: relPath,
          line: lineNum,
          finding: 'Personal information identified',
          recommendation: 'Remove name, email address, or developer directory path.'
        });
      }
    }

    // 2. Absolute filesystem paths scanner
    const hasAbsolute = line.match(/\b(c:\\users\\|d:\\my_projects|\/home\/[a-z0-9_-]+\/)/i);
    if (hasAbsolute) {
      if (!relPath.includes('OPEN_SOURCE') && !relPath.includes('security_audit.js') && !relPath.includes('check_docs.js') && !relPath.includes('generate_licenses.js')) {
        findings.push({
          severity: 'High',
          file: relPath,
          line: lineNum,
          finding: `Absolute filesystem path identified: ${hasAbsolute[0]}`,
          recommendation: 'Replace with portable relative path constructs (process.cwd(), relative paths).'
        });
      }
    }

    // 3. Private Local IP scanner
    const ipMatch = line.match(/\b(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3})\b/);
    if (ipMatch) {
      // Ignore generic documented placeholders in README or checklists
      if (!line.includes('<server-ip>') && !line.includes('<router-ip>') && !relPath.includes('OPEN_SOURCE') && !relPath.includes('security_audit.js')) {
        findings.push({
          severity: 'Medium',
          file: relPath,
          line: lineNum,
          finding: `Private network IP address identified: ${ipMatch[0]}`,
          recommendation: 'Replace with generic network placeholders (e.g. <server-ip>, <router-ip>).'
        });
      }
    }

    // 4. Hardcoded security key scanner
    if (
      (lowerLine.includes('secret') || lowerLine.includes('token') || lowerLine.includes('password') || lowerLine.includes('private_key')) &&
      !lowerLine.includes('schema') && 
      !lowerLine.includes('description') &&
      !lowerLine.includes('key:') &&
      !lowerLine.includes('label') &&
      !lowerLine.includes('type') &&
      line.includes(' = ') &&
      !line.includes('process.env')
    ) {
      const valuePart = line.split('=')[1]?.trim() || '';
      if (
        (valuePart.startsWith("'") || valuePart.startsWith('"') || valuePart.startsWith('`')) &&
        valuePart.length > 10 &&
        !valuePart.includes('key') &&
        !valuePart.includes('jwt') &&
        !relPath.includes('security_audit.js') &&
        !relPath.includes('auth.test.ts') &&
        !relPath.includes('OPEN_SOURCE')
      ) {
        findings.push({
          severity: 'Critical',
          file: relPath,
          line: lineNum,
          finding: 'Potential hardcoded token, password, or encryption secret',
          recommendation: 'Retrieve variable from environment variables.'
        });
      }
    }
  });
}

console.log('Initiating security audit scan...');
scanDir(projectRoot);
console.log(`Scan complete. Found ${findings.length} issues.\n`);

if (findings.length > 0) {
  console.log('| Severity | File | Line | Finding | Recommendation |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');
  findings.forEach(f => {
    console.log(`| **${f.severity}** | ${f.file} | ${f.line} | ${f.finding} | ${f.recommendation} |`);
  });
  process.exit(1);
} else {
  console.log('Open Source Readiness Status: Passed');
  process.exit(0);
}
