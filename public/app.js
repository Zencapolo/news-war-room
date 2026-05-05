const state = {
  payload: null,
  query: "",
  category: "all",
  tag: "all",
  filter: "all",
  sort: "latest",
  trendTag: "",
  trendRange: "24h",
  taskStatus: "all",
  taskPriority: "all",
  taskType: "all",
  searchOpen: false
};

const elements = {
  clockDate: document.querySelector("#clockDate"),
  clockTime: document.querySelector("#clockTime"),
  refreshButton: document.querySelector("#refreshButton"),
  totalNews: document.querySelector("#totalNews"),
  filteredNews: document.querySelector("#filteredNews"),
  activeFeeds: document.querySelector("#activeFeeds"),
  alertCount: document.querySelector("#alertCount"),
  updatedAt: document.querySelector("#updatedAt"),
  topicForm: document.querySelector("#topicForm"),
  topicName: document.querySelector("#topicName"),
  topicQuery: document.querySelector("#topicQuery"),
  topicPriority: document.querySelector("#topicPriority"),
  topicList: document.querySelector("#topicList"),
  topicSummary: document.querySelector("#topicSummary"),
  topicDialog: document.querySelector("#topicDialog"),
  openTopicsButton: document.querySelector("#openTopicsButton"),
  closeTopicsButton: document.querySelector("#closeTopicsButton"),
  resetTopicsButton: document.querySelector("#resetTopicsButton"),
  briefStrip: document.querySelector("#briefStrip"),
  trendGrid: document.querySelector("#trendGrid"),
  dailyDate: document.querySelector("#dailyDate"),
  dailyReport: document.querySelector("#dailyReport"),
  watchCount: document.querySelector("#watchCount"),
  watchList: document.querySelector("#watchList"),
  marketingTaskCount: document.querySelector("#marketingTaskCount"),
  marketingTaskList: document.querySelector("#marketingTaskList"),
  taskStatusFilter: document.querySelector("#taskStatusFilter"),
  taskPriorityFilter: document.querySelector("#taskPriorityFilter"),
  taskTypeFilter: document.querySelector("#taskTypeFilter"),
  newsSearch: document.querySelector("#newsSearch"),
  categoryFilter: document.querySelector("#categoryFilter"),
  tagFilter: document.querySelector("#tagFilter"),
  quickFilter: document.querySelector("#quickFilter"),
  sortOrder: document.querySelector("#sortOrder"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  searchPanel: document.querySelector("#search"),
  toggleSearchButton: document.querySelector("#toggleSearchButton"),
  trendKeyword: document.querySelector("#trendKeyword"),
  trendRange: document.querySelector("#trendRange"),
  newsList: document.querySelector("#newsList"),
  timeline: document.querySelector("#timeline"),
  alertList: document.querySelector("#alertList")
};

const number = new Intl.NumberFormat("zh-TW");
const AUTO_REFRESH_MS = 60 * 1000;
let isLoading = false;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function renderClock() {
  const now = new Date();
  elements.clockDate.textContent = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(now);
  elements.clockTime.textContent = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now);
}

function sentimentClass(sentiment) {
  if (sentiment.value > 15) return "positive";
  if (sentiment.value < -15) return "negative";
  return "neutral";
}

function semanticLabel(score) {
  return score === null || score === undefined ? "未搜尋" : `${Math.round(score * 100)}`;
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

function renderSummary() {
  const { summary, updatedAt } = state.payload;
  elements.totalNews.textContent = number.format(summary.totalNews);
  elements.filteredNews.textContent = number.format(summary.filteredNews);
  elements.activeFeeds.textContent = number.format(summary.activeFeeds);
  elements.alertCount.textContent = number.format(summary.alerts);
  elements.updatedAt.textContent = `更新 ${formatDate(updatedAt)} · 每 1 分鐘自動更新`;
}

function renderControls() {
  const categories = state.payload.categories;
  const tags = state.payload.hotTags.map((tag) => tag.name);

  elements.categoryFilter.innerHTML = [
    '<option value="all">全部類別</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");
  elements.categoryFilter.value = categories.includes(state.category) ? state.category : "all";

  elements.tagFilter.innerHTML = [
    '<option value="all">全部標籤</option>',
    ...tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
  ].join("");
  elements.tagFilter.value = tags.includes(state.tag) ? state.tag : "all";

  elements.quickFilter.value = state.filter;
  elements.sortOrder.value = state.sort;
}

function renderBrief() {
  const lead = state.payload.items?.[0];
  elements.briefStrip.innerHTML = state.payload.brief.map((item, index) => {
    if (index === 0 && lead) {
      return `
        <button class="brief-item brief-action" type="button" data-brief-action="focus-news" data-article-id="${escapeHtml(lead.id)}">
          ${escapeHtml(item)}
        </button>
      `;
    }
    return `<div class="brief-item">${escapeHtml(item)}</div>`;
  }).join("");
}

function priorityLabel(priority) {
  if (priority === "realtime") return "即時";
  if (priority === "daily") return "每天";
  return "每小時";
}

function renderTopics() {
  const topics = state.payload.topics || [];
  const enabledCount = topics.filter((topic) => topic.enabled).length;
  if (elements.topicSummary) {
    elements.topicSummary.textContent = `${enabledCount}/${topics.length} 啟用`;
  }
  if (!topics.length) {
    elements.topicList.innerHTML = '<div class="empty">目前沒有監測主題。</div>';
    return;
  }
  elements.topicList.innerHTML = topics.map((topic) => `
    <article class="topic-item">
      <div>
        <strong>${escapeHtml(topic.name)}</strong>
        <span>${escapeHtml(topic.query || topic.name)}</span>
      </div>
      <div class="topic-actions">
        <small>${priorityLabel(topic.priority)}</small>
        <button type="button" data-topic-action="toggle" data-topic-id="${escapeHtml(topic.id)}">
          ${topic.enabled ? "停用" : "啟用"}
        </button>
        <button type="button" data-topic-action="delete" data-topic-id="${escapeHtml(topic.id)}">刪除</button>
      </div>
    </article>
  `).join("");
}

function trendMessage(trend) {
  if (trend.heat >= 85) return "高熱度：建議列入今日優先監測主題。";
  if (trend.heat >= 65) return "升溫中：新聞量明顯增加，適合持續追蹤。";
  if (trend.heat >= 40) return "觀察中：已有穩定訊號，可等待更多新聞確認。";
  return "低量訊號：目前聲量較少，暫列背景監測。";
}

function renderTrends() {
  const trends = state.payload.hotTags;
  if (!trends.length) {
    elements.trendGrid.innerHTML = '<div class="empty">尚未累積足夠的趨勢訊號。</div>';
    return;
  }

  elements.trendGrid.innerHTML = trends.slice(0, 8).map((trend) => `
    <article class="trend-card" data-tag="${escapeHtml(trend.name)}" tabindex="0" role="button" title="點擊查看此標籤新聞">
      <header>
        <div>
          <span>${escapeHtml(trend.count)} 次出現</span>
          <strong>${escapeHtml(trend.name)}</strong>
        </div>
        <b>${trend.heat}</b>
      </header>
      <div class="heat-bar"><i style="--value:${trend.heat / 100}"></i></div>
      <p>${trendMessage(trend)}</p>
    </article>
  `).join("");
}

function renderImpactFactors(item) {
  const factors = item.impactFactors || [];
  if (!factors.length) return "<li>尚未取得影響力拆解。</li>";
  return factors.map((factor) => `<li>${escapeHtml(factor)}</li>`).join("");
}

function renderDailyReport() {
  const report = state.payload.dailyReport;
  if (!report) {
    elements.dailyReport.innerHTML = '<div class="empty">尚未產生每日摘要。</div>';
    return;
  }

  elements.dailyDate.textContent = report.date;
  const categoryCards = report.categories.map((item) => `
    <article class="daily-card">
      <span>${escapeHtml(item.category)}</span>
      <strong>${number.format(item.count)} 則</strong>
      <p>高影響 ${number.format(item.highImpact)} · 負面 ${number.format(item.negative)}</p>
      ${item.lead ? `<small>${escapeHtml(item.lead.title)}</small>` : "<small>今日暫無明顯重點</small>"}
    </article>
  `).join("");

  const risks = report.risks.length
    ? report.risks.map((item) => `<li><strong>${escapeHtml(item.category)}</strong> ${escapeHtml(item.title)} <span>影響力 ${item.impact}</span></li>`).join("")
    : "<li>目前沒有明顯高風險新聞。</li>";

  const trends = report.trends.length
    ? report.trends.map((item) => `
      <button class="daily-trend-item" type="button" data-daily-trend="${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        <strong>熱度 ${item.heat}</strong>
        <small>${number.format(item.count || 0)} 次出現 · ${escapeHtml(trendMessage(item))}</small>
      </button>
    `).join("")
    : '<div class="empty compact">尚無趨勢。</div>';

  const tracked = report.tracked.length
    ? report.tracked.map((item) => `<li>${escapeHtml(item.status)} · ${escapeHtml(item.article.title)}</li>`).join("")
    : "<li>尚無追蹤新聞。</li>";

  elements.dailyReport.innerHTML = `
    <div class="daily-overview">
      <article><span>今日新聞</span><strong>${number.format(report.overview.news)}</strong></article>
      <article><span>高影響</span><strong>${number.format(report.overview.highImpact)}</strong></article>
      <article><span>負面訊號</span><strong>${number.format(report.overview.negative)}</strong></article>
      <article><span>追蹤中</span><strong>${number.format(report.overview.watchlist)}</strong></article>
    </div>
    <article class="daily-headline">
      <span>今日主軸</span>
      <strong>${escapeHtml(report.headline)}</strong>
    </article>
    <div class="daily-category-grid">${categoryCards}</div>
    <div class="daily-columns">
      <section>
        <h3>趨勢上升</h3>
        <div class="daily-trend-list">${trends}</div>
      </section>
      <section>
        <h3>風險提醒</h3>
        <ul>${risks}</ul>
      </section>
      <section>
        <h3>追蹤狀態</h3>
        <ul>${tracked}</ul>
      </section>
      <section>
        <h3>建議行動</h3>
        <ul>${report.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    </div>
  `;
}

function trackingLabel(item) {
  return item.tracking ? "已追蹤" : "加入追蹤";
}

function renderMarketingDailyReport() {
  const report = state.payload.dailyReport;
  if (!report) {
    elements.dailyReport.innerHTML = '<div class="empty">尚未產生每日摘要。</div>';
    return;
  }

  elements.dailyDate.textContent = report.date;
  const categoryCards = report.categories.map((item) => `
    <article class="daily-card">
      <span>${escapeHtml(item.category)}</span>
      <strong>${number.format(item.count)} 則</strong>
      <p>高影響 ${number.format(item.highImpact)} · 負面 ${number.format(item.negative)}</p>
      ${item.lead ? `<small>${escapeHtml(item.lead.title)}</small>` : "<small>今日暫無明顯重點</small>"}
    </article>
  `).join("");
  const risks = report.risks.length
    ? report.risks.map((item) => `<li><strong>${escapeHtml(item.category)}</strong> ${escapeHtml(item.title)} <span>影響力 ${item.impact}</span></li>`).join("")
    : "<li>目前沒有明顯高風險新聞。</li>";
  const trends = report.trends.length
    ? report.trends.map((item) => `
      <button class="daily-trend-item" type="button" data-daily-trend="${escapeHtml(item.name)}">
        <span>${escapeHtml(item.name)}</span>
        <strong>熱度 ${item.heat}</strong>
        <small>${number.format(item.count || 0)} 次出現 · ${escapeHtml(trendMessage(item))}</small>
      </button>
    `).join("")
    : '<div class="empty compact">尚無趨勢。</div>';
  const tracked = report.tracked.length
    ? report.tracked.map((item) => `<li>${escapeHtml(item.status)} · ${escapeHtml(item.article.title)}</li>`).join("")
    : "<li>尚無追蹤新聞。</li>";
  const marketingActions = (report.marketingActions || []).length
    ? report.marketingActions.map((item) => `
      <li class="marketing-action-item">
        <div>
          <strong>${escapeHtml(item.label)} ${item.score}</strong>
          ${escapeHtml(item.idea)}
          <span>${escapeHtml(item.intent)} · 風險${escapeHtml(item.risk)} · ${item.channels.map(escapeHtml).join(" / ")}</span>
          <small class="marketing-source">
            來源新聞：${escapeHtml(item.title)}
            <em>${escapeHtml(item.source || item.category || "未知來源")}${item.publishedAt ? ` · ${formatDate(item.publishedAt)}` : ""}</em>
          </small>
        </div>
        <div class="marketing-action-buttons">
          <button type="button" data-marketing-action="focus-news" data-source-id="${escapeHtml(item.id)}">查看新聞</button>
          <button type="button" ${item.hasTask ? "disabled" : ""} data-marketing-action="create-task" data-source-id="${escapeHtml(item.id)}" data-idea="${escapeHtml(item.idea)}" data-type="${escapeHtml(item.channels[0] || "內容觀察")}" data-priority="${item.score >= 72 ? "高" : item.score >= 48 ? "中" : "低"}">
            ${item.hasTask ? "已建立" : "建立任務"}
          </button>
        </div>
      </li>
    `).join("")
    : "<li>目前沒有明顯可借勢的行銷題材。</li>";

  elements.dailyReport.innerHTML = `
    <div class="daily-overview">
      <article><span>今日新聞</span><strong>${number.format(report.overview.news)}</strong></article>
      <article><span>高影響</span><strong>${number.format(report.overview.highImpact)}</strong></article>
      <article><span>負面訊號</span><strong>${number.format(report.overview.negative)}</strong></article>
      <article><span>追蹤中</span><strong>${number.format(report.overview.watchlist)}</strong></article>
    </div>
    <article class="daily-headline">
      <span>今日主軸</span>
      <strong>${escapeHtml(report.headline)}</strong>
    </article>
    <div class="daily-category-grid">${categoryCards}</div>
    <div class="daily-columns">
      <section>
        <h3>趨勢上升</h3>
        <div class="daily-trend-list">${trends}</div>
      </section>
      <section>
        <h3>風險提醒</h3>
        <ul>${risks}</ul>
      </section>
      <section>
        <h3>追蹤狀態</h3>
        <ul>${tracked}</ul>
      </section>
      <section>
        <h3>建議行動</h3>
        <ul>${report.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
      <section class="wide">
        <h3>行銷行動清單</h3>
        <ul>${marketingActions}</ul>
      </section>
    </div>
  `;
}

function renderNews() {
  const items = state.payload.items;
  if (!items.length) {
    elements.newsList.innerHTML = '<div class="empty">沒有符合條件的新聞，試著放寬搜尋或類別。</div>';
    return;
  }

  elements.newsList.innerHTML = items.map((item) => `
    <article class="news-card" data-article-id="${escapeHtml(item.id)}">
      <header>
        <div>
          <div class="tag-row">
            <span class="tag">${escapeHtml(item.category)}</span>
            ${item.tags.map((tag) => `<span class="tag muted">${escapeHtml(tag)}</span>`).join("")}
          </div>
          <h3><a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></h3>
        </div>
        <div class="news-actions">
          <button type="button" class="${item.tracking ? "is-tracked" : ""}" data-watch-action="toggle" data-article-id="${escapeHtml(item.id)}">${trackingLabel(item)}</button>
          <b title="影響力評分">${item.impact}</b>
        </div>
      </header>
      <p>${escapeHtml(item.summary)}</p>
      <div class="analysis-row">
        <span class="${sentimentClass(item.sentiment)}" title="${escapeHtml(item.sentiment.reason)}">情緒：${escapeHtml(item.sentiment.label)} ${item.sentiment.value}</span>
        <span>語義分數：${semanticLabel(item.semanticScore)}</span>
        ${item.marketing ? `<span class="marketing-score">行銷機會：${escapeHtml(item.marketing.label)} ${item.marketing.score}</span>` : ""}
        <span>${escapeHtml(item.source)} · ${formatDate(item.publishedAt)}</span>
      </div>
      <details class="news-detail">
        <summary>新聞詳情與判讀</summary>
        <div class="detail-grid">
          <section>
            <h4>新聞詳情</h4>
            <dl>
              <div><dt>來源</dt><dd>${escapeHtml(item.source)}</dd></div>
              <div><dt>分類</dt><dd>${escapeHtml(item.category)}</dd></div>
              <div><dt>發布時間</dt><dd>${formatDate(item.publishedAt)}</dd></div>
              <div><dt>標籤</dt><dd>${item.tags.map(escapeHtml).join("、")}</dd></div>
            </dl>
          </section>
          <section>
            <h4>影響力原因</h4>
            <p>${escapeHtml(item.impactReason || "尚未取得影響力說明。")}</p>
            <ul>${renderImpactFactors(item)}</ul>
          </section>
          <section>
            <h4>情緒原因</h4>
            <p>${escapeHtml(item.sentiment.reason || "尚未取得情緒說明。")}</p>
          </section>
          ${item.marketing ? `
            <section>
              <h4>行銷機會</h4>
              <p>${escapeHtml(item.marketing.reason)}</p>
              <ul>
                <li>意圖：${escapeHtml(item.marketing.intent)}</li>
                <li>品牌風險：${escapeHtml(item.marketing.risk)}</li>
                <li>建議渠道：${item.marketing.channels.map(escapeHtml).join(" / ")}</li>
              </ul>
            </section>
          ` : ""}
        </div>
        ${item.marketing ? `
          <section class="cleaned-text marketing-ideas">
            <h4>內容題材建議</h4>
            <ul>${item.marketing.ideas.map((idea) => `<li>${escapeHtml(idea)}</li>`).join("")}</ul>
          </section>
        ` : ""}
        <section class="cleaned-text">
          <h4>清洗後內容</h4>
          <p>${escapeHtml(item.excerpt)}</p>
        </section>
      </details>
    </article>
  `).join("");
}

function renderWatchlist() {
  const items = state.payload.watchlist || [];
  elements.watchCount.textContent = `${items.length} 則追蹤`;
  if (!items.length) {
    elements.watchList.innerHTML = '<div class="empty">尚未加入追蹤新聞。可在新聞卡片右上角按「加入追蹤」。</div>';
    return;
  }

  elements.watchList.innerHTML = items.map((item) => `
    <article class="watch-item">
      <div>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.article.category)}</span>
          <span class="tag muted">${escapeHtml(item.status)}</span>
        </div>
        <h3><a href="${escapeHtml(item.article.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.article.title)}</a></h3>
        <p>${escapeHtml(item.article.summary)}</p>
        <small>${escapeHtml(item.article.source)} · ${formatDate(item.article.publishedAt)} · 影響力 ${item.article.impact}</small>
      </div>
      <div class="watch-actions">
        <select data-watch-action="status" data-article-id="${escapeHtml(item.articleId)}" aria-label="追蹤狀態">
          ${["追蹤中", "需回報", "已處理"].map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <button type="button" data-watch-action="delete" data-article-id="${escapeHtml(item.articleId)}">移除</button>
      </div>
    </article>
  `).join("");
}

const taskStatuses = ["待處理", "撰寫中", "待審核", "已發布", "暫緩"];

function renderTaskTypeFilter(tasks) {
  const types = [...new Set(tasks.map((task) => task.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  elements.taskTypeFilter.innerHTML = [
    '<option value="all">全部類型</option>',
    ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
  ].join("");
  elements.taskTypeFilter.value = types.includes(state.taskType) ? state.taskType : "all";
  if (!types.includes(state.taskType)) state.taskType = "all";
}

function taskMatchesFilters(task) {
  const matchesStatus = state.taskStatus === "all" || task.status === state.taskStatus;
  const matchesPriority = state.taskPriority === "all" || task.priority === state.taskPriority;
  const matchesType = state.taskType === "all" || task.type === state.taskType;
  return matchesStatus && matchesPriority && matchesType;
}

function renderMarketingTaskCard(task) {
  return `
    <article class="marketing-task">
      <div class="task-main">
        <div class="tag-row">
          <span class="tag">${escapeHtml(task.type)}</span>
          <span class="tag muted">${escapeHtml(task.priority)}優先</span>
          <span class="tag muted">${escapeHtml(task.status)}</span>
        </div>
        <h3>${escapeHtml(task.title)}</h3>
        ${task.article ? `<p>${escapeHtml(task.article.title)}</p>` : "<p>原始新聞已不存在。</p>"}
        <small>${task.article ? `${escapeHtml(task.article.category)} · 影響力 ${task.article.impact}` : "未連結新聞"} · 更新 ${formatDate(task.updatedAt)}</small>
        <div class="task-folders">
        <details class="task-detail">
          <summary>任務詳情與草稿</summary>
          <div class="task-detail-grid">
            <label>目標受眾
              <input data-task-field="audience" data-task-id="${escapeHtml(task.id)}" value="${escapeHtml(task.audience || "")}" placeholder="例如：捐款人、家長、投資新手">
            </label>
            <label>CTA
              <input data-task-field="cta" data-task-id="${escapeHtml(task.id)}" value="${escapeHtml(task.cta || "")}" placeholder="例如：預約諮詢、下載報告、了解方案">
            </label>
            <label>預計發布日
              <input type="date" data-task-field="dueDate" data-task-id="${escapeHtml(task.id)}" value="${escapeHtml(task.dueDate || "")}">
            </label>
            <label>備註
              <textarea class="task-note" data-task-field="note" data-task-id="${escapeHtml(task.id)}" rows="4" placeholder="審核意見、素材需求、限制">${escapeHtml(task.note || "")}</textarea>
            </label>
          </div>
          <label class="task-draft">內容草稿
            <textarea data-task-field="draft" data-task-id="${escapeHtml(task.id)}" rows="10" placeholder="在這裡撰寫貼文、文章開頭、EDM 或短影音腳本">${escapeHtml(task.draft || "")}</textarea>
          </label>
          <button type="button" data-task-action="save-detail" data-task-id="${escapeHtml(task.id)}">保存詳情</button>
        </details>
        <details class="task-preview" data-task-preview="${escapeHtml(task.id)}">
          <summary>素材預覽</summary>
          <pre data-task-preview-content="${escapeHtml(task.id)}">點擊「預覽素材」後顯示可複製內容。</pre>
        </details>
      </div>
      </div>
      <div class="task-actions">
        <select data-task-action="status" data-task-id="${escapeHtml(task.id)}" aria-label="任務狀態">
          ${taskStatuses.map((status) => `<option value="${status}" ${task.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <select data-task-action="priority" data-task-id="${escapeHtml(task.id)}" aria-label="任務優先級">
          ${["高", "中", "低"].map((priority) => `<option value="${priority}" ${task.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}
        </select>
        <button type="button" data-task-action="preview" data-task-id="${escapeHtml(task.id)}">預覽素材</button>
        <button type="button" data-task-action="copy" data-task-id="${escapeHtml(task.id)}">複製素材</button>
        <button type="button" data-task-action="export" data-task-id="${escapeHtml(task.id)}">匯出素材</button>
        <button type="button" data-task-action="delete" data-task-id="${escapeHtml(task.id)}">刪除</button>
      </div>
    </article>
  `;
}

function renderTaskColumn(status, tasks, className = "") {
  const columnTasks = tasks.filter((task) => task.status === status);
  return `
    <section class="task-column ${className}">
      <header>
        <h3>${status}</h3>
        <span>${columnTasks.length}</span>
      </header>
      <div class="task-column-list">
        ${columnTasks.length ? columnTasks.map(renderMarketingTaskCard).join("") : '<div class="empty compact">此狀態目前沒有任務。</div>'}
      </div>
    </section>
  `;
}

function renderSecondaryTaskGroup(statuses, tasks) {
  const count = statuses.reduce((sum, status) => sum + tasks.filter((task) => task.status === status).length, 0);
  return `
    <details class="task-secondary-details">
      <summary>
        <span>其他任務狀態</span>
        <b>${count}</b>
      </summary>
      <div class="task-secondary-grid">
        ${statuses.map((status) => renderTaskColumn(status, tasks, "is-secondary")).join("")}
      </div>
    </details>
  `;
}

function renderMarketingTasks() {
  const tasks = state.payload.marketingTasks || [];
  renderTaskTypeFilter(tasks);
  elements.taskStatusFilter.value = state.taskStatus;
  elements.taskPriorityFilter.value = state.taskPriority;
  const filteredTasks = tasks.filter(taskMatchesFilters);
  elements.marketingTaskCount.textContent = `${filteredTasks.length}/${tasks.length} 個任務`;
  if (!tasks.length) {
    elements.marketingTaskList.innerHTML = '<div class="empty">尚未建立行銷任務。可從每日摘要的「行銷行動清單」建立。</div>';
    return;
  }

  if (!filteredTasks.length) {
    elements.marketingTaskList.innerHTML = '<div class="empty">沒有符合篩選條件的行銷任務。</div>';
    return;
  }

  const [primaryStatus, ...secondaryStatuses] = taskStatuses;
  elements.marketingTaskList.innerHTML = `
    ${renderTaskColumn(primaryStatus, filteredTasks, "is-primary")}
    ${renderSecondaryTaskGroup(secondaryStatuses, filteredTasks)}
  `;
  return;

}

function renderTimeline() {
  const timeline = state.payload.trendTimeline;
  if (!timeline || !timeline.availableTags.length) {
    elements.timeline.innerHTML = '<div class="empty">等待第一次刷新後建立時間軸。</div>';
    return;
  }

  elements.trendKeyword.innerHTML = [
    '<option value="">自動選擇</option>',
    ...timeline.availableTags.map((tag) => `<option value="${escapeHtml(tag.name)}">${escapeHtml(tag.name)} (${tag.count})</option>`)
  ].join("");
  elements.trendKeyword.value = state.trendTag || "";
  elements.trendRange.value = timeline.range;

  const max = Math.max(timeline.summary.peak, 1);
  const labelEvery = timeline.range === "7d" ? 24 : 6;
  const bars = timeline.points.map((point, index) => {
    const label = timeline.range === "7d"
      ? new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(new Date(point.hour))
      : new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", hour12: false }).format(new Date(point.hour));
    return `
      <i style="--value:${point.count / max}" title="${escapeHtml(label)}：${point.count}">
        ${index % labelEvery === 0 ? `<span>${escapeHtml(label)}</span>` : ""}
      </i>
    `;
  }).join("");

  const changeClass = timeline.summary.change > 0 ? "positive" : timeline.summary.change < 0 ? "negative" : "neutral";
  elements.timeline.innerHTML = `
    <div class="trend-summary">
      <article><span>關鍵字</span><strong>${escapeHtml(timeline.selectedTag || "尚無")}</strong></article>
      <article><span>累計出現</span><strong>${number.format(timeline.summary.total)}</strong></article>
      <article><span>單小時峰值</span><strong>${number.format(timeline.summary.peak)}</strong></article>
      <article><span>近期變化</span><strong class="${changeClass}">${timeline.summary.change}%</strong></article>
    </div>
    <div class="trend-chart" style="--columns:${timeline.points.length}">
      ${bars}
    </div>
  `;
}

function renderAlerts() {
  const alerts = state.payload.alerts;
  if (!alerts.length) {
    elements.alertList.innerHTML = '<div class="empty">尚無警告。AI 與慈善 24 小時內達 3 則、其他類別達 5 則會觸發。</div>';
    return;
  }
  elements.alertList.innerHTML = alerts.map((alert) => `
    <article class="alert-item">
      <strong>${escapeHtml(alert.category)} 激增</strong>
      <p>${escapeHtml(alert.message)}</p>
      <footer>
        <span>${escapeHtml(alert.channel)}</span>
        <span>${escapeHtml(alert.status)} · ${formatDate(alert.createdAt)}</span>
      </footer>
    </article>
  `).join("");
}

function renderAll() {
  renderSummary();
  renderControls();
  setSearchPanelOpen(state.searchOpen);
  renderBrief();
  renderTopics();
  renderTrends();
  renderMarketingDailyReport();
  renderWatchlist();
  renderMarketingTasks();
  renderNews();
  renderTimeline();
  renderAlerts();
}

function setSearchPanelOpen(open) {
  state.searchOpen = Boolean(open);
  elements.searchPanel?.classList.toggle("is-collapsed", !state.searchOpen);
  if (elements.toggleSearchButton) {
    elements.toggleSearchButton.textContent = state.searchOpen ? "收合新聞檢索" : "展開新聞檢索";
    elements.toggleSearchButton.setAttribute("aria-expanded", String(state.searchOpen));
  }
}

async function addTopic(event) {
  event.preventDefault();
  const body = {
    name: elements.topicName.value.trim(),
    query: elements.topicQuery.value.trim() || elements.topicName.value.trim(),
    priority: elements.topicPriority.value,
    enabled: true
  };
  if (!body.name) return;
  const response = await fetch("/api/topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) return;
  elements.topicForm.reset();
  await loadDashboard(true);
}

async function handleTopicAction(event) {
  const button = event.target.closest("button[data-topic-action]");
  if (!button) return;
  const id = button.dataset.topicId;
  const action = button.dataset.topicAction;
  const topic = (state.payload.topics || []).find((item) => item.id === id);
  if (!topic) return;

  if (action === "toggle") {
    await fetch(`/api/topics/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !topic.enabled })
    });
  }

  if (action === "delete") {
    await fetch(`/api/topics/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  await loadDashboard(true);
}

function handleBriefAction(event) {
  const button = event.target.closest("[data-brief-action='focus-news']");
  if (!button) return;
  setSearchPanelOpen(true);
  const article = elements.newsList.querySelector(`.news-card[data-article-id="${CSS.escape(button.dataset.articleId)}"]`);
  if (!article) return;
  article.scrollIntoView({ behavior: "smooth", block: "center" });
  article.classList.add("is-focused");
  window.setTimeout(() => article.classList.remove("is-focused"), 1800);
}

async function resetTopics() {
  await fetch("/api/topics/reset", { method: "POST" });
  clearFilters();
}

function openTopicsDialog() {
  if (elements.topicDialog?.showModal) elements.topicDialog.showModal();
}

function closeTopicsDialog() {
  if (elements.topicDialog?.open) elements.topicDialog.close();
}

async function handleNewsAction(event) {
  const button = event.target.closest("button[data-watch-action='toggle']");
  if (!button) return;
  const articleId = button.dataset.articleId;
  const item = (state.payload.items || []).find((news) => news.id === articleId);
  if (!item) return;

  if (item.tracking) {
    await fetch(`/api/watchlist/${encodeURIComponent(articleId)}`, { method: "DELETE" });
  } else {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId, status: "追蹤中" })
    });
  }
  await loadDashboard(false);
}

async function handleWatchAction(event) {
  const control = event.target.closest("[data-watch-action]");
  if (!control) return;
  const articleId = control.dataset.articleId;
  const action = control.dataset.watchAction;
  if (event.type === "click" && action === "status") return;
  if (event.type === "change" && action !== "status") return;

  if (action === "status") {
    await fetch(`/api/watchlist/${encodeURIComponent(articleId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: control.value })
    });
  }

  if (action === "delete") {
    await fetch(`/api/watchlist/${encodeURIComponent(articleId)}`, { method: "DELETE" });
  }

  await loadDashboard(false);
}

async function handleDailyMarketingAction(event) {
  const trendButton = event.target.closest("button[data-daily-trend]");
  if (trendButton) {
    state.query = "";
    state.category = "all";
    state.tag = trendButton.dataset.dailyTrend;
    state.filter = "all";
    elements.newsSearch.value = "";
    setSearchPanelOpen(true);
    await loadDashboard(false);
    document.querySelector("#search")?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  const button = event.target.closest("button[data-marketing-action]");
  if (!button) return;
  if (button.dataset.marketingAction === "focus-news") {
    setSearchPanelOpen(true);
    let article = elements.newsList.querySelector(`.news-card[data-article-id="${CSS.escape(button.dataset.sourceId)}"]`);
    if (!article) {
      state.query = "";
      state.category = "all";
      state.tag = "all";
      state.filter = "all";
      state.sort = "latest";
      elements.newsSearch.value = "";
      await loadDashboard(false);
      article = elements.newsList.querySelector(`.news-card[data-article-id="${CSS.escape(button.dataset.sourceId)}"]`);
    }
    if (!article) return;
    article.scrollIntoView({ behavior: "smooth", block: "center" });
    article.classList.add("is-focused");
    window.setTimeout(() => article.classList.remove("is-focused"), 1800);
    return;
  }
  if (button.dataset.marketingAction !== "create-task") return;
  await fetch("/api/marketing-tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceId: button.dataset.sourceId,
      idea: button.dataset.idea,
      title: button.dataset.idea,
      type: button.dataset.type,
      priority: button.dataset.priority,
      status: "待處理"
    })
  });
  await loadDashboard(false);
  document.querySelector("#marketingTasks")?.scrollIntoView({ behavior: "smooth" });
}

async function handleMarketingTaskAction(event) {
  const control = event.target.closest("[data-task-action]");
  if (!control) return;
  const id = control.dataset.taskId;
  const action = control.dataset.taskAction;
  if (event.type === "click" && (action === "status" || action === "priority")) return;
  if (event.type === "change" && action === "delete") return;
  if (event.type === "change" && action === "save-detail") return;
  if (event.type === "change" && action === "export") return;
  if (event.type === "change" && (action === "preview" || action === "copy")) return;

  async function fetchTaskMarkdown() {
    const response = await fetch(`/api/marketing-tasks/${encodeURIComponent(id)}/export`);
    if (!response.ok) return null;
    return response.json();
  }

  if (action === "status" || action === "priority") {
    await fetch(`/api/marketing-tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [action]: control.value })
    });
  }

  if (action === "delete") {
    await fetch(`/api/marketing-tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  if (action === "preview") {
    const payload = await fetchTaskMarkdown();
    if (!payload) return;
    const preview = document.querySelector(`[data-task-preview="${CSS.escape(id)}"]`);
    const content = document.querySelector(`[data-task-preview-content="${CSS.escape(id)}"]`);
    if (content) content.textContent = payload.markdown;
    if (preview) preview.open = true;
    return;
  }

  if (action === "copy") {
    const payload = await fetchTaskMarkdown();
    if (!payload) return;
    await copyText(payload.markdown);
    const original = control.textContent;
    control.textContent = "已複製";
    window.setTimeout(() => {
      control.textContent = original;
    }, 1400);
    return;
  }

  if (action === "export") {
    const payload = await fetchTaskMarkdown();
    if (!payload) return;
    const blob = new Blob([payload.markdown], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = payload.filename || "marketing-task.md";
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
    return;
  }

  if (action === "save-detail") {
    const container = control.closest(".marketing-task");
    const fields = {};
    container.querySelectorAll("[data-task-field]").forEach((field) => {
      fields[field.dataset.taskField] = field.value;
    });
    await fetch(`/api/marketing-tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields)
    });
  }

  await loadDashboard(false);
}

async function loadDashboard(force = false) {
  if (isLoading) return;
  isLoading = true;
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = force ? "刷新中..." : "讀取中...";
  try {
    if (force) {
      await fetch("/api/refresh", { method: "POST" });
    }
    const params = new URLSearchParams({
      q: state.query,
      category: state.category,
      tag: state.tag,
      filter: state.filter,
      sort: state.sort,
      trendTag: state.trendTag,
      trendRange: state.trendRange
    });
    const response = await fetch(`/api/dashboard?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.payload = await response.json();
    renderAll();
  } catch (error) {
    elements.newsList.innerHTML = `<div class="empty">資料讀取失敗：${escapeHtml(error.message)}</div>`;
  } finally {
    isLoading = false;
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "立即刷新";
  }
}

function clearFilters() {
  state.query = "";
  state.category = "all";
  state.tag = "all";
  state.filter = "all";
  state.sort = "latest";
  state.trendTag = "";
  state.trendRange = "24h";
  elements.newsSearch.value = "";
  loadDashboard(false);
}

let searchTimer;
function scheduleLoad() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadDashboard(false), 260);
}

elements.refreshButton.addEventListener("click", () => loadDashboard(true));
elements.topicForm.addEventListener("submit", addTopic);
elements.topicList.addEventListener("click", handleTopicAction);
elements.briefStrip.addEventListener("click", handleBriefAction);
elements.openTopicsButton.addEventListener("click", openTopicsDialog);
elements.closeTopicsButton.addEventListener("click", closeTopicsDialog);
elements.topicDialog.addEventListener("click", (event) => {
  if (event.target === elements.topicDialog) closeTopicsDialog();
});
elements.resetTopicsButton.addEventListener("click", resetTopics);
elements.dailyReport.addEventListener("click", handleDailyMarketingAction);
elements.newsList.addEventListener("click", handleNewsAction);
elements.watchList.addEventListener("change", handleWatchAction);
elements.watchList.addEventListener("click", handleWatchAction);
elements.marketingTaskList.addEventListener("change", handleMarketingTaskAction);
elements.marketingTaskList.addEventListener("click", handleMarketingTaskAction);
elements.taskStatusFilter.addEventListener("change", (event) => {
  state.taskStatus = event.target.value;
  renderMarketingTasks();
});
elements.taskPriorityFilter.addEventListener("change", (event) => {
  state.taskPriority = event.target.value;
  renderMarketingTasks();
});
elements.taskTypeFilter.addEventListener("change", (event) => {
  state.taskType = event.target.value;
  renderMarketingTasks();
});
elements.newsSearch.addEventListener("input", (event) => {
  state.query = event.target.value;
  scheduleLoad();
});
elements.categoryFilter.addEventListener("change", (event) => {
  state.category = event.target.value;
  loadDashboard(false);
});
elements.tagFilter.addEventListener("change", (event) => {
  state.tag = event.target.value;
  loadDashboard(false);
});
elements.quickFilter.addEventListener("change", (event) => {
  state.filter = event.target.value;
  loadDashboard(false);
});
elements.sortOrder.addEventListener("change", (event) => {
  state.sort = event.target.value;
  loadDashboard(false);
});
elements.trendKeyword.addEventListener("change", (event) => {
  state.trendTag = event.target.value;
  loadDashboard(false);
});
elements.trendRange.addEventListener("change", (event) => {
  state.trendRange = event.target.value;
  loadDashboard(false);
});
elements.clearFiltersButton.addEventListener("click", clearFilters);
elements.toggleSearchButton.addEventListener("click", () => {
  setSearchPanelOpen(!state.searchOpen);
});
elements.trendGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".trend-card");
  if (!card) return;
  state.tag = card.dataset.tag;
  state.query = "";
  elements.newsSearch.value = "";
  setSearchPanelOpen(true);
  loadDashboard(false).then(() => document.querySelector("#search")?.scrollIntoView({ behavior: "smooth" }));
});
elements.trendGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".trend-card");
  if (!card) return;
  event.preventDefault();
  card.click();
});

renderClock();
window.setInterval(renderClock, 1000);
window.setInterval(() => {
  if (!document.hidden) loadDashboard(true);
}, AUTO_REFRESH_MS);
loadDashboard(false);
