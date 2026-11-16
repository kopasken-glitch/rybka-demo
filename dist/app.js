"use strict";
const $ = (id) => document.getElementById(id);
const jobs = window.RYBKA.jobs;
const categories = ["Все вакансии", "Маркетинг", "Продукт", "Дизайн", "Аналитика", "Digital"];
const groups = [
  ["format", "Формат", ["Удалённо", "Гибрид", "Офис"]],
  ["salary", "Зарплата", ["Указана"]]
];
const emptyFilters = () => ({ format: new Set(), salary: new Set() });
const state = { cat: categories[0], filters: emptyFilters(), query: "", company: "", onlySaved: false, limit: 8, sort: "fresh" };
let bookmarks;
try { bookmarks = new Set(JSON.parse(localStorage.getItem("rybka-jobs-bookmarks-v1") || "[]")); } catch { bookmarks = new Set(); }
const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]);
const icon = (name) => '<svg aria-hidden="true"><use href="#' + name + '"/></svg>';
const normalize = (s) => s.toLowerCase().replaceAll("ё", "е").trim();
const cleanDate = (s) => new Date(s + "T12:00:00Z");
const date = (s) => new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", timeZone: "UTC" }).format(cleanDate(s));
const formatter = new Intl.PluralRules("ru");
const vacancyCount = (n) => n + " " + ({ one:"вакансия", few:"вакансии", many:"вакансий", other:"вакансии" })[formatter.select(n)];
const jobById = new Map(jobs.map((j) => [j.id, j]));
let dialogJob = null;
let matchById = {};
$("companies").replaceChildren(...[...new Set(jobs.map(job => job.company))]
  .sort((a, b) => a.localeCompare(b, "ru")).map(company => new Option(company)));

function updateMatches(matches) {
  matchById = matches;
  const hasResume = Object.keys(matches).length > 0;
  $("match-sort").hidden = !hasResume;
  $("match-promo").hidden = hasResume;
  if (!hasResume && state.sort === "match") state.sort = $("sort").value = "fresh";
  render();
}

function showRelevantJobs() {
  reset();
  state.sort = $("sort").value = "match";
  change();
  $("catalog").scrollIntoView();
}

function matchBadge(result) {
  const tone = result.percent >= 70 ? "high" : result.percent > 10 ? "middle" : "low";
  return '<span class="match-badge ' + tone + '">' + result.percent + '% совпадение</span>';
}

function matchDetails(job) {
  const result = matchById[job.id];
  if (!result) return "";
  const roleText = result.roleMatch ? "Профессия совпадает." : "Вакансия из другого направления.";
  const matched = result.matched.length ? "Совпали: " + result.matched.join(", ") + "." : "Совпадений по навыкам пока нет.";
  const missing = result.missing.length ? "В резюме не найдены: " + result.missing.join(", ") + "." : "";
  return '<section class="match-detail" aria-label="Совпадение с резюме">' + matchBadge(result) +
    '<p>' + escape(roleText) + ' ' + escape(matched) + '</p>' +
    (missing ? '<p>' + escape(missing) + '</p>' : '') + '</section>';
}
$("edition").textContent = "Срез на " + date(window.RYBKA.checked);
$("saved").setAttribute("aria-label", "Избранное");
$("search").querySelector("button").setAttribute("aria-label", "Найти вакансии");

$("categories").innerHTML = categories.map((c) => '<button type="button" data-category="' + escape(c) + '">' + escape(c) + '</button>').join("");
$("filters").className = "filters-row";
$("filters").innerHTML = groups.map(([key, label, values]) => '<fieldset class="filter-group"><legend>' + escape(label) + '</legend>' +
  values.map((v) => '<label><input type="checkbox" data-group="' + key + '" value="' + escape(v) + '">' + escape(v) + '</label>').join("") + '</fieldset>').join("");

function bookmarkButton(job) {
  const saved = bookmarks.has(job.id);
  return '<button class="icon-button" type="button" data-bookmark="' + escape(job.id) + '" aria-pressed="' + saved + '" aria-label="' +
    (saved ? "Убрать из избранного" : "Сохранить в избранное") + '" title="' + (saved ? "Убрать из избранного" : "Сохранить") + '">' + icon("bookmark") + '</button>';
}
function chips(job) {
  return '<div class="chips">' +
    (job.city ? '<span class="chip location">' + icon("pin") + escape(job.city) + '</span>' : "") +
    [...job.formats, job.level, ...job.tags.slice(0, 2)].filter(Boolean).map((x) => '<span class="chip">' + escape(x) + '</span>').join("") + '</div>';
}
function card(job) {
  const color = [...job.company].reduce((a, b) => a + b.codePointAt(0), 0) % 5;
  const initials = job.company.split(/[ .]+/).filter(Boolean).slice(0, 2).map((v,i,all) => all.length === 1 ? v.slice(0, 2) : v[0]).join("").toUpperCase();
  return '<article class="card"><div class="card-main"><span class="monogram tint-' + color + '" aria-hidden="true">' + escape(initials) +
    '</span><div><h3><button type="button" class="card-title" data-open="' + escape(job.id) + '">' + escape(job.title) +
    '</button></h3><p class="company">' + escape(job.company) + '</p></div><div class="card-end"><span class="pay' + (job.salaryMin == null ? ' unknown' : '') +
    '">' + escape(job.salary) + '</span>' + bookmarkButton(job) + '</div></div><p class="summary">' + escape(job.tasks) +
    '</p><div class="card-meta">' + chips(job) + '<div class="card-caption">' +
    (matchById[job.id] ? matchBadge(matchById[job.id]) : "") + '<span class="source">' + escape(job.source) + (job.date ? ' · ' + escape(date(job.date)) : '') + '</span></div></div></article>';
}
function matches(job) {
  if (state.onlySaved && !bookmarks.has(job.id)) return false;
  if (state.cat !== categories[0] && job.category !== state.cat) return false;
  if (state.filters.format.size && !job.formats.some((f) => state.filters.format.has(f))) return false;
  if (!normalize(state.company).split(/\s+/).every(word => normalize(job.company).includes(word))) return false;
  if (state.filters.salary.size && job.salaryMin == null) return false;
  const haystack = normalize([job.title, job.company, job.tasks, job.who, job.category, job.city, job.level, ...job.formats, ...job.tags].join(" "));
  return normalize(state.query).split(/\s+/).every((word) => haystack.includes(word));
}
function render() {
  const focused = document.activeElement;
  const priorBookmark = focused?.dataset.bookmark;
  const found = jobs.filter(matches).sort((a,b) =>
    (state.sort === "salary" ? (b.salaryMin ?? -1) - (a.salaryMin ?? -1) : 0) ||
    (state.sort === "match" ? (matchById[b.id]?.percent ?? 0) - (matchById[a.id]?.percent ?? 0) : 0) ||
    (b.date || "").localeCompare(a.date || ""));
  $("catalog-title").textContent = state.onlySaved ? "Избранное" : "Вакансии";
  $("result-count").textContent = vacancyCount(found.length);
  $("list").innerHTML = found.length ? found.slice(0, state.limit).map(card).join("") :
    '<div class="empty"><h3>' + (state.onlySaved && !bookmarks.size ? "Здесь будут сохранённые вакансии" : "Ничего не нашли") +
    '</h3><p>' + (state.onlySaved && !bookmarks.size ? "Нажми на закладку в карточке, чтобы вернуться к ней позже." : "Попробуй изменить запрос или убрать часть фильтров.") +
    '</p><button type="button" class="primary" data-clear>Показать все вакансии</button></div>';
  $("more").hidden = found.length <= state.limit;
  $("saved-count").textContent = bookmarks.size;
  $("saved-count").hidden = !bookmarks.size;
  $("saved").setAttribute("aria-pressed", state.onlySaved);
  $("categories").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.category === state.cat));
  $("filters").querySelectorAll("input").forEach((b) => b.checked = state.filters[b.dataset.group].has(b.value));
  if (priorBookmark && !$("dialog").open) {
    const replacement = $("list").querySelector('[data-bookmark="' + CSS.escape(priorBookmark) + '"]');
    (replacement || $("saved")).focus({preventScroll:true});
  }
}
function change() { state.limit = 8; render(); }
function reset() {
  Object.assign(state, { cat: categories[0], filters: emptyFilters(), query: "", company: "", sort: "fresh", onlySaved: false });
  $("query").value = ""; $("company-query").value = ""; $("sort").value = "fresh"; change();
}
function toggleBookmark(id, button) {
  if (bookmarks.has(id)) bookmarks.delete(id);
  else bookmarks.add(id);
  try { localStorage.setItem("rybka-jobs-bookmarks-v1", JSON.stringify([...bookmarks])); } catch {}
  render();
  if ($("dialog").open && dialogJob?.id === id) {
    const saved = bookmarks.has(id);
    button.setAttribute("aria-pressed", saved);
    button.setAttribute("aria-label", saved ? "Убрать из избранного" : "Сохранить в избранное");
    button.title = saved ? "Убрать из избранного" : "Сохранить";
  }
}
function section(title, body) {
  return body ? '<section class="detail-section"><h3>' + escape(title) + '</h3><p>' + escape(body) + '</p></section>' : "";
}
function showDialog() {
  const d = $("dialog");
  d.setAttribute("aria-labelledby", "detail-title");
  d.showModal(); d.scrollTop = 0; $("close-detail").focus();
}
function openJob(job) {
  if (!job) return;
  dialogJob = job;
  $("detail").innerHTML = '<p class="detail-kicker">' + escape(job.category) + " / " + escape(job.source) + '</p><h2 id="detail-title">' +
    escape(job.title) + '</h2><p class="company">' + escape(job.company) + '</p><p class="detail-pay">' + escape(job.salary) + '</p>' + chips(job) + matchDetails(job) +
    section("Чем предстоит заниматься", job.tasks) + section("Кого ищут", job.who) + section("Будет плюсом", job.plus) + section("Что предлагают", job.offer) +
    '<div class="detail-actions"><a class="primary" href="' + escape(job.url) + '" target="_blank" rel="noopener noreferrer">Откликнуться ↗</a>' +
    bookmarkButton(job) + '</div><small class="source">Отклик на сайте источника</small>';
  showDialog();
}
function about() {
  dialogJob = null;
  $("detail").innerHTML = '<p class="detail-kicker">RYBKA / ПИЛОТ</p><h2 id="detail-title">О проекте</h2>' +
    section("Что здесь", "Каталог вакансий в маркетинге, digital и продукте. В карточках — краткие условия, источник и ссылка на исходное объявление.") +
    section("Откуда вакансии", [...new Set(jobs.map((j) => j.source))].join(", ") + ". Этот снимок подборки проверен " + date(window.RYBKA.checked) + ".") +
    section("Как сохранить вакансию", "Закладки хранятся в этом браузере. Регистрироваться не нужно.");
  showDialog();
}
$("search").addEventListener("submit", (e) => { e.preventDefault(); state.query = $("query").value.trim(); state.onlySaved = false; change(); $("catalog").scrollIntoView(); });
$("query").addEventListener("input", () => { state.query = $("query").value.trim(); change(); });
document.querySelector(".routes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-route]"); if (!b) return;
  reset(); state.cat = b.dataset.route; change(); $("catalog").scrollIntoView();
});
document.querySelector(".quick").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  reset();
  if (b.dataset.q) { $("query").value = b.dataset.q; state.query = b.dataset.q; }
  else state.filters.format.add("Удалённо");
  change(); $("catalog").scrollIntoView();
});
$("categories").addEventListener("click", (e) => { if (e.target.dataset.category) { state.cat = e.target.dataset.category; change(); } });
$("filters").addEventListener("change", (e) => {
  const f = state.filters[e.target.dataset.group]; if (!f) return;
  if (e.target.checked) f.add(e.target.value); else f.delete(e.target.value); change();
});
$("company-query").addEventListener("input", () => { state.company = $("company-query").value.trim(); change(); });
$("sort").addEventListener("change", () => { state.sort = $("sort").value; change(); });
$("reset").addEventListener("click", reset);
$("saved").addEventListener("click", () => {
  const active = !state.onlySaved;
  reset();
  state.onlySaved = active; change(); $("catalog").scrollIntoView();
});
$("more").addEventListener("click", () => {
  const limit = state.limit; state.limit += 8; render();
  $("list").querySelectorAll("[data-open]")[limit]?.focus({preventScroll:true});
});
$("list").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.open) openJob(jobById.get(b.dataset.open));
  if (b.dataset.bookmark) toggleBookmark(b.dataset.bookmark, b);
  if (b.hasAttribute("data-clear")) { reset(); $("categories").querySelector("button").focus({preventScroll:true}); }
});
$("detail").addEventListener("click", (e) => { const b = e.target.closest("[data-bookmark]"); if (b) toggleBookmark(b.dataset.bookmark,b); });
$("footer-about").addEventListener("click", about);
const futureFooter = {
  company: ["О компании", "Раздел о команде RYBKA находится в разработке."],
  blog: ["Блог", "Здесь будут материалы о поиске работы, резюме и рынке digital."],
  ads: ["Реклама на сайте", "Здесь появятся форматы размещения и условия для рекламодателей."],
  calendar: ["Производственный календарь", "Здесь появится календарь рабочих, выходных и праздничных дней."],
};

document.querySelector(".site-footer").addEventListener("click", (event) => {
  const item = event.target.closest("[data-footer]");
  if (!item) return;
  showFooterSection(item.dataset.footer);
});

function showFooterSection(key) {
  dialogJob = null;
  if (key === "directory") {
    const companies = [...new Set(jobs.map(job => job.company))].sort((a, b) => a.localeCompare(b, "ru"));
    $("detail").innerHTML = '<h2 id="detail-title">Каталог компаний</h2><p>Выберите компанию, чтобы увидеть её вакансии.</p>' +
      '<div class="company-directory">' + companies.map(company => {
        const total = jobs.filter(job => job.company === company).length;
        return '<button type="button" data-company="' + escape(company) + '">' + escape(company) +
          '<small>' + vacancyCount(total) + ' ↗</small></button>';
      }).join("") + '</div>';
  } else if (key === "audit") {
    $("detail").innerHTML = '<h2 id="detail-title">Экспертная рекомендация</h2>' +
      '<p>Карьерный консультант hh.ru проверит резюме и даст письменные рекомендации.</p>' +
      section("Что можно разобрать", "Как представить опыт для нужной роли, описать результаты и заполнить пробелы. Разбор подойдёт и тем, кто только начинает карьеру.") +
      section("Как заказать", "Условия услуги, сроки и оплата указаны на сайте hh.ru.") +
      '<div class="detail-actions"><a class="primary" target="_blank" rel="noopener noreferrer" href="https://hh.ru/article/resume_audit">Открыть сервис hh.ru ↗</a></div>';
  } else {
    const [title, description] = futureFooter[key];
    $("detail").innerHTML = '<h2 id="detail-title">' + escape(title) + '</h2><p>' + escape(description) + '</p>';
  }
  showDialog();
}

$("detail").addEventListener("click", (event) => {
  const item = event.target.closest("[data-company]");
  if (!item) return;
  $("dialog").close();
  reset();
  $("company-query").value = state.company = item.dataset.company;
  change();
  $("catalog").scrollIntoView();
  $("company-query").focus({preventScroll: true});
});

$("footer-jobs").addEventListener("click", reset);
$("close-detail").addEventListener("click", () => $("dialog").close());
$("dialog").addEventListener("click", (e) => {
  if (e.target !== $("dialog")) return;
  const r = $("dialog").getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $("dialog").close();
});
render();
