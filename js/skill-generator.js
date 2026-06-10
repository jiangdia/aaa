/**
 * Converts parsed PPT slides into ppt-generator skill compatible formats.
 */
const SkillGenerator = (() => {
  const SLIDE_TYPES = [
    { type: 'cover', label: '封面页', match: (s, i) => i === 0 },
    { type: 'impact', label: '标题冲击页', match: (s) => s.texts.length <= 2 && s.title.length <= 20 },
    { type: 'quote', label: '金句强调页', match: (s) => /[""「」]|——|—/.test(s.content) },
    { type: 'data', label: '数据展示页', match: (s) => /\d+[%xX倍]|^\d+$/.test(s.content.replace(/\s/g, '')) },
    { type: 'compare', label: '对比页', match: (s) => /vs|对比|传统|全新|之前|之后|旧|新/.test(s.content) },
    { type: 'step', label: '步骤说明页', match: (s) => /步骤|第[一二三四五六七八九十\d]+步|^\d+[\.、]/.test(s.content) },
    { type: 'list', label: '列表页', match: (s) => s.body.length >= 3 || (s.texts.length >= 3 && s.texts.length <= 6) },
    { type: 'ending', label: '结尾行动页', match: (s, i, total) => i === total - 1 },
  ];

  function inferSlideType(slide, index, total) {
    for (const st of SLIDE_TYPES) {
      if (st.match(slide, index, total)) return st;
    }
    return { type: 'impact', label: '标题冲击页' };
  }

  function trimText(text, max = 40) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const lastPunct = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('。'), cut.lastIndexOf(' '));
    return (lastPunct > max * 0.5 ? cut.slice(0, lastPunct) : cut) + '…';
  }

  function generateJobTitle(text, index) {
    const raw = (text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return `第 ${index} 章`;
    const noPunct = raw.replace(/[，。！？、：；""「」]/g, '');
    if (noPunct.length <= 12) return noPunct;

    const contrast = raw.match(/(.{2,8})[与和及vsVS](.{2,8})/);
    if (contrast) {
      const t = `${contrast[1]}·${contrast[2]}`.slice(0, 12);
      if (t.length >= 4) return t;
    }
    if (/\d+[%xX倍]/.test(raw)) {
      const num = raw.match(/\d+[%xX倍]?/)?.[0] || '';
      const rest = raw.replace(num, '').trim().slice(0, 12 - num.length);
      return (num + rest).slice(0, 12);
    }
    if (raw.endsWith('？') || raw.endsWith('?')) return raw.slice(0, 12);
    return noPunct.slice(0, 12);
  }

  function refineBullets(texts) {
    const seen = new Set();
    const bullets = [];
    for (const t of texts) {
      const cleaned = t.replace(/^[\d•\-·\.\)、\s]+/, '').trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      bullets.push(trimText(cleaned, 36));
      if (bullets.length >= 5) break;
    }
    return bullets;
  }

  function generateRefinedScript(slides) {
    const lines = ['# 提炼讲稿', '', '> 从 PPT 自动提炼 · 每节 ≤12 字标题 · 要点精简至演示节奏', ''];
    slides.forEach((slide, i) => {
      const st = inferSlideType(slide, i, slides.length);
      const title = generateJobTitle(slide.title || slide.content.split('\n')[0], i + 1);
      lines.push(`## ${title}`);
      lines.push(`<!-- ${st.label} -->`);
      lines.push('');

      const sourceTexts = slide.title && slide.body.length
        ? slide.body
        : slide.content.split('\n').filter(Boolean).slice(slide.title ? 0 : 1);

      const bullets = refineBullets(sourceTexts);
      if (bullets.length) {
        bullets.forEach((b) => lines.push(`- ${b}`));
      } else if (st.type === 'data') {
        lines.push(`- ${trimText(slide.content, 20)}`);
      } else {
        lines.push('- （待补充核心观点）');
      }
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function generateSlideOutline(slides) {
    const total = slides.length;
    const lines = ['# 幻灯片结构大纲\n', `> 共 ${total} 页 · 9:16 竖屏 · 乔布斯风极简科技\n`];
    slides.forEach((slide, i) => {
      const st = inferSlideType(slide, i, total);
      const title = generateJobTitle(slide.title || slide.content.split('\n')[0], i + 1);
      lines.push(`### 第 ${i + 1} 页 · ${st.label}`);
      lines.push(`- **类型**: ${st.type}`);
      lines.push(`- **标题**: ${title}`);
      if (slide.body.length) {
        lines.push(`- **要点**: ${slide.body.slice(0, 5).join(' / ')}`);
      }
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function slugFromFileName(fileName) {
    const base = (fileName || 'custom-ppt').replace(/\.pptx$/i, '');
    return base
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'custom-ppt';
  }

  function buildRawScript(slides) {
    const lines = ['## 用户原始讲稿\n', '> 以下内容从上传的 PPT 自动提取，生成时请保留核心信息。\n'];
    slides.forEach((slide) => {
      lines.push(`### 第 ${slide.index} 页\n`);
      lines.push(slide.content || '（空白页）');
      lines.push('');
    });
    return lines.join('\n');
  }

  function generateSkillMd(slides, fileName) {
    const slug = slugFromFileName(fileName);
    const title = slides[0]?.title || slides[0]?.content.split('\n')[0] || '自定义演示';
    const pageCount = Math.min(Math.max(slides.length, 8), 20);
    const rawScript = buildRawScript(slides);
    const outline = generateSlideOutline(slides);

    return `---
name: ${slug}
description: 基于用户上传的 PPT「${title}」生成乔布斯风极简科技感竖屏 HTML 演示稿。当用户需要演示、Slides、幻灯片，或提及「${title}」时触发此技能。输出为单个可直接运行的 HTML 文件。
---

# ${title}

将用户讲稿转换为乔布斯风极简科技感竖屏 HTML 演示稿。

## 设计哲学

- **极简主义** - 一屏只讲一件事
- **强视觉对比** - 深色背景 + 白色文字
- **高留白** - 禁止密集排版
- **强节奏感** - 让观众想继续看

${rawScript}

## 生成流程（必须严格遵循）

### Step 1: 读取讲稿
读取上方用户原始讲稿，保留核心信息，不随意删改关键数据与观点。

### Step 2: 生成提炼版讲稿
将内容精简、增强冲击力、适配演示场景，输出 Markdown 格式。

### Step 3: 生成乔布斯风标题
为每个章节生成标题，必须满足：
- ≤12 字
- 采用以下形式之一：对比式、问题式、断言式、数字式、比喻式
- 自检：是否让人想继续听？

### Step 4: 设计幻灯片结构
规划页面顺序和类型，参考 ppt-generator skill 的 slide-types：
- 封面页、标题冲击页、金句强调页、步骤说明页
- 对比页、数据展示页、列表页（≤5点）、结尾行动页

建议结构（基于原 PPT ${slides.length} 页）：

${outline.split('\n').slice(2).join('\n')}

### Step 5: 生成 HTML
使用 ppt-generator skill 的 template.html 作为基础模板生成完整 HTML。

### Step 6: 填充内容
添加动态背景光斑、交互逻辑、平滑切换动画。

## 输出顺序（必须依次输出）

1. **提炼后的讲稿**（Markdown）
2. **幻灯片结构大纲**
3. **完整 HTML 代码**

## 视觉规范速查

| 项目 | 规范 |
|------|------|
| 比例 | 9:16 竖屏 |
| 背景 | #000000 或 #0a0a0a + 模糊光斑动画 |
| 主文字 | #ffffff |
| 辅助文字 | #9ca3af |
| 中文字体 | HarmonyOS Sans SC / 思源黑体 |
| 英文字体 | Inter / Roboto |
| 标题字重 | font-black / font-bold |
| 正文字重 | font-light / font-normal |

## 交互要求

- 键盘 ← → 翻页
- 底部进度导航条
- 平滑切换动画

## 技术栈

- TailwindCSS（国内 CDN）
- 复杂页面使用 Vue3（CDN）
- 单个 HTML 文件，可直接打开运行

## 严禁行为

- 堆字 / 密集排版
- 花哨配色
- 复杂图表
- 横屏比例
- 偏离极简科技风

## 默认规则

- 目标页数：${pageCount} 页（原 PPT ${slides.length} 页）
- 默认风格：乔布斯风极简科技感
`.trim();
  }

  return {
    generateSkillMd,
    generateRefinedScript,
    generateSlideOutline,
    slugFromFileName,
    inferSlideType,
    generateJobTitle,
    refineBullets,
    trimText,
  };
})();
