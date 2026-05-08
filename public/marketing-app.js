const state = {
  currentPost: null,
  currentPosts: [],
  library: JSON.parse(localStorage.getItem("marketingStudioLibrary") || "[]")
};

const elements = {
  form: document.querySelector("#composer"),
  brandForm: document.querySelector("#brandForm"),
  openAIForm: document.querySelector("#openAIForm"),
  settingsDialog: document.querySelector("#settingsDialog"),
  openAIStatus: document.querySelector("#openAIStatus"),
  openAITestResult: document.querySelector("#openAITestResult"),
  clearLibraryDialog: document.querySelector("#clearLibraryDialog"),
  status: document.querySelector("#workspaceStatus"),
  preview: document.querySelector("#previewContent"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  resetButton: document.querySelector("#resetButton"),
  openSettingsButton: document.querySelector("#openSettingsButton"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  loadExampleButton: document.querySelector("#loadExampleButton"),
  copyBriefButton: document.querySelector("#copyBriefButton"),
  saveBrandButton: document.querySelector("#saveBrandButton"),
  saveOpenAIButton: document.querySelector("#saveOpenAIButton"),
  testOpenAIButton: document.querySelector("#testOpenAIButton"),
  clearOpenAIKeyButton: document.querySelector("#clearOpenAIKeyButton"),
  clearLibraryButton: document.querySelector("#clearLibraryButton"),
  cancelClearLibraryButton: document.querySelector("#cancelClearLibraryButton"),
  confirmClearLibraryButton: document.querySelector("#confirmClearLibraryButton"),
  libraryList: document.querySelector("#libraryList"),
  draftCount: document.querySelector("#draftCount")
};

const exampleBrief = {
  product: "銀髮健身課程",
  topic: "母親節體驗課",
  audience: "想陪爸媽動起來的上班族",
  platform: "facebook",
  painPoint: "想幫家人運動，但不知道從哪開始",
  offer: "首次體驗 30 分鐘免費",
  cta: "私訊預約體驗",
  tone: "溫暖、可信任、有行動感",
  keywords: "健康老化、肌力、陪伴",
  visualStyle: "明亮生活感、真實人物、柔和品牌色",
  brandRules: "不要保證療效，不要過度恐嚇，避免低價促銷感"
};

function hydratePost(post) {
  return {
    ...post,
    platformKey: post.platformKey || platformKeyFor(post.platform),
    originalCaption: post.originalCaption ?? post.caption,
    originalImagePrompt: post.originalImagePrompt ?? post.imagePrompt,
    dirty: Boolean(post.dirty)
  };
}

function platformKeyFor(platform = "") {
  const value = String(platform).toLowerCase();
  if (value.includes("instagram")) return "instagram";
  if (value.includes("threads")) return "threads";
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("line")) return "line";
  return "facebook";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function openSettings() {
  if (elements.settingsDialog?.showModal) elements.settingsDialog.showModal();
}

function closeSettings() {
  if (elements.settingsDialog?.open) elements.settingsDialog.close();
}

function formPayload() {
  return {
    ...Object.fromEntries(new FormData(elements.form).entries()),
    brandProfile: brandPayload()
  };
}

function brandPayload() {
  return Object.fromEntries(new FormData(elements.brandForm).entries());
}

function openAIPayload() {
  return Object.fromEntries(new FormData(elements.openAIForm).entries());
}

function postBundleText(post) {
  return [
    `【${post.platform}】${post.title}`,
    "",
    post.caption,
    "",
    "圖片 Prompt:",
    post.imagePrompt,
    "",
    post.strategy ? "AI 策略判斷:" : "",
    post.strategy ? `- 角度：${post.strategy.angle}` : "",
    post.strategy ? `- 漏斗階段：${post.strategy.funnelStage}` : "",
    post.strategy ? `- 受眾洞察：${post.strategy.audienceInsight}` : "",
    post.variants?.length ? "" : "",
    post.variants?.length ? "A/B 測試版本:" : "",
    ...(post.variants || []).map((item) => `- ${item.name}: ${item.caption}`),
    post.imageDirections?.length ? "" : "",
    post.imageDirections?.length ? "圖片方向:" : "",
    ...(post.imageDirections || []).map((item) => `- ${item.name}: ${item.prompt}`),
    post.composedImageDataUrl ? "" : "",
    post.composedImageDataUrl ? "已產生社群主視覺模板圖。" : "",
    "",
    "替代開場:",
    ...(post.altHooks || []).map((item) => `- ${item}`),
    "",
    "審稿提醒:",
    ...(post.notes || []).map((item) => `- ${item}`)
  ].join("\n");
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 8) {
  const chars = String(text || "").split("");
  const lines = [];
  let line = "";
  for (const char of chars) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = char;
      if (lines.length >= maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

async function composeSocialTemplate(post) {
  if (!post.imageDataUrl) return "";
  const image = new Image();
  image.src = post.imageDataUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = post.imageSize === "1024x1024" ? 1080 : post.imageSize === "1536x1024" ? 1350 : 1080;
  canvas.height = post.imageSize === "1536x1024" ? 900 : 1350;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.fillStyle = "#fff7f2";
  ctx.fillRect(0, 0, width, height);

  const imageAreaX = Math.floor(width * 0.42);
  const imageAreaW = width - imageAreaX;
  const imageScale = Math.max(imageAreaW / image.width, height / image.height);
  const drawW = image.width * imageScale;
  const drawH = image.height * imageScale;
  ctx.drawImage(image, imageAreaX + (imageAreaW - drawW) / 2, (height - drawH) / 2, drawW, drawH);

  const gradient = ctx.createLinearGradient(0, 0, width * 0.72, 0);
  gradient.addColorStop(0, "rgba(255, 250, 246, 0.98)");
  gradient.addColorStop(0.72, "rgba(255, 250, 246, 0.88)");
  gradient.addColorStop(1, "rgba(255, 250, 246, 0.05)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#eda77d";
  roundRect(ctx, 70, 82, 330, 46, 23);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 25px Microsoft JhengHei, sans-serif";
  ctx.fillText("陪你和家人一起", 96, 114);

  ctx.fillStyle = "#784829";
  ctx.font = "700 68px Microsoft JhengHei, sans-serif";
  const title = post.title.split("｜")[0] || post.title;
  let y = wrapCanvasText(ctx, title, 70, 230, width * 0.48, 82, 3);

  ctx.fillStyle = "#3d3d3d";
  ctx.font = "500 28px Microsoft JhengHei, sans-serif";
  const subtitle = post.strategy?.promise || post.caption.split("\n").find(Boolean) || "";
  y = wrapCanvasText(ctx, subtitle, 72, y + 36, width * 0.46, 42, 3);

  const benefits = [
    post.strategy?.objections?.[0] ? "專業陪伴，安心開始" : "專業陪伴",
    post.strategy?.promise || "低負擔訓練",
    post.cta || "立即了解"
  ].slice(0, 3);

  ctx.font = "700 27px Microsoft JhengHei, sans-serif";
  benefits.forEach((benefit, index) => {
    const cy = height * 0.52 + index * 118;
    ctx.fillStyle = "#eea270";
    ctx.beginPath();
    ctx.arc(96, cy - 10, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 28px Microsoft JhengHei, sans-serif";
    ctx.fillText(String(index + 1), 88, cy);
    ctx.fillStyle = "#5a3a29";
    ctx.font = "700 27px Microsoft JhengHei, sans-serif";
    wrapCanvasText(ctx, benefit, 150, cy - 18, width * 0.35, 36, 2);
  });

  ctx.fillStyle = "#f3b890";
  ctx.beginPath();
  ctx.moveTo(0, height - 110);
  ctx.bezierCurveTo(width * 0.25, height - 190, width * 0.5, height - 30, width, height - 120);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL("image/png");
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function setStatus(text) {
  elements.status.textContent = text;
}

function renderPreview() {
  const posts = state.currentPosts.length ? state.currentPosts : (state.currentPost ? [state.currentPost] : []);
  elements.saveDraftButton.disabled = !posts.length;
  if (!posts.length) {
    elements.preview.className = "preview-empty";
    elements.preview.innerHTML = `
      <strong>尚未產生素材</strong>
      <span>填完行銷需求後，這裡會往下疊出各社群平台的文案、圖片 prompt、A/B 版本與審稿提醒。</span>
    `;
    return;
  }

  elements.preview.className = "preview-content";
  elements.preview.innerHTML = posts.map((post, index) => `
    <section class="platform-output ${post.accepted ? "is-accepted" : ""}">
      <article class="content-card main-copy">
      <header>
        <div>
          <span>${escapeHtml(post.platform)} · ${post.generationMode === "openai" ? "OpenAI 生成" : "本機策略引擎"}</span>
          <h3>${escapeHtml(post.title)}</h3>
        </div>
        <div class="card-actions">
          <button type="button" data-post-action="accept" data-post-index="${index}">${post.accepted ? "已採用" : "採用"}</button>
          ${post.dirty ? `<button type="button" data-post-action="reanalyze" data-post-index="${index}">重新分析</button>` : ""}
          <button type="button" data-copy="bundle" data-post-index="${index}">複製整包</button>
          <button type="button" data-post-action="delete" data-post-index="${index}">刪除</button>
        </div>
      </header>
      ${post.warning ? `<p class="warning-note">${escapeHtml(post.warning)}</p>` : ""}
      <label class="editable-field">
        主文案
        <textarea data-edit-field="caption" data-post-index="${index}" rows="9">${escapeHtml(post.caption)}</textarea>
      </label>
      <div class="button-row">
        <button type="button" data-copy="caption" data-post-index="${index}">複製文案</button>
        <button type="button" data-copy="prompt" data-post-index="${index}">複製圖片 Prompt</button>
      </div>
    </article>
    <article class="content-card visual-brief">
      <h3>圖片 Prompt</h3>
      <label class="editable-field">
        圖片提示詞
        <textarea data-edit-field="imagePrompt" data-post-index="${index}" rows="5">${escapeHtml(post.imagePrompt)}</textarea>
      </label>
      <div class="image-tools">
        <label>
          圖片類型
          <select data-image-visual-type data-post-index="${index}">
            <option value="keyVisual" ${post.visualType !== "photo" ? "selected" : ""}>社群主視覺</option>
            <option value="photo" ${post.visualType === "photo" ? "selected" : ""}>情境照片</option>
          </select>
        </label>
        <label>
          圖片尺寸
          <select data-image-size data-post-index="${index}">
            <option value="1024x1024" ${post.imageSize === "1024x1024" ? "selected" : ""}>1:1 方圖</option>
            <option value="1024x1536" ${post.imageSize === "1024x1536" ? "selected" : ""}>4:5 直圖</option>
            <option value="1536x1024" ${post.imageSize === "1536x1024" ? "selected" : ""}>3:2 橫圖</option>
          </select>
        </label>
        <label>
          品質
          <select data-image-quality data-post-index="${index}">
            <option value="medium" ${post.imageQuality !== "high" && post.imageQuality !== "low" ? "selected" : ""}>Medium</option>
            <option value="high" ${post.imageQuality === "high" ? "selected" : ""}>High</option>
            <option value="low" ${post.imageQuality === "low" ? "selected" : ""}>Low</option>
          </select>
        </label>
        <button type="button" data-post-action="generate-image" data-post-index="${index}">
          ${post.imageLoading ? "生成中..." : "生成圖片"}
        </button>
        ${post.imageDataUrl ? `<button type="button" data-post-action="compose-template" data-post-index="${index}">套用模板</button>` : ""}
      </div>
      ${post.imageError ? `<p class="warning-note">${escapeHtml(post.imageError)}</p>` : ""}
      ${post.imageDataUrl ? `
        <figure class="generated-image">
          <img src="${post.imageDataUrl}" alt="${escapeHtml(`${post.platform} 生成圖片`)}">
          ${post.revisedPrompt ? `<figcaption>${escapeHtml(post.revisedPrompt)}</figcaption>` : ""}
        </figure>
      ` : ""}
      ${post.composedImageDataUrl ? `
        <figure class="generated-image composed">
          <img src="${post.composedImageDataUrl}" alt="${escapeHtml(`${post.platform} 社群主視覺`)}">
          <figcaption>已套用穩定中文圖文模板</figcaption>
        </figure>
      ` : ""}
    </article>
    ${post.strategy ? `
      <article class="content-card strategy-card">
        <h3>AI 策略判斷</h3>
        <div class="strategy-grid">
          <span><b>${escapeHtml(post.strategy.angle)}</b>行銷角度</span>
          <span><b>${escapeHtml(post.strategy.funnelStage)}</b>漏斗階段</span>
          <span><b>${escapeHtml(String(post.strategy.confidence))}%</b>判斷信心</span>
        </div>
        <p>${escapeHtml(post.strategy.audienceInsight)}</p>
        <p>${escapeHtml(post.strategy.keyMessage)}</p>
      </article>
    ` : ""}
    ${post.variants?.length ? `
      <article class="content-card variants-card">
        <h3>A/B 測試版本</h3>
        <div class="variant-list">
          ${post.variants.map((variant) => `
            <section>
              <strong>${escapeHtml(variant.name)}</strong>
              <p>${escapeHtml(variant.caption)}</p>
            </section>
          `).join("")}
        </div>
      </article>
    ` : ""}
    ${post.imageDirections?.length ? `
      <article class="content-card image-direction-card">
        <h3>圖片方向</h3>
        <div class="direction-list">
          ${post.imageDirections.map((direction) => `
            <section>
              <strong>${escapeHtml(direction.name)}</strong>
              <p>${escapeHtml(direction.prompt)}</p>
            </section>
          `).join("")}
        </div>
      </article>
    ` : ""}
    <div class="content-columns">
      <article class="content-card">
        <h3>替代開場</h3>
        <ul>${post.altHooks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      <article class="content-card">
        <h3>審稿提醒</h3>
        <ul>${post.notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
      </div>
    </section>
  `).join("");
}

function persistLibrary() {
  localStorage.setItem("marketingStudioLibrary", JSON.stringify(state.library));
}

function renderLibrary() {
  elements.draftCount.textContent = state.library.length;
  if (!state.library.length) {
    elements.libraryList.innerHTML = '<div class="library-empty">素材包目前是空的。產生草稿後按「加入素材包」即可保留。</div>';
    return;
  }
  elements.libraryList.innerHTML = state.library.map((item) => `
    <article class="library-item">
      <div>
        <span>${escapeHtml(item.platform)} · ${escapeHtml(new Date(item.savedAt).toLocaleString("zh-TW"))}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.caption.split("\n").find(Boolean) || "")}</p>
      </div>
      <div class="library-actions">
        <button type="button" data-library-copy="${escapeHtml(item.id)}">複製</button>
        <button type="button" data-library-load="${escapeHtml(item.id)}">載入</button>
        <button type="button" data-library-delete="${escapeHtml(item.id)}">刪除</button>
      </div>
    </article>
  `).join("");
}

async function generatePost(event) {
  event.preventDefault();
  setStatus("產生中...");
  const response = await fetch("/api/social-posts/generate-package", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(formPayload())
  });
  if (!response.ok) {
    setStatus("產生失敗");
    return;
  }
  const payload = await response.json();
  const newPosts = (payload.package?.posts || []).map(hydratePost);
  state.currentPosts = [...state.currentPosts, ...newPosts];
  state.currentPost = state.currentPosts[0] || null;
  const openaiCount = newPosts.filter((post) => post.generationMode === "openai").length;
  setStatus(`新增 ${newPosts.length} 個平台草稿 · 目前共 ${state.currentPosts.length} 個${openaiCount ? " · 含 OpenAI 生成" : ""}`);
  renderPreview();
}

async function loadBrandProfile() {
  const response = await fetch("/api/brand-profile");
  if (!response.ok) return;
  const payload = await response.json();
  for (const [key, value] of Object.entries(payload.profile || {})) {
    const field = elements.brandForm.elements.namedItem(key);
    if (field) field.value = value;
  }
}

function renderOpenAIStatus(config) {
  if (!config) return;
  elements.openAIStatus.textContent = config.hasKey
    ? `已設定 API Key（來源：${config.keySource}），使用模型：${config.model}`
    : `尚未設定 API Key，目前會使用本機策略引擎。`;
  const modelField = elements.openAIForm.elements.namedItem("model");
  if (modelField) modelField.value = config.model || "gpt-5.2";
}

async function loadOpenAIConfig() {
  const response = await fetch("/api/openai-config");
  if (!response.ok) return;
  const payload = await response.json();
  renderOpenAIStatus(payload.config);
}

async function saveOpenAIConfig() {
  setStatus("儲存 OpenAI 設定中...");
  const response = await fetch("/api/openai-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(openAIPayload())
  });
  if (!response.ok) {
    setStatus("OpenAI 設定儲存失敗");
    return;
  }
  const payload = await response.json();
  elements.openAIForm.elements.namedItem("apiKey").value = "";
  renderOpenAIStatus(payload.config);
  setStatus("OpenAI 設定已儲存");
}

async function clearOpenAIKey() {
  const response = await fetch("/api/openai-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...openAIPayload(), clearKey: true })
  });
  if (!response.ok) return;
  const payload = await response.json();
  elements.openAIForm.elements.namedItem("apiKey").value = "";
  renderOpenAIStatus(payload.config);
  setStatus("已清除介面設定的 API Key");
}

async function testOpenAIConnection() {
  elements.openAITestResult.className = "openai-test-result is-loading";
  elements.openAITestResult.textContent = "測試連線中...";
  setStatus("測試 OpenAI 連線中...");
  const response = await fetch("/api/openai-config/test", { method: "POST" });
  if (!response.ok) {
    elements.openAITestResult.className = "openai-test-result is-error";
    elements.openAITestResult.textContent = `測試失敗：HTTP ${response.status}`;
    setStatus("OpenAI 連線測試失敗");
    return;
  }
  const payload = await response.json();
  const result = payload.result;
  renderOpenAIStatus(result.config);
  elements.openAITestResult.className = `openai-test-result ${result.ok ? "is-success" : "is-error"}`;
  elements.openAITestResult.textContent = result.ok
    ? `連線成功：${result.message}`
    : `連線失敗（${result.type}${result.status ? ` / ${result.status}` : ""}）：${result.message}`;
  setStatus(result.ok ? "OpenAI 連線成功" : "OpenAI 連線失敗");
}

async function saveBrandProfile() {
  setStatus("儲存品牌中...");
  const response = await fetch("/api/brand-profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(brandPayload())
  });
  setStatus(response.ok ? "品牌設定已儲存" : "品牌儲存失敗");
  if (response.ok) closeSettings();
}

function saveDraft() {
  const posts = state.currentPosts.length ? state.currentPosts : (state.currentPost ? [state.currentPost] : []);
  if (!posts.length) return;
  const selectedPosts = posts.some((post) => post.accepted) ? posts.filter((post) => post.accepted) : posts;
  const savedAt = new Date().toISOString();
  state.library.unshift(...selectedPosts.map((post) => ({
    ...post,
    id: crypto.randomUUID(),
    savedAt
  })));
  state.library = state.library.slice(0, 20);
  persistLibrary();
  renderLibrary();
  setStatus(`已加入 ${selectedPosts.length} 個素材到素材包`);
}

function resetWorkspace() {
  elements.form.reset();
  state.currentPost = null;
  state.currentPosts = [];
  setStatus("草稿模式");
  renderPreview();
}

function loadExample() {
  for (const [key, value] of Object.entries(exampleBrief)) {
    const field = elements.form.elements.namedItem(key);
    if (field) field.value = value;
  }
  setStatus("已套用範例");
}

async function handlePreviewClick(event) {
  const actionButton = event.target.closest("[data-post-action]");
  if (actionButton) {
    const index = Number(actionButton.dataset.postIndex || 0);
    const action = actionButton.dataset.postAction;
    const post = state.currentPosts[index];
    if (!post) return;
    if (action === "accept") {
      post.accepted = !post.accepted;
      renderPreview();
      setStatus(post.accepted ? `${post.platform} 已標記採用` : `${post.platform} 已取消採用`);
    }
    if (action === "reanalyze") {
      setStatus(`${post.platform} 重新分析中...`);
      const response = await fetch("/api/social-posts/reanalyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...formPayload(),
          ...post,
          platformKey: post.platformKey || platformKeyFor(post.platform)
        })
      });
      if (!response.ok) {
        setStatus(`${post.platform} 重新分析失敗`);
        return;
      }
      const payload = await response.json();
      Object.assign(post, payload.analysis, {
        originalCaption: post.caption,
        originalImagePrompt: post.imagePrompt,
        dirty: false
      });
      renderPreview();
      setStatus(`${post.platform} 已重新分析`);
    }
    if (action === "generate-image") {
      post.imageLoading = true;
      post.imageError = "";
      renderPreview();
      setStatus(`${post.platform} 圖片生成中...`);
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: post.imagePrompt,
          size: post.imageSize || "1024x1024",
          visualType: post.visualType || "keyVisual",
          model: "gpt-image-1",
          quality: post.imageQuality || "medium"
        })
      });
      const payload = response.ok ? await response.json() : { result: { ok: false, message: `HTTP ${response.status}` } };
      post.imageLoading = false;
      if (payload.result?.ok) {
        post.imageDataUrl = payload.result.imageDataUrl;
        post.revisedPrompt = payload.result.revisedPrompt || "";
        post.imageError = "";
        if ((post.visualType || "keyVisual") === "keyVisual") {
          post.composedImageDataUrl = await composeSocialTemplate(post);
        }
        setStatus(`${post.platform} 圖片已生成`);
      } else {
        post.imageError = `圖片生成失敗：${payload.result?.type || "error"} ${payload.result?.message || ""}`;
        setStatus(`${post.platform} 圖片生成失敗`);
      }
      renderPreview();
    }
    if (action === "compose-template") {
      if (!post.imageDataUrl) return;
      setStatus(`${post.platform} 套用模板中...`);
      post.composedImageDataUrl = await composeSocialTemplate(post);
      renderPreview();
      setStatus(`${post.platform} 模板已套用`);
    }
    if (action === "delete") {
      state.currentPosts.splice(index, 1);
      state.currentPost = state.currentPosts[0] || null;
      renderPreview();
      setStatus(`${post.platform} 已刪除`);
    }
    return;
  }

  const button = event.target.closest("[data-copy]");
  const posts = state.currentPosts.length ? state.currentPosts : (state.currentPost ? [state.currentPost] : []);
  const post = posts[Number(button?.dataset.postIndex || 0)];
  if (!button || !post) return;
  const type = button.dataset.copy;
  const text = type === "caption"
    ? post.caption
    : type === "prompt"
      ? post.imagePrompt
      : postBundleText(post);
  await copyText(text);
  setStatus("已複製");
}

function handlePreviewEdit(event) {
  const sizeField = event.target.closest("[data-image-size]");
  if (sizeField) {
    const post = state.currentPosts[Number(sizeField.dataset.postIndex || 0)];
    if (post) post.imageSize = sizeField.value;
    return;
  }

  const visualTypeField = event.target.closest("[data-image-visual-type]");
  if (visualTypeField) {
    const post = state.currentPosts[Number(visualTypeField.dataset.postIndex || 0)];
    if (post) post.visualType = visualTypeField.value;
    return;
  }

  const qualityField = event.target.closest("[data-image-quality]");
  if (qualityField) {
    const post = state.currentPosts[Number(qualityField.dataset.postIndex || 0)];
    if (post) post.imageQuality = qualityField.value;
    return;
  }

  const field = event.target.closest("[data-edit-field]");
  if (!field) return;
  const post = state.currentPosts[Number(field.dataset.postIndex || 0)];
  if (!post) return;
  const wasDirty = post.dirty;
  post[field.dataset.editField] = field.value;
  post.dirty = post.caption !== post.originalCaption || post.imagePrompt !== post.originalImagePrompt;
  state.currentPost = state.currentPosts[0] || null;
  if (wasDirty !== post.dirty) {
    const cursor = field.selectionStart;
    renderPreview();
    const nextField = elements.preview.querySelector(`[data-edit-field="${CSS.escape(field.dataset.editField)}"][data-post-index="${CSS.escape(field.dataset.postIndex)}"]`);
    if (nextField) {
      nextField.focus();
      nextField.selectionStart = nextField.selectionEnd = Math.min(cursor, nextField.value.length);
    }
  }
}

async function handleLibraryClick(event) {
  const copyId = event.target.closest("[data-library-copy]")?.dataset.libraryCopy;
  const loadId = event.target.closest("[data-library-load]")?.dataset.libraryLoad;
  const deleteId = event.target.closest("[data-library-delete]")?.dataset.libraryDelete;
  const id = copyId || loadId || deleteId;
  if (!id) return;
  const item = state.library.find((draft) => draft.id === id);

  if (copyId && item) {
    await copyText(postBundleText(item));
    setStatus("已複製素材包");
  }
  if (loadId && item) {
    state.currentPost = item;
    state.currentPosts = [item];
    renderPreview();
    setStatus("已載入素材");
    document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (deleteId) {
    state.library = state.library.filter((draft) => draft.id !== id);
    persistLibrary();
    renderLibrary();
    setStatus("已刪除素材");
  }
}

async function copyBrief() {
  const payload = formPayload();
  const text = Object.entries(payload)
    .filter(([, value]) => typeof value !== "object" && String(value || "").trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  await copyText(text || "尚未填寫需求");
  setStatus("已複製需求");
}

function clearLibrary() {
  state.library = [];
  persistLibrary();
  renderLibrary();
  setStatus("素材包已清空");
}

function openClearLibraryDialog() {
  if (elements.clearLibraryDialog?.showModal) elements.clearLibraryDialog.showModal();
}

function closeClearLibraryDialog() {
  if (elements.clearLibraryDialog?.open) elements.clearLibraryDialog.close();
}

function confirmClearLibrary() {
  closeClearLibraryDialog();
  clearLibrary();
}

elements.form.addEventListener("submit", generatePost);
elements.saveDraftButton.addEventListener("click", saveDraft);
elements.resetButton.addEventListener("click", resetWorkspace);
elements.openSettingsButton.addEventListener("click", openSettings);
elements.closeSettingsButton.addEventListener("click", closeSettings);
elements.settingsDialog.addEventListener("click", (event) => {
  if (event.target === elements.settingsDialog) closeSettings();
});
elements.loadExampleButton.addEventListener("click", loadExample);
elements.copyBriefButton.addEventListener("click", copyBrief);
elements.saveBrandButton.addEventListener("click", saveBrandProfile);
elements.saveOpenAIButton.addEventListener("click", saveOpenAIConfig);
elements.testOpenAIButton.addEventListener("click", testOpenAIConnection);
elements.clearOpenAIKeyButton.addEventListener("click", clearOpenAIKey);
elements.preview.addEventListener("click", handlePreviewClick);
elements.preview.addEventListener("input", handlePreviewEdit);
elements.preview.addEventListener("change", handlePreviewEdit);
elements.libraryList.addEventListener("click", handleLibraryClick);
elements.clearLibraryButton.addEventListener("click", openClearLibraryDialog);
elements.cancelClearLibraryButton.addEventListener("click", closeClearLibraryDialog);
elements.confirmClearLibraryButton.addEventListener("click", confirmClearLibrary);
elements.clearLibraryDialog.addEventListener("click", (event) => {
  if (event.target === elements.clearLibraryDialog) closeClearLibraryDialog();
});

renderPreview();
renderLibrary();
loadBrandProfile();
loadOpenAIConfig();
