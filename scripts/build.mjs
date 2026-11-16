import { readFile, writeFile } from "node:fs/promises";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const catalog = JSON.parse(await read("../data/catalog.json"));
const { jobs, checked } = catalog;
const day = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
if (!day(checked) || !Array.isArray(jobs) || !jobs.length) throw Error("Нужны дата проверки и вакансии.");
const categories = new Set(["Маркетинг","Продукт","Дизайн","Аналитика","Digital"]);
const formats = new Set(["Удалённо","Гибрид","Офис"]);
const ids = new Set(), urls = new Set();
for (const j of jobs) {
  for (const key of ["id","title","company","source","salary","tasks","who","url"]) {
    if (typeof j[key] !== "string" || !j[key].trim()) throw Error("Пустое поле " + key + " в " + j.id);
  }
  const url = new URL(j.url);
  if (url.protocol !== "https:" || url.username || url.password) throw Error("Нужна HTTPS-ссылка на вакансию: " + j.id);
  const canonical = url.origin + url.pathname.replace(/\/$/, "");
  if (ids.has(j.id) || urls.has(canonical)) throw Error("Дубликат: " + j.id);
  ids.add(j.id); urls.add(canonical);
  if (!categories.has(j.category) || !Array.isArray(j.formats) || !j.formats.every(f => formats.has(f)) ||
      !Array.isArray(j.tags) || !j.tags.every(t => typeof t === "string") ||
      (j.date != null && (!day(j.date) || j.date > checked)) ||
      (j.salaryMin != null && (!Number.isFinite(j.salaryMin) || j.salaryMin < 0))) throw Error("Неверные данные: " + j.id);
}
await writeFile(new URL("../dist/jobs.js", import.meta.url), "window.RYBKA = " + JSON.stringify(catalog) + ";\n");
console.log(jobs.length + " вакансий · " + new Set(jobs.map(j => j.source)).size + " источника");
