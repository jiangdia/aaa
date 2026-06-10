import os
import re
from pathlib import Path
from typing import Optional

import httpx
from fastapi import HTTPException

SKILL_DIR = Path(__file__).resolve().parent.parent / "skill"

DEFAULT_BASE = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"

MODEL_PRESETS = [
    {
        "id": "openai",
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    },
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    {
        "id": "moonshot",
        "name": "Moonshot (Kimi)",
        "base_url": "https://api.moonshot.cn/v1",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    },
    {
        "id": "qwen",
        "name": "通义千问",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-max", "qwen-plus", "qwen-turbo"],
    },
    {
        "id": "zhipu",
        "name": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-4-plus", "glm-4-flash", "glm-4-air"],
    },
    {
        "id": "siliconflow",
        "name": "SiliconFlow",
        "base_url": "https://api.siliconflow.cn/v1",
        "models": ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    },
    {
        "id": "custom",
        "name": "自定义",
        "base_url": "",
        "models": [],
    },
]


def _read(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def load_skill_prompt() -> str:
    parts = [
        "你是 ppt-generator skill 的执行者。严格遵循以下 skill 规则与参考文档：\n",
        _read(SKILL_DIR / "SKILL.md"),
        _read(SKILL_DIR / "references" / "slide-types.md"),
        _read(SKILL_DIR / "references" / "design-spec.md"),
        "## assets/template.html（生成 HTML 时必须以此为基础模板结构）\n```html\n"
        + _read(SKILL_DIR / "assets" / "template.html")
        + "\n```",
    ]
    return "\n\n---\n\n".join(p for p in parts if p.strip())


def build_user_prompt(slides: list[dict], file_name: str) -> str:
    lines = [
        f"用户上传了演示文稿「{file_name}」，请将其转换为乔布斯风极简科技感竖屏 HTML 演示稿。",
        "",
        "## 原始讲稿（按页，请保留核心信息）",
        "",
    ]
    for slide in slides:
        lines.append(f"### 第 {slide['index']} 页")
        lines.append(slide.get("content") or "（空白页）")
        lines.append("")

    page_hint = max(min(len(slides), 20), min(len(slides), 8))
    lines.extend(
        [
            "## 输出要求（非常重要）",
            f"- 目标页数约 {page_hint} 页（可根据内容在 8~20 页间调整）",
            "- 在内部完成：提炼讲稿 → 乔布斯风标题 → 幻灯片结构设计",
            "- **最终回复只输出完整 HTML 源码**",
            "- 从 `<!DOCTYPE html>` 开始，到 `</html>` 结束",
            "- 不要输出 Markdown、不要输出讲稿/大纲、不要用 ``` 代码块包裹",
            "- 单个 HTML 文件，TailwindCSS 国内 CDN，含光斑动画与键盘翻页",
        ]
    )
    return "\n".join(lines)


def extract_html(raw: str) -> str:
    text = raw.strip()
    if not text:
        raise ValueError("AI 返回为空")

    fenced = re.search(r"```(?:html)?\s*(<!DOCTYPE[\s\S]*?)```", text, re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()

    doc = re.search(r"(<!DOCTYPE html[\s\S]*)", text, re.IGNORECASE)
    if doc:
        html = doc.group(1).strip()
        # trim trailing markdown if any
        end = html.lower().rfind("</html>")
        if end != -1:
            return html[: end + len("</html>")]
        return html

    if text.lower().startswith("<html"):
        end = text.lower().rfind("</html>")
        if end != -1:
            return text[: end + len("</html>")]
        return text

    raise ValueError("AI 未返回有效 HTML，请重试")


async def generate_presentation_html(
    slides: list[dict],
    file_name: str,
    *,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    key = (api_key or os.getenv("OPENAI_API_KEY", "")).strip()
    if not key:
        raise HTTPException(503, "请填写 API Key")

    base = (base_url or os.getenv("OPENAI_BASE_URL", DEFAULT_BASE)).strip().rstrip("/")
    if not base:
        raise HTTPException(400, "请填写 API 地址")

    model_name = (model or os.getenv("OPENAI_MODEL", DEFAULT_MODEL)).strip()
    if not model_name:
        raise HTTPException(400, "请选择或填写模型名称")

    system = load_skill_prompt()
    user = build_user_prompt(slides, file_name)

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.65,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
            resp = await client.post(
                f"{base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.TimeoutException as e:
        raise HTTPException(504, "AI 生成超时，请稍后重试或缩短 PPT 页数") from e
    except httpx.HTTPError as e:
        raise HTTPException(502, f"AI 服务连接失败: {e}") from e

    if resp.status_code != 200:
        detail = resp.text[:300]
        raise HTTPException(resp.status_code, f"AI 接口错误: {detail}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise HTTPException(502, "AI 响应格式异常") from e

    try:
        return extract_html(content)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


def ai_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def get_model_presets() -> list[dict]:
    return MODEL_PRESETS
