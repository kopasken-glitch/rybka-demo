"use strict";
const $ = (id) => document.getElementById(id);
const jobs = window.RYBKA.jobs;
const serverCatalog = Boolean(window.RYBKA.api);
const allCategories = "Все вакансии";
const categorySlugs = window.RYBKA.categorySlugs;
const categories = [allCategories, ...Object.keys(categorySlugs)];
const directions = ["HR", "IT-разработка", "Дизайн", "Аналитика", "Маркетинг", "Продажи", "Консалтинг",
  "Продюсирование", "Управление продуктом", "Финансы", "C-level", "Digital"];
const experienceBands = [
  {label: "Менее 1 года", min: 0, max: 1},
  {label: "1–3 года", min: 1, max: 3},
  {label: "3–5 лет", min: 3, max: 5},
  {label: "5–10 лет", min: 5, max: 10},
  {label: "10 лет и больше", min: 10, max: Infinity}
];
const salaryBands = [
  {label: "До 50 тыс. ₽", min: 0, max: 50_000},
  {label: "От 50 до 100 тыс. ₽", min: 50_000, max: 100_000},
  {label: "От 100 до 150 тыс. ₽", min: 100_000, max: 150_000},
  {label: "От 150 до 250 тыс. ₽", min: 150_000, max: 250_000},
  {label: "От 250 тыс. ₽ до ∞", min: 250_000, max: Infinity}
];
const groups = [
  ["format", "Формат", ["Удалённо", "Гибрид", "Офис"]],
  ["salary", "Зарплата", [...salaryBands.map(band => band.label), "Указана"]]
];
const emptyFilters = () => ({ format: new Set(), salary: new Set() });
const params = new URLSearchParams(location.search);
const routeJobId = document.body.dataset.jobId || null;
const routeCatalog = document.body.dataset.catalogPage;
const page = routeJobId ? "job" : routeCatalog || params.get("page") || "home";
const currentJobId = routeJobId || params.get("id");
const siteRoot = new URL(document.body.dataset.siteRoot || (routeJobId ? "../" : "./"), location.href);
document.querySelectorAll('a[href]:not([href^="#"])').forEach(link => { link.href = link.href; });
const publicCatalogs = new Set(["jobs", "internships"]);
function pageUrl(name, details = {}) {
  if (!publicCatalogs.has(name)) return siteRoot.href + "?" + new URLSearchParams({page: name, ...details});
  const {category, ...filters} = details;
  const slug = Object.hasOwn(categorySlugs, category) ? categorySlugs[category] + "/" : "";
  const url = new URL(name + "/" + slug, siteRoot);
  url.search = new URLSearchParams(filters);
  return url.href;
}
const jobUrl = (job) => new URL("job-" + encodeURIComponent(job.id), siteRoot).href;
const accountPages = new Set(["login", "register", "profile", "resume", "ready"]);
const catalogPages = new Set(["home", "jobs", "favorites", "internships"]);
const pageSize = 8;
const catalogPositionKey = "rybka-catalog-position";
const returnPositionKey = "rybka-catalog-return";
const sorts = ["fresh", "salary", "match"];
const catalogDefaults = () => ({
  cat: allCategories, filters: emptyFilters(), query: "", company: "", city: "", direction: "",
  experience: "", onlySaved: page === "favorites", limit: pageSize, sort: "fresh"
});
const state = catalogDefaults();
let bookmarks = new Set();
let legacyBookmarks = [];
try {
  const legacy = JSON.parse(localStorage.getItem("rybka-jobs-bookmarks-v1") || "[]");
  if (Array.isArray(legacy)) legacyBookmarks = legacy.filter(id => typeof id === "string" &&
    (serverCatalog || jobs.some(job => job.id === id)));
} catch {}
const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]);
const icon = (name) => '<svg aria-hidden="true"><use href="#' + name + '"/></svg>';
const normalize = (s) => s.toLowerCase().replaceAll("ё", "е").trim();
const jobCities = (job) => (job.city || "").split(/\s*\/\s*/).filter(city => city && city !== "Зависит от города");
const cities = (window.RYBKA.cities || [...new Set(jobs.flatMap(jobCities))]).sort((a, b) => a.localeCompare(b, "ru"));
const directionOf = (job) => job.direction || (job.category === "Продукт" ? "Управление продуктом" : job.category);
const isOpen = (job) => job.status !== "closed";
const isInternship = (job) => job.type === "internship";
const cleanDate = (s) => new Date(s + "T12:00:00Z");
const date = (s) => new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", timeZone: "UTC" }).format(cleanDate(s));
const formatter = new Intl.PluralRules("ru");
const vacancyCount = (n) => n + " " + ({ one:"вакансия", few:"вакансии", many:"вакансий", other:"вакансии" })[formatter.select(n)];
const jobById = new Map(jobs.map((j) => [j.id, j]));
const recentFirst = (a, b) => (b.date || "").localeCompare(a.date || "");
const salaryFirst = (a, b) => (b.salaryMin ?? -1) - (a.salaryMin ?? -1);
let matchById = {};
document.querySelector(".hero").hidden = page !== "home";
$("catalog").hidden = !catalogPages.has(page) || page === "favorites";
if (page !== "home" && catalogPages.has(page)) {
  $("catalog").querySelector(".catalog-heading").after($("search"));
}
$("detail-page").hidden = catalogPages.has(page) || accountPages.has(page);
$("account-page").hidden = !accountPages.has(page);
document.querySelectorAll(".nav-link").forEach(link => {
  const current = link.dataset.catalog === (page === "internships" ? page : "jobs");
  link.classList.toggle("current", current);
  if (current && (page === "jobs" || page === "internships")) link.setAttribute("aria-current", "page");
});

function restoreFilters() {
  const slug = routeCatalog && location.pathname.slice(siteRoot.pathname.length).split("/")[1];
  const category = Object.keys(categorySlugs).find(name => categorySlugs[name] === slug) || params.get("category");
  state.cat = categories.includes(category) ? category : allCategories;
  state.query = params.get("q") || "";
  state.company = params.get("company") || "";
  state.city = cities.includes(params.get("city")) ? params.get("city") : "";
  state.direction = directions.includes(params.get("direction")) ? params.get("direction") : "";
  state.experience = experienceBands.some(band => band.label === params.get("experience")) ? params.get("experience") : "";
  state.sort = sorts.includes(params.get("sort")) ? params.get("sort") : "fresh";
  for (const [key, , values] of groups) {
    state.filters[key] = new Set(params.getAll(key).filter(value => values.includes(value)));
  }
}

function syncCatalogUrl() {
  const usePath = publicCatalogs.has(page) || (page === "home" && state.cat !== allCategories);
  const url = new URL(location.href);
  if (usePath) {
    url.pathname = new URL(pageUrl(page === "home" ? "jobs" : page, {category: state.cat})).pathname;
    url.searchParams.delete("page");
  }
  for (const [key, value] of Object.entries({
    category: usePath || state.cat === allCategories ? "" : state.cat,
    q: state.query, company: state.company, city: state.city, direction: state.direction,
    experience: state.experience, sort: state.sort === "fresh" ? "" : state.sort
  })) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  for (const [key, , values] of groups) {
    url.searchParams.delete(key);
    for (const value of values) if (state.filters[key].has(value)) url.searchParams.append(key, value);
  }
  if (usePath && page === "home") {
    url.hash = "catalog";
    location.assign(url);
  } else if (url.href !== location.href) {
    history.replaceState(history.state, "", url);
  }
}

function saveCatalogPosition() {
  if (!catalogPages.has(page) || $("catalog").hidden) return;
  const position = {url: location.href, limit: state.limit, y: window.scrollY};
  history.replaceState({...history.state, catalogPosition: position}, "");
  try { sessionStorage.setItem(catalogPositionKey, JSON.stringify(position)); } catch {}
}

function readCatalogPosition(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

function restoreCatalogPosition() {
  const position = readCatalogPosition(returnPositionKey) || history.state?.catalogPosition;
  if (!position || position.url !== location.href) return;
  try { sessionStorage.removeItem(returnPositionKey); } catch {}
  state.limit = Math.max(pageSize, Math.min(position.limit, serverCatalog ? 1000 : jobs.length));
  return position;
}

function setupDetailBack() {
  const position = readCatalogPosition(catalogPositionKey);
  if (!position) return;
  const back = $("detail-back");
  back.href = position.url;
  back.addEventListener("click", () => {
    try { sessionStorage.setItem(returnPositionKey, JSON.stringify(position)); } catch {}
  });
}

function setPageTitle(title) {
  if (page !== "home") document.title = title + " — RYBKA";
}

let signedInForMatches = false;

function refreshFeedMatches() {
  document.querySelectorAll("[data-feed-match]").forEach(slot => {
    slot.innerHTML = jobFeedMatch(slot.dataset.feedMatch);
  });
}

function updateMatches(matches, signedIn, hasResume) {
  matchById = serverCatalog && signedIn ? {...matchById, ...matches} : matches;
  signedInForMatches = signedIn;
  refreshFeedMatches();
  $("match-sort").hidden = !hasResume;
  $("match-promo").hidden = hasResume;
  const resetSort = !hasResume && state.sort === "match";
  if (resetSort) {
    state.sort = "fresh";
    syncCatalogUrl();
  }
  if (catalogPages.has(page)) {
    if (!serverCatalog || state.onlySaved || resetSort) render();
    else if (found.length) paintCatalog();
  }
}

function showRelevantJobs() {
  location.assign(pageUrl("jobs", {sort: "match"}));
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

$("categories").innerHTML = categories.map((category) => '<button type="button" data-category="' + escape(category) + '">' +
  escape(page === "internships" && category === allCategories ? "Все направления" : category) + '</button>').join("") +
  '<a class="vacancy-kind" href="' + escape(pageUrl(page === "internships" ? "jobs" : "internships")) + '"' +
  (page === "internships" ? "" : ' target="_blank" rel="noopener"') + '>' +
  (page === "internships" ? "Вакансии" : "Стажировки") + ' ↗</a>';
$("filters").className = "filters-row";
$("filters").innerHTML = groups.map(([key, label, values]) => '<fieldset class="filter-group"><legend>' + escape(label) + '</legend>' +
  values.map((v) => '<label><input type="checkbox" data-group="' + key + '" value="' + escape(v) + '">' + escape(v) + '</label>').join("") + '</fieldset>').join("");
const selectFilters = [
  ["city", "Все города", cities],
  ["direction", "Все направления", directions],
  ["experience", "Любой опыт", experienceBands.map(band => band.label)]
];
for (const [key, placeholder, values] of selectFilters) {
  $(key).add(new Option(placeholder, ""));
  for (const value of values) $(key).add(new Option(value, value));
}

function bookmarkButton(job) {
  const saved = bookmarks.has(job.id);
  return '<button class="icon-button" type="button" data-bookmark="' + escape(job.id) + '" aria-pressed="' + saved + '" aria-label="' +
    (saved ? "Убрать из избранного" : "Сохранить в избранное") + '" title="' + (saved ? "Убрать из избранного" : "Сохранить") + '">' + icon("bookmark") + '</button>';
}
function updateBookmarkCount() {
  $("saved-count").textContent = bookmarks.size;
  $("saved-count").hidden = !bookmarks.size;
}
function chips(job) {
  return '<div class="chips">' +
    (job.city ? '<span class="chip location">' + icon("pin") + escape(job.city) + '</span>' : "") +
    [...job.formats, isInternship(job) ? "Стажировка" : job.level, ...job.tags.slice(0, 2)].filter(Boolean)
      .map((x) => '<span class="chip">' + escape(x) + '</span>').join("") + '</div>';
}
function card(job) {
  const color = [...job.company].reduce((a, b) => a + b.codePointAt(0), 0) % 5;
  const initials = job.company.split(/[ .]+/).filter(Boolean).slice(0, 2).map((v,i,all) => all.length === 1 ? v.slice(0, 2) : v[0]).join("").toUpperCase();
  return '<article class="card"><div class="card-main"><span class="monogram tint-' + color + '" aria-hidden="true">' + escape(initials) +
    '</span><div><h3><a class="card-title" data-open href="' + escape(jobUrl(job)) + '">' + escape(job.title) +
    '</a></h3><p class="company">' + escape(job.company) + '</p></div><div class="card-end"><span class="pay' + (job.salaryMin == null ? ' unknown' : '') +
    '">' + escape(job.salary) + '</span>' + bookmarkButton(job) + '</div></div><p class="summary">' + escape(job.tasks) +
    '</p><div class="card-meta">' + chips(job) + '<div class="card-caption">' +
    (isOpen(job) ? (matchById[job.id] ? matchBadge(matchById[job.id]) : "") : '<span class="job-closed">Закрыта</span>') +
    '<span class="source">' + escape(job.source) + (job.date ? ' · ' + escape(date(job.date)) : '') + '</span></div></div></article>';
}
function matchesSalary(amount, selected) {
  if (!selected.size) return true;
  if (amount == null) return false;
  const bands = salaryBands.filter(band => selected.has(band.label));
  return !bands.length || bands.some(band => amount >= band.min && amount < band.max);
}

function matches(job) {
  if (state.onlySaved && !bookmarks.has(job.id)) return false;
  if (!state.onlySaved && !isOpen(job)) return false;
  if (page === "internships" && !isInternship(job)) return false;
  if (state.cat !== allCategories && job.category !== state.cat) return false;
  if (state.city && !jobCities(job).includes(state.city)) return false;
  if (state.direction && directionOf(job) !== state.direction) return false;
  if (state.experience) {
    const {min, max} = experienceBands.find(band => band.label === state.experience);
    if (job.experienceMin == null || job.experienceMin < min || job.experienceMin >= max) return false;
  }
  if (state.filters.format.size && !job.formats.some((f) => state.filters.format.has(f))) return false;
  if (!normalize(state.company).split(/\s+/).every(word => normalize(job.company).includes(word))) return false;
  if (!matchesSalary(job.salaryMin, state.filters.salary)) return false;
  const haystack = normalize([job.title, job.company, job.tasks, job.who, directionOf(job), job.category, job.city,
    isInternship(job) ? "стажировка стажёр" : job.level, ...job.formats, ...job.tags].join(" "));
  return normalize(state.query).split(/\s+/).every((word) => haystack.includes(word));
}
let found = [];
let totalFound = 0;
let catalogCursor = null;
let catalogRequest = null;
let catalogLoading = false;

async function requestVacancies(path, filters, signal) {
  const url = new URL(path, siteRoot);
  url.search = filters;
  const response = await fetch(url, {signal});
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Не удалось загрузить вакансии.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function catalogParams() {
  const filters = new URLSearchParams({
    section: page, category: state.cat === allCategories ? "" : state.cat,
    q: state.query, company: state.company, city: state.city, direction: state.direction,
    experience: state.experience, sort: state.sort, limit: pageSize
  });
  for (const [key, values] of Object.entries(state.filters)) {
    for (const value of values) filters.append(key, value);
  }
  return filters;
}

function catalogError(retry) {
  const notice = document.createElement("div");
  notice.className = "empty";
  notice.innerHTML = '<p role="status">Не удалось загрузить вакансии.</p><button class="outline-button" type="button">Повторить</button>';
  notice.querySelector("button").addEventListener("click", retry);
  return notice;
}

async function fetchCatalog(append = false) {
  if (append && (!catalogCursor || catalogLoading)) return;
  catalogRequest?.abort();
  const request = new AbortController();
  catalogRequest = request;
  catalogLoading = true;
  $("more").disabled = true;
  $("list").setAttribute("aria-busy", "true");
  const filters = catalogParams();
  const target = append ? found.length + pageSize : state.limit;
  let cursor = append ? catalogCursor : null;
  const batch = [];
  const seen = new Set(append ? found.map(job => job.id) : []);
  const scores = {};
  try {
    let data;
    do {
      if (cursor) filters.set("cursor", cursor);
      data = await requestVacancies("api/jobs", filters, request.signal);
      for (const job of data.jobs) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        batch.push(job);
      }
      Object.assign(scores, data.matches);
      cursor = data.nextCursor;
    } while (cursor && (append ? found.length : 0) + batch.length < target);
    if (request.signal.aborted) return;
    const start = append ? found.length : 0;
    found = append ? [...found, ...batch] : batch;
    Object.assign(matchById, scores);
    state.limit = Math.max(pageSize, found.length);
    totalFound = data.total;
    catalogCursor = cursor;
    paintCatalog();
    if (append) $("list").querySelectorAll("[data-open]")[start]?.focus({preventScroll: true});
  } catch (error) {
    if (request.signal.aborted) return;
    if (!append) {
      found = [];
      catalogCursor = null;
      $("result-count").textContent = "";
      $("more").hidden = true;
      $("list").replaceChildren(catalogError(() => fetchCatalog()));
    } else {
      $("list").querySelector(".empty")?.remove();
      $("list").append(catalogError(() => fetchCatalog(error.status !== 400)));
    }
  } finally {
    if (catalogRequest === request) {
      catalogLoading = false;
      $("more").disabled = false;
      $("list").removeAttribute("aria-busy");
    }
  }
}

function syncFilterControls() {
  $("query").value = state.query;
  $("company-query").value = state.company;
  for (const [key] of selectFilters) $(key).value = state[key];
  $("sort").value = state.sort;
}

function render() {
  if (serverCatalog) return fetchCatalog();
  found = jobs.filter(matches).sort((a,b) =>
    (state.sort === "salary" ? salaryFirst(a, b) : 0) ||
    (state.sort === "match" ? (matchById[b.id]?.percent ?? 0) - (matchById[a.id]?.percent ?? 0) : 0) ||
    recentFirst(a, b));
  totalFound = found.length;
  paintCatalog();
}
function paintCatalog() {
  const focused = document.activeElement;
  const priorBookmark = $("list").contains(focused) && focused.dataset.bookmark;
  $("catalog-title").textContent = state.onlySaved ? "Избранное" : page === "internships" ? "Стажировки" : "Вакансии";
  $("result-count").textContent = vacancyCount(totalFound);
  $("list").innerHTML = found.length ? found.slice(0, state.limit).map(card).join("") :
    '<div class="empty"><h3>' + (state.onlySaved && !bookmarks.size ? "Здесь будут сохранённые вакансии" : "Ничего не нашли") +
    '</h3><p>' + (state.onlySaved && !bookmarks.size ? "Нажми на закладку в карточке, чтобы вернуться к ней позже." : "Попробуй изменить запрос или убрать часть фильтров.") +
    '</p><a class="primary" href="' + escape(pageUrl("jobs")) + '">Показать все вакансии</a></div>';
  $("more").hidden = serverCatalog ? !catalogCursor : found.length <= state.limit;
  $("sort").value = state.sort;
  if (state.onlySaved) $("saved").setAttribute("aria-current", "page");
  $("categories").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.category === state.cat));
  $("filters").querySelectorAll("input").forEach((b) => b.checked = state.filters[b.dataset.group].has(b.value));
  if (priorBookmark) {
    const replacement = $("list").querySelector('[data-bookmark="' + CSS.escape(priorBookmark) + '"]');
    (replacement || $("saved")).focus({preventScroll:true});
  }
}
function change() {
  state.limit = pageSize;
  syncCatalogUrl();
  render();
}
function reset(defaults = {}) {
  Object.assign(state, catalogDefaults(), defaults);
  syncFilterControls();
  change();
}
function loadMore() {
  if (serverCatalog) return fetchCatalog(true);
  if (found.length <= state.limit) return;
  const start = state.limit;
  state.limit += pageSize;
  $("list").insertAdjacentHTML("beforeend", found.slice(start, state.limit).map(card).join(""));
  $("more").hidden = found.length <= state.limit;
  $("list").querySelectorAll("[data-open]")[start]?.focus({preventScroll: true});
}
function section(title, body) {
  if (!body?.length) return "";
  const content = Array.isArray(body) ? "<ul>" + body.map(item => "<li>" + escape(item) + "</li>").join("") + "</ul>" :
    "<p>" + escape(body) + "</p>";
  return '<section class="detail-section"><h2>' + escape(title) + '</h2>' + content + '</section>';
}
function jobLinkContent(job) {
  return '<strong>' + escape(job.title) + '</strong><span>' + escape(job.company) +
    (job.city ? ' · ' + escape(job.city) : "") + '</span>' +
    (job.salaryMin != null ? '<small>' + escape(job.salary) + '</small>' : "");
}
function jobLink(job) {
  return '<li><a href="' + escape(jobUrl(job)) + '">' + jobLinkContent(job) + '</a></li>';
}
function jobApplyLink(job) {
  return '<a class="primary" href="' + escape(job.url) + '" target="_blank" rel="noopener noreferrer">Откликнуться ↗</a>';
}
function jobFeedCard(job) {
  return '<li class="job-feed-card"><a class="job-feed-details" href="' + escape(jobUrl(job)) + '">' +
    jobLinkContent(job) + '<p>' + escape(job.tasks) + '</p></a><div class="job-feed-actions">' +
    jobApplyLink(job) + '<div data-feed-match="' + escape(job.id) + '">' + jobFeedMatch(job.id) + '</div></div></li>';
}
function jobFeedMatch(jobId) {
  const match = matchById[jobId];
  if (signedInForMatches && match) return matchBadge(match);
  const url = signedInForMatches ? pageUrl("resume") : pageUrl("register", {from: "resume"});
  return '<a class="outline-button" href="' + escape(url) + '">' +
    (signedInForMatches ? "Добавить резюме для совпадений" : "Узнать степень совпадения") + '</a>';
}
function similarJobs(job) {
  const tags = new Set(job.tags.map(normalize));
  return jobs.filter(candidate => candidate.id !== job.id && isOpen(candidate))
    .map(candidate => {
      const sameDirection = directionOf(candidate) === directionOf(job);
      const sharedTags = candidate.tags.filter(tag => tags.has(normalize(tag))).length;
      const sameCategory = candidate.category === job.category && job.category !== "Digital";
      if (!sameDirection && !sameCategory && sharedTags < 2) return {candidate, score: 0};
      const sameCity = jobCities(candidate).some(city => jobCities(job).includes(city));
      const sameFormat = candidate.formats.some(format => job.formats.includes(format));
      const sameLevel = candidate.level && candidate.level === job.level;
      const sameType = isInternship(candidate) === isInternship(job);
      return {candidate, score: 5 * sameDirection + 2 * sameCategory + 3 * sharedTags + 4 * sameType +
        2 * Boolean(sameLevel) + sameCity + sameFormat};
    })
    .filter(item => item.score)
    .sort((a, b) => b.score - a.score || recentFirst(a.candidate, b.candidate))
    .slice(0, 3).map(item => item.candidate);
}

const neighboringTopics = {
  "Продукт": ["Дизайн", "Аналитика", "IT-разработка", "Маркетинг"],
  "Дизайн": ["Продукт", "Digital"],
  "Аналитика": ["Продукт", "IT-разработка"],
  "IT-разработка": ["Аналитика", "Продукт"],
  "Digital": ["Маркетинг", "Дизайн"],
  "Маркетинг": ["Digital", "Продукт"]
};

function startJobFeed(job, related) {
  const nearby = neighboringTopics[directionOf(job)] || neighboringTopics[job.category] || [];
  const tags = new Set(job.tags.map(normalize));
  const ranked = jobs.filter(candidate => candidate.id !== job.id && isOpen(candidate))
    .map(candidate => {
      const direction = directionOf(candidate);
      const sharedTags = candidate.tags.filter(tag => tags.has(normalize(tag))).length;
      const sameTopic = direction === directionOf(job) ||
        (job.category !== "Digital" && candidate.category === job.category);
      const neighboringTopic = nearby.includes(direction);
      const relevance = sameTopic ? 4 : neighboringTopic || sharedTags ? 1 : 0;
      return {candidate, relevance, sharedTags};
    })
    .filter(entry => entry.relevance)
    .sort((a, b) => b.relevance - a.relevance || b.sharedTags - a.sharedTags || recentFirst(a.candidate, b.candidate))
    .map(entry => entry.candidate);
  const feed = [...new Set([...related, ...ranked])];
  if (!serverCatalog && !feed.length) return;

  $("detail").insertAdjacentHTML("beforeend", '<section class="job-feed" aria-labelledby="job-feed-title">' +
    '<h2 id="job-feed-title">Ещё вакансии по теме</h2><ul class="job-feed-list" id="job-feed-list"></ul>' +
    '<button class="show-more" id="job-feed-more" type="button">Показать ещё</button></section>');
  const list = $("job-feed-list");
  const more = $("job-feed-more");
  let shown = 0;
  let observer;
  let cursor = null;
  let loading = false;
  const shownIds = new Set();
  async function appendBatch(moveFocus = false) {
    if (loading || more.hidden) return;
    let batch;
    if (serverCatalog) {
      loading = true;
      more.disabled = true;
      const filters = new URLSearchParams({limit: 4});
      if (cursor) filters.set("cursor", cursor);
      try {
        const data = await requestVacancies("api/jobs/" + encodeURIComponent(job.id) + "/related", filters);
        batch = data.jobs.filter(job => !shownIds.has(job.id));
        cursor = data.nextCursor;
        Object.assign(matchById, data.matches);
        list.parentElement.querySelector(".empty")?.remove();
      } catch (error) {
        observer?.unobserve(more);
        more.hidden = true;
        list.parentElement.querySelector(".empty")?.remove();
        list.after(catalogError(() => {
          if (error.status === 400) {
            location.reload();
            return;
          }
          more.hidden = false;
          appendBatch(true);
        }));
        return;
      } finally {
        loading = false;
        more.disabled = false;
      }
    } else {
      batch = feed.slice(shown, shown + 4);
    }
    for (const job of batch) shownIds.add(job.id);
    list.insertAdjacentHTML("beforeend", batch.map(jobFeedCard).join(""));
    if (moveFocus) list.children[shown]?.querySelector("a").focus();
    shown += batch.length;
    more.hidden = serverCatalog ? !cursor : shown >= feed.length;
    if (serverCatalog && !shown) list.parentElement.hidden = true;
    if (observer) {
      observer.unobserve(more);
      if (!more.hidden) observer.observe(more);
    }
  }
  more.addEventListener("click", () => appendBatch(true));
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !more.hidden && document.activeElement !== more) appendBatch();
    }, {rootMargin: "160px 0px"});
  }
  appendBatch();
}

function showDailyJobs() {
  const cutoff = new Date(cleanDate(window.RYBKA.checked).getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const picks = window.RYBKA.daily || jobs.filter(job => isOpen(job) && job.date && job.date >= cutoff)
    .sort((a, b) => salaryFirst(a, b) || recentFirst(a, b)).slice(0, 3);
  if (!picks.length) return;
  $("daily-jobs").hidden = false;
  $("daily-caption").textContent = "Свежие позиции из подборки на " + date(window.RYBKA.checked) + ".";
  $("daily-list").innerHTML = picks.map(jobLink).join("");
}
function openJob(job) {
  if (!job) {
    setPageTitle("Вакансия не найдена");
    $("detail").innerHTML = "<h1>Вакансия не найдена</h1>";
    return;
  }
  setPageTitle(job.title);
  const related = window.RYBKA.related || similarJobs(job);
  const original = '<a class="original-link" href="' + escape(job.url) + '" target="_blank" rel="noopener noreferrer">';
  const apply = isOpen(job) ? jobApplyLink(job) : "";
  $("detail").classList.add("job-detail");
  $("detail").innerHTML = '<article class="job-description"><p class="detail-kicker">' + escape(directionOf(job)) +
    (job.date ? ' · ' + escape(date(job.date)) : "") + '</p><h1 id="detail-title">' +
    escape(job.title) + '</h1><p class="company">' + escape(job.company) + '</p><p class="detail-pay">' + escape(job.salary) + '</p>' + chips(job) +
    (isOpen(job) ? matchDetails(job) : '<p class="job-closed">Вакансия закрыта</p>') +
    section("Чем предстоит заниматься", job.details?.tasks ?? job.tasks) +
    section("Что важно", job.details?.who ?? job.who) +
    section("Будет плюсом", job.details?.plus ?? job.plus) +
    section("Условия", job.details?.offer ?? job.offer) +
    '<div class="detail-actions">' + apply + bookmarkButton(job) + '</div>' +
    original + 'Оригинал вакансии · ' + escape(job.source) + ' ↗</a></article>' +
    (related.length ? '<aside class="similar-jobs" aria-labelledby="similar-title"><h2 id="similar-title">Похожие вакансии</h2><ul class="job-links">' +
      related.map(jobLink).join("") + '</ul></aside>' : "");
  startJobFeed(job, related);
}
function about() {
  $("detail").innerHTML = '<p class="detail-kicker">RYBKA / ПИЛОТ</p><h1 id="detail-title">О проекте</h1>' +
    section("Что здесь", "Каталог вакансий в маркетинге, digital и продукте. В карточках — краткие условия, источник и ссылка на исходное объявление.") +
    section("Откуда вакансии", (window.RYBKA.sources || [...new Set(jobs.map(j => j.source))]).join(", ") +
      ". Этот снимок подборки проверен " + date(window.RYBKA.checked) + ".") +
    section("Как сохранить вакансию", "Войдите или зарегистрируйтесь, чтобы сохранять вакансии в личное избранное.");
}
$("search").addEventListener("submit", (e) => { e.preventDefault(); state.query = $("query").value.trim(); change(); $("catalog").scrollIntoView(); });
$("query").addEventListener("input", () => { state.query = $("query").value.trim(); change(); });
document.querySelector(".routes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-route]"); if (!b) return;
  reset({cat: b.dataset.route}); $("catalog").scrollIntoView();
});
document.querySelector(".quick").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const filters = emptyFilters();
  if (!b.dataset.q) filters.format.add("Удалённо");
  reset({query: b.dataset.q || "", filters}); $("catalog").scrollIntoView();
});
$("categories").addEventListener("click", (e) => { if (e.target.dataset.category) { state.cat = e.target.dataset.category; change(); } });
$("filters").addEventListener("change", (e) => {
  const f = state.filters[e.target.dataset.group]; if (!f) return;
  if (e.target.checked) f.add(e.target.value); else f.delete(e.target.value); change();
});
$("company-query").addEventListener("input", () => { state.company = $("company-query").value.trim(); change(); });
for (const [key] of selectFilters) $(key).addEventListener("change", () => { state[key] = $(key).value; change(); });
$("sort").addEventListener("change", () => { state.sort = $("sort").value; change(); });
$("reset").addEventListener("click", () => reset());
$("more").addEventListener("click", loadMore);
const futureFooter = {
  company: ["О компании", "Раздел о команде RYBKA находится в разработке."],
  blog: ["Блог", "Здесь будут материалы о поиске работы, резюме и рынке digital."],
  ads: ["Реклама на сайте", "Здесь появятся форматы размещения и условия для рекламодателей."],
  calendar: ["Производственный календарь", "Здесь появится календарь рабочих, выходных и праздничных дней."],
};

function showFooterSection(key) {
  if (key === "directory") {
    setPageTitle("Каталог компаний");
    const counts = window.RYBKA.companies || jobs.reduce((result, job) => {
      result[job.company] = (result[job.company] || 0) + 1;
      return result;
    }, Object.create(null));
    const companies = Object.keys(counts).sort((a, b) => a.localeCompare(b, "ru"));
    $("detail").innerHTML = '<h1>Каталог компаний</h1><p>Выберите компанию, чтобы увидеть её вакансии.</p>' +
      '<div class="company-directory">' + companies.map(company => {
        const total = counts[company];
        return '<a href="' + escape(pageUrl("jobs", {company})) + '">' + escape(company) +
          '<small>' + vacancyCount(total) + ' ↗</small></a>';
      }).join("") + '</div>';
    return;
  }
  if (key === "audit") {
    setPageTitle("Экспертная рекомендация");
    $("detail").innerHTML = `
      <section class="audit-hero">
        <h1>Экспертная рекомендация</h1>
        <p>Подготовьте резюме к откликам. Разбор помогает понять, что уточнить и какие результаты показать работодателю.</p>
        <a class="primary" href="?page=register&amp;from=audit">Улучшить резюме ↗</a>
      </section>
      <section class="audit-section">
        <h2>Когда полезен разбор</h2>
        <div class="audit-grid">
          <article><h3>Мало приглашений</h3><p>Проверьте, понятно ли из резюме, чем вы занимались и каких результатов добились.</p></article>
          <article><h3>Меняете направление</h3><p>Выделите опыт и навыки, которые пригодятся в новой роли.</p></article>
          <article><h3>Начинаете карьеру</h3><p>Соберите проекты, стажировки и учебные задачи, которые показывают ваш уровень.</p></article>
        </div>
      </section>
      <section class="audit-section">
        <h2>Как это работает</h2>
        <ol><li>Зарегистрируйтесь на RYBKA.</li><li>Добавьте резюме и укажите желаемую должность.</li><li>Используйте рекомендации, чтобы точнее описать опыт и результаты.</li></ol>
        <a class="primary" href="?page=register&amp;from=audit">Начать с регистрации ↗</a>
      </section>`;
    return;
  }
  const [title, description] = Object.hasOwn(futureFooter, key) ? futureFooter[key] :
    ["Страница не найдена", "Вернитесь к каталогу вакансий."];
  setPageTitle(title);
  $("detail").innerHTML = '<h1>' + escape(title) + '</h1><p>' + escape(description) + '</p>';
}

if (page === "job") {
  openJob(jobById.get(currentJobId));
  setupDetailBack();
}
else if (page === "about") { setPageTitle("О проекте"); about(); }
else if (!catalogPages.has(page) && !accountPages.has(page)) showFooterSection(page);
else if (page === "jobs") setPageTitle("Вакансии");
else if (page === "favorites") setPageTitle("Избранное");
else if (page === "internships") setPageTitle("Стажировки");

if (catalogPages.has(page)) {
  restoreFilters();
  if (publicCatalogs.has(page)) syncCatalogUrl();
  syncFilterControls();
  const position = restoreCatalogPosition();
  const initial = render();
  if (page === "home") showDailyJobs();
  if (position) {
    history.scrollRestoration = "manual";
    Promise.resolve(initial).then(() =>
      requestAnimationFrame(() => window.scrollTo({top: position.y, behavior: "instant"})));
  }
  window.addEventListener("pagehide", saveCatalogPosition);
  $("catalog").addEventListener("click", (event) => {
    if (event.target.closest("[data-open], .job-links a")) saveCatalogPosition();
  });
}
