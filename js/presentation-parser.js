/**
 * Universal presentation parser — client-side OOXML/ODP + server fallback for legacy .ppt/.pps
 */
const PresentationParser = (() => {
  const EXT_MAP = {
    pptx: 'ooxml', ppsx: 'ooxml', ppt: 'ole', pps: 'ole', odp: 'odp',
  };

  const ACCEPT = '.ppt,.pptx,.pps,.ppsx,.odp';

  function decodeXml(s) {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  }

  function buildSlide(texts) {
    const content = texts.join('\n');
    return {
      index: 0,
      texts,
      content,
      preview: content.replace(/\n/g, ' · ').slice(0, 80) || '(空白页)',
      title: texts[0] || '',
      body: texts.slice(1),
    };
  }

  function finalize(slides) {
    return slides.map((s, i) => ({ ...s, index: i + 1 }));
  }

  function extractOoxmlTexts(xml) {
    const texts = [];
    const regex = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
    let m;
    while ((m = regex.exec(xml)) !== null) {
      const t = decodeXml(m[1]);
      if (t) texts.push(t);
    }
    return texts;
  }

  function extractOdpTexts(xml) {
    const texts = [];
    const pRegex = /<text:p[^>]*>([\s\S]*?)<\/text:p>/g;
    let m;
    while ((m = pRegex.exec(xml)) !== null) {
      const inner = m[1].replace(/<[^>]+>/g, '');
      const t = decodeXml(inner);
      if (t) texts.push(t);
    }
    if (!texts.length) {
      const spanRegex = /<text:span[^>]*>([^<]*)<\/text:span>/g;
      while ((m = spanRegex.exec(xml)) !== null) {
        const t = decodeXml(m[1]);
        if (t) texts.push(t);
      }
    }
    return texts;
  }

  function slideNumber(path) {
    const m = path.match(/slide(\d+)\.xml$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  async function detectType(file, buffer) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const view = new Uint8Array(buffer, 0, 4);
    const isZip = view[0] === 0x50 && view[1] === 0x4b;
    const isOle = view[0] === 0xd0 && view[1] === 0xcf;

    if (isOle || ext === 'ppt' || ext === 'pps') return 'ole';

    if (isZip) {
      try {
        const zip = await JSZip.loadAsync(buffer);
        if (zip.file('content.xml') || Object.keys(zip.files).some((p) => p.includes('content.xml'))) {
          return 'odp';
        }
        if (Object.keys(zip.files).some((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))) {
          return 'ooxml';
        }
      } catch (_) { /* fall through */ }
      if (ext === 'odp') return 'odp';
      if (ext === 'pptx' || ext === 'ppsx') return 'ooxml';
    }

    return EXT_MAP[ext] || 'unknown';
  }

  async function parseOoxml(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => slideNumber(a) - slideNumber(b));

    const slides = [];
    for (const path of slidePaths) {
      const xml = await zip.files[path].async('text');
      const texts = extractOoxmlTexts(xml);
      slides.push(buildSlide(texts));
    }
    return finalize(slides);
  }

  async function parseOdp(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const contentPath = Object.keys(zip.files).find((p) => /content\.xml$/i.test(p));
    if (!contentPath) throw new Error('无效的 ODP 文件');

    const xml = await zip.files[contentPath].async('text');
    const pageRegex = /<draw:page[\s\S]*?(?=<draw:page|<\/office:body>|$)/g;
    const pages = xml.match(pageRegex);

    if (pages && pages.length) {
      const slides = pages.map((page) => buildSlide(extractOdpTexts(page)));
      return finalize(slides);
    }

    return finalize([buildSlide(extractOdpTexts(xml))]);
  }

  async function parseViaServer(file, apiBase) {
    const base = (apiBase || '').replace(/\/$/, '');
    const url = `${base}/api/parse`;
    const form = new FormData();
    form.append('file', file, file.name);

    const res = await fetch(url, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.error || `服务器解析失败 (${res.status})`);
    }
    return data.slides || [];
  }

  async function hasServer(apiBase) {
    try {
      const base = (apiBase || '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function parse(file, options = {}) {
    const { apiBase = '' } = options;
    const buffer = await file.arrayBuffer();
    const type = await detectType(file, buffer);

    if (type === 'ooxml') {
      const slides = await parseOoxml(buffer);
      if (slides.length) return slides;
    }

    if (type === 'odp') {
      try {
        const slides = await parseOdp(buffer);
        if (slides.length) return slides;
      } catch (_) { /* try server */ }
    }

    if (type === 'ole' || type === 'unknown') {
      const serverUp = await hasServer(apiBase);
      if (!serverUp) {
        throw new Error(
          type === 'ole'
            ? '.ppt / .pps 旧格式需要服务端支持。请部署 server 并安装 LibreOffice，或先将文件另存为 .pptx'
            : '无法识别文件格式，请确认文件未损坏'
        );
      }
      return parseViaServer(file, apiBase);
    }

    // OOXML/ODP empty — try server fallback
    const serverUp = await hasServer(apiBase);
    if (serverUp) return parseViaServer(file, apiBase);

    throw new Error('未能从文件中提取内容，请确认幻灯片含可编辑文字');
  }

  return { parse, ACCEPT, detectType };
})();

/** @deprecated alias */
const PptxParser = PresentationParser;
