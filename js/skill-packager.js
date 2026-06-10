/**
 * Packages generated skill content + ppt-generator assets into a downloadable ZIP.
 */
const SkillPackager = (() => {
  async function fetchBundleFile(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`无法加载 ${path}`);
    return res.text();
  }

  async function buildSkillZip({ skillMd, refinedScript, slideOutline, fileName, slug }) {
    const zip = new JSZip();
    const root = zip.folder(`${slug}-skill`);

    root.file('SKILL.md', skillMd);
    root.file('讲稿-提炼版.md', refinedScript);
    root.file('幻灯片大纲.md', slideOutline);
    root.file('_meta.json', JSON.stringify({
      source: fileName,
      generatedAt: new Date().toISOString(),
      generator: 'ppt-generator-skill-website',
      version: '1.0.0',
    }, null, 2));

    const bundlePaths = [
      'references/slide-types.md',
      'references/design-spec.md',
      'assets/template.html',
    ];

    for (const path of bundlePaths) {
      const content = await fetchBundleFile(`bundle/${path}`);
      root.file(path, content);
    }

    return zip.generateAsync({ type: 'blob' });
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { buildSkillZip, downloadBlob };
})();
