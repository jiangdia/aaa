/**
 * Implements ppt-generator skill Steps 4–6: slide structure → HTML → animations.
 */
const HtmlGenerator = (() => {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function splitTitleLines(text) {
    const t = (text || '').trim();
    if (!t) return [''];
    if (t.length <= 14) return [t];
    const mid = Math.floor(t.length / 2);
    const punct = [t.lastIndexOf('，', mid), t.lastIndexOf('。', mid), t.lastIndexOf(' ', mid)]
      .filter((i) => i > 4)
      .sort((a, b) => b - a)[0];
    if (punct > 0) {
      return [t.slice(0, punct).replace(/[，。]$/, ''), t.slice(punct + 1).trim()];
    }
    return [t.slice(0, mid), t.slice(mid)];
  }

  function lightSpots(variant = 1) {
    const sets = [
      ['light-spot-1', 'light-spot-2'],
      ['light-spot-2', 'light-spot-3'],
      ['light-spot-1', 'light-spot-3'],
      ['light-spot-1', 'light-spot-2', 'light-spot-3'],
    ];
    return sets[variant % sets.length].map((c) => `<div class="light-spot ${c}"></div>`).join('\n      ');
  }

  function buildSlideHtml(slide, index, total) {
    const st = SkillGenerator.inferSlideType(slide, index, total);
    const title = SkillGenerator.generateJobTitle(
      slide.title || slide.content.split('\n')[0],
      index + 1
    );
    const body = slide.body?.length ? slide.body : slide.content.split('\n').filter(Boolean).slice(1);
    const bullets = SkillGenerator.refineBullets(body.length ? body : slide.texts.slice(1));
    const spots = lightSpots(index);

    switch (st.type) {
      case 'cover': {
        const main = esc(slide.title || title);
        const sub = esc(bullets[0] || body[0] || slide.texts[1] || '');
        return `
    <div class="slide${index === 0 ? ' active' : ''}">
      ${spots}
      <div class="slide-content">
        <h1 class="text-5xl font-black mb-6 leading-tight">${main}</h1>
        ${sub ? `<p class="text-xl font-light text-gray-400">${sub}</p>` : ''}
      </div>
    </div>`;
      }
      case 'quote': {
        const quote = esc(bullets[0] || slide.content.split('\n')[0] || title);
        const source = esc(bullets[1] || body[1] || '');
        return `
    <div class="slide">
      ${spots}
      <div class="slide-content">
        <span class="text-6xl text-gray-600 block mb-2">"</span>
        <p class="text-2xl font-bold mb-6">${quote}</p>
        ${source ? `<span class="text-lg font-light text-gray-500">— ${source}</span>` : ''}
      </div>
    </div>`;
      }
      case 'data': {
        const numMatch = slide.content.match(/(\d+[%xX倍]?)/);
        const num = esc(numMatch ? numMatch[1] : title);
        const label = esc(bullets[0] || body[0] || slide.title || '关键指标');
        return `
    <div class="slide">
      ${spots}
      <div class="slide-content">
        <span class="text-7xl font-black text-white">${num}</span>
        <p class="text-xl font-light text-gray-400 mt-4">${label}</p>
      </div>
    </div>`;
      }
      case 'compare': {
        const parts = slide.content.split(/vs|VS|对比|→/);
        const left = esc(trimShort(parts[0] || '传统方式'));
        const right = esc(trimShort(parts[1] || bullets[0] || '全新体验'));
        return `
    <div class="slide">
      ${spots}
      <div class="slide-content">
        <div class="text-center mb-8">
          <span class="text-red-400 line-through text-xl">${left}</span>
        </div>
        <div class="text-center">
          <span class="text-green-400 text-3xl font-bold">${right}</span>
        </div>
      </div>
    </div>`;
      }
      case 'step': {
        const stepNum = String(index + 1).padStart(2, '0');
        const desc = esc(bullets[0] || body[0] || '');
        return `
    <div class="slide">
      ${spots}
      <div class="slide-content">
        <span class="text-6xl font-black text-blue-500 mb-4">${stepNum}</span>
        <h2 class="text-3xl font-bold text-white mb-4">${esc(title)}</h2>
        ${desc ? `<p class="text-lg font-light text-gray-400">${desc}</p>` : ''}
      </div>
    </div>`;
      }
      case 'list': {
        const items = bullets.slice(0, 5);
        if (!items.length && slide.texts.length) items.push(...slide.texts.slice(0, 5).map((t) => SkillGenerator.trimText(t, 10)));
        const lis = items.map((b) => `<li class="text-gray-300">• ${esc(b)}</li>`).join('\n            ');
        return `
    <div class="slide">
      ${spots}
      <div class="slide-content">
        <h2 class="text-2xl font-bold text-white mb-8">${esc(title)}</h2>
        <ul class="space-y-6 text-xl text-left">
            ${lis}
        </ul>
      </div>
    </div>`;
      }
      case 'ending': {
        const cta = esc(bullets[0] || body[0] || '感谢观看');
        return `
    <div class="slide">
      ${spots}
      <div class="slide-content">
        <h1 class="text-3xl font-bold text-white mb-8">${esc(title)}</h1>
        <p class="text-xl font-light text-gray-400">${cta}</p>
      </div>
    </div>`;
      }
      default: {
        const lines = splitTitleLines(title);
        const inner = lines.map((l) => esc(l)).join('<br>');
        const hint = bullets[0] ? `<p class="text-lg font-light text-gray-400 mt-6">${esc(bullets[0])}</p>` : '';
        return `
    <div class="slide">
      ${spots}
      <div class="slide-content">
        <h1 class="text-4xl font-black leading-tight">${inner}</h1>
        ${hint}
      </div>
    </div>`;
      }
    }
  }

  function trimShort(s, max = 16) {
    return SkillGenerator.trimText(String(s).trim(), max);
  }

  function generate(slides, fileName) {
    const title = slides[0]?.title || slides[0]?.content?.split('\n')[0] || '演示文稿';
    const total = slides.length;
    const slidesHtml = slides.map((s, i) => buildSlideHtml(s, i, total)).join('\n');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <script src="https://lf26-cdn-tos.bytecdntp.com/cdn/expire-1-M/tailwindcss/3.0.23/tailwind.min.js"><\/script>
  <link href="https://fonts.loli.net/css2?family=Inter:wght@300;400;700;900&display=swap" rel="stylesheet">
  <link href="https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@300;400;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans SC', 'Inter', sans-serif; background: #000; color: #fff; overflow: hidden; }
    .slides-container { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a0a; position: relative; }
    .slide {
      width: 100%; height: 100%; max-width: 450px; max-height: 800px; aspect-ratio: 9/16;
      position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 2rem; opacity: 0; transform: translateX(100%);
      transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden;
      background: linear-gradient(180deg, #0a0a0a 0%, #000000 100%);
    }
    .slide.active { opacity: 1; transform: translateX(0); }
    .slide.prev { opacity: 0; transform: translateX(-100%); }
    .light-spot { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.3; pointer-events: none; }
    .light-spot-1 { width: 300px; height: 300px; background: #3b82f6; top: -100px; right: -100px; animation: float1 20s ease-in-out infinite; }
    .light-spot-2 { width: 250px; height: 250px; background: #8b5cf6; bottom: -80px; left: -80px; animation: float2 25s ease-in-out infinite; }
    .light-spot-3 { width: 200px; height: 200px; background: #06b6d4; top: 50%; left: 50%; transform: translate(-50%, -50%); animation: float3 18s ease-in-out infinite; }
    @keyframes float1 { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-50px,30px)} 50%{transform:translate(30px,50px)} 75%{transform:translate(50px,-20px)} }
    @keyframes float2 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(40px,-40px)} 66%{transform:translate(-30px,30px)} }
    @keyframes float3 { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.2)} }
    .slide-content { position: relative; z-index: 10; text-align: center; width: 100%; }
    .progress-bar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 100; }
    .progress-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.3); cursor: pointer; transition: all 0.3s; }
    .progress-dot.active { background: #fff; transform: scale(1.3); }
    .progress-dot:hover { background: rgba(255,255,255,0.6); }
    .page-number { position: fixed; bottom: 50px; left: 50%; transform: translateX(-50%); font-size: 0.875rem; color: rgba(255,255,255,0.4); z-index: 100; }
  </style>
</head>
<body>
  <div class="slides-container">
${slidesHtml}
  </div>
  <div class="progress-bar" id="progressBar"></div>
  <div class="page-number" id="pageNumber">1 / ${total}</div>
  <script>
    const slides = document.querySelectorAll('.slide');
    const progressBar = document.getElementById('progressBar');
    const pageNumber = document.getElementById('pageNumber');
    let currentSlide = 0;
    slides.forEach((_, index) => {
      const dot = document.createElement('div');
      dot.className = 'progress-dot' + (index === 0 ? ' active' : '');
      dot.addEventListener('click', () => goToSlide(index));
      progressBar.appendChild(dot);
    });
    function updateSlides() {
      slides.forEach((slide, index) => {
        slide.classList.remove('active', 'prev');
        if (index === currentSlide) slide.classList.add('active');
        else if (index < currentSlide) slide.classList.add('prev');
      });
      document.querySelectorAll('.progress-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
      });
      pageNumber.textContent = (currentSlide + 1) + ' / ' + slides.length;
    }
    function nextSlide() { if (currentSlide < slides.length - 1) { currentSlide++; updateSlides(); } }
    function prevSlide() { if (currentSlide > 0) { currentSlide--; updateSlides(); } }
    function goToSlide(index) { currentSlide = index; updateSlides(); }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
      else if (e.key === 'ArrowLeft') prevSlide();
    });
    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
    document.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) { if (diff > 0) nextSlide(); else prevSlide(); }
    });
  <\/script>
</body>
</html>`;
  }

  return { generate };
})();
