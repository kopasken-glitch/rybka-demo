"use strict";
const accountDialog = $("account-dialog");
const accountView = $("account-view");
let account = {user: null, resume: null, matches: {}, roles: {}};
let contacts = {};
let createAfterLogin = false;

async function accountRequest(path, body) {
  let response;
  let data;
  try {
    response = await fetch("/api/" + path, body === undefined ? {
      credentials: "same-origin", cache: "no-store"
    } : {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)
    });
    data = await response.json();
  } catch {
    throw new Error("Кабинет недоступен. Проверьте, запущен ли сервер RYBKA.");
  }
  if (!response.ok) throw new Error(data.error || "Попробуйте ещё раз.");
  return data;
}

function setAccount(data) {
  account = data;
  $("account-login").textContent = account.user ? "Кабинет" : "Войти";
  $("account-create").textContent = account.resume ? "Моё резюме" : "Создать резюме";
  updateMatches(account.matches || {});
}

function panel(title, description, content, step = "") {
  accountDialog.classList.remove("wide-resume");
  accountView.innerHTML =
    (step ? '<p class="account-step">' + escape(step) + '</p>' : '') +
    '<h2 id="account-title" tabindex="-1">' + escape(title) + '</h2>' +
    (description ? '<p class="account-intro">' + escape(description) + '</p>' : '') +
    content + '<p id="account-status" class="account-status" role="status" hidden></p>';
  if (!accountDialog.open) accountDialog.showModal();
  accountDialog.scrollTop = 0;
  $("account-title").focus({preventScroll: true});
}

function setStatus(message, error = false) {
  const status = $("account-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", error);
  status.hidden = !message;
}

function form(type, fields, action) {
  return '<form class="account-form" data-form="' + type + '">' + fields +
    '<button type="submit" class="primary">' + action + '</button></form>';
}

function input(label, name, type, attrs = "", value = "") {
  return '<label>' + label + '<input required name="' + name + '" type="' + type + '" ' +
    attrs + ' value="' + escape(value) + '"></label>';
}

const actionButton = (id, label) => '<button class="text-button" type="button" data-action="' + id + '">' + label + '</button>';

function login(identifier = "") {
  panel("Войти", "Введите телефон или почту и пароль от личного кабинета.",
    form("login",
      input("Телефон или почта", "identifier", "text", 'autocomplete="username" maxlength="254" placeholder="+7 999 000-00-00 или name@mail.ru"', identifier) +
      input("Пароль", "password", "password", 'autocomplete="current-password" maxlength="128"'),
      "Войти") + '<div class="account-links"><span>Первый раз на RYBKA?</span>' + actionButton("create", "Создать резюме") + '</div>');
}

function contactStep() {
  panel("Создать резюме", "Телефон и почта пригодятся для входа в личный кабинет.",
    form("contacts",
      input("Номер телефона", "phone", "tel", 'autocomplete="tel" maxlength="40" placeholder="+7 999 000-00-00"', contacts.phone) +
      input("Электронная почта", "email", "email", 'autocomplete="email" maxlength="254" placeholder="name@mail.ru"', contacts.email),
      "Продолжить") + '<div class="account-links"><span>Уже есть аккаунт?</span>' + actionButton("login", "Войти") + '</div>',
    "Шаг 1 из 3 · Контакты");
}

function passwordStep() {
  panel("Придумайте пароль", "С ним можно войти по телефону или почте.",
    form("register", input("Пароль", "password", "password", 'autocomplete="new-password" minlength="8" maxlength="128" aria-describedby="password-tip"') +
      '<small id="password-tip">Минимум 8 символов.</small>', "Создать кабинет") +
    '<div class="account-links">' + actionButton("contacts", "Изменить контакты") + actionButton("login", "Войти") + '</div>',
    "Шаг 2 из 3 · Пароль");
}

function resumeDocument(resume) {
  const skills = (resume.skills || "").trim();
  const experience = (resume.experience || "").trim();
  const role = account.roles[resume.role];
  return '<article class="resume-document"><header><h3>' + escape(resume.name || resume.title || "Желаемая должность") + '</h3>' +
    (resume.name && resume.title ? '<p>' + escape(resume.title) + '</p>' : '') +
    (role ? '<p>' + escape(role) + '</p>' : '') + '</header>' +
    '<p class="resume-contact">' + escape([account.user.phone, account.user.email].join(" · ")) + '</p>' +
    (experience ? '<section><h4>Опыт</h4><p>' + escape(experience) + '</p></section>' : "") +
    (skills ? '<section><h4>Навыки</h4><p>' + escape(skills) + '</p></section>' : "") + '</article>';
}

function previewResume() {
  const editor = accountView.querySelector('[data-form="resume"]');
  const preview = $("resume-live");
  if (editor && preview) {
    preview.innerHTML = resumeDocument(Object.fromEntries(new FormData(editor)));
  }
}

function setResumeStep(editor, step) {
  editor.dataset.step = step;
  for (const field of editor.querySelectorAll("[data-resume-step]")) {
    const active = Number(field.dataset.resumeStep) === step;
    field.hidden = !active;
    for (const input of field.querySelectorAll("[data-required]")) input.required = active;
  }
  $("resume-progress").textContent = "Шаг " + (step + 1) + " из 3";
  $("resume-back").hidden = step === 0;
  $("resume-next").textContent = step === 2 ? "Сохранить резюме" : "Продолжить";
  setStatus("");
  previewResume();
}

function resumeEditor() {
  const saved = account.resume || {};
  const options = Object.entries(account.roles).map(([key, label]) =>
    '<option value="' + escape(key) + '"' + (key === saved.role ? " selected" : "") + '>' + escape(label) + '</option>').join("");
  panel("Конструктор резюме", "Заполните три коротких раздела или начните с готового файла.",
    '<div class="resume-builder"><form class="account-form" data-form="resume" data-step="0">' +
      '<p id="resume-progress" class="account-step" aria-live="polite"></p>' +
      '<fieldset class="resume-fields" data-resume-step="0"><legend>Профессия</legend>' +
        '<div class="resume-upload"><label for="resume-file">Импортировать резюме <span>↗</span></label>' +
        '<input id="resume-file" type="file" accept=".pdf,.docx,.txt"><small>PDF, DOCX или TXT, до 5 МБ.</small></div>' +
        '<label>Имя и фамилия<input name="name" autocomplete="name" maxlength="100" value="' + escape(saved.name) + '"></label>' +
        input("Желаемая должность", "title", "text", 'data-required maxlength="100" placeholder="Например, продуктовый дизайнер"', saved.title) +
        '<label>Профессиональное направление<select name="role" required data-required><option value="">Выберите направление</option>' + options + '</select></label></fieldset>' +
      '<fieldset class="resume-fields" data-resume-step="1" hidden><legend>Опыт работы</legend>' +
        '<label>Опыт или текст резюме <textarea name="experience" maxlength="14000" rows="6" placeholder="Укажите компанию, роль и 1–2 результата">' +
        escape(saved.experience) + '</textarea></label><small>Можно пропустить этот шаг и указать навыки.</small></fieldset>' +
      '<fieldset class="resume-fields" data-resume-step="2" hidden><legend>Навыки</legend>' +
        '<label>Навыки<input name="skills" maxlength="1000" value="' + escape(saved.skills) + '" placeholder="Figma, UX/UI, дизайн-системы"></label>' +
        '<small>Перечислите навыки через запятую, чтобы точнее сравнить резюме с вакансиями.</small></fieldset>' +
      '<div class="builder-actions"><button type="button" class="outline-button" id="resume-back" data-action="resume-back" hidden>Назад</button>' +
      '<button type="submit" class="primary" id="resume-next">Продолжить</button></div>' +
      '</form><div class="resume-preview"><p class="account-step">Предпросмотр</p><div id="resume-live"></div></div></div>');
  accountDialog.classList.add("wide-resume");
  setResumeStep(accountView.querySelector('[data-form="resume"]'), 0);
}

function readyResume() {
  if (!account.resume) {
    beginResume();
    return;
  }
  panel("Готовое резюме", "", resumeDocument(account.resume) +
    '<div class="profile-actions resume-ready-actions"><button class="primary" type="button" data-action="pdf">Скачать PDF</button>' +
    '<button class="outline-button" type="button" data-action="resume">Редактировать</button>' +
    '<button class="outline-button" type="button" data-action="matches">Смотреть совпадения ↗</button></div>');
}

async function downloadResume(button) {
  button.disabled = true;
  setStatus("Готовим PDF…");
  try {
    const response = await fetch("/api/resume.pdf", {credentials: "same-origin", cache: "no-store"});
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error);
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "RYBKA-resume.pdf";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Не удалось скачать PDF. Попробуйте ещё раз.", true);
  } finally {
    button.disabled = false;
  }
}

function profile() {
  panel("Личный кабинет", "", '<dl class="profile-contacts"><div><dt>Телефон</dt><dd>' + escape(account.user.phone) +
    '</dd></div><div><dt>Почта</dt><dd>' + escape(account.user.email) + '</dd></div></dl>' +
    '<section class="profile-resume"><h3>' + escape(account.resume?.title || "Моё резюме") + '</h3><p>' +
    escape(account.resume ? account.roles[account.resume.role] : "Добавьте резюме, чтобы увидеть совпадения с вакансиями.") + '</p>' +
    '<div class="profile-actions"><button class="primary" type="button" data-action="resume">' +
    (account.resume ? "Редактировать резюме" : "Добавить резюме") + '</button>' +
    (account.resume ? '<button class="outline-button" type="button" data-action="matches">Мои совпадения ↗</button>' : "") +
    '</div></section><div class="account-links">' + actionButton("logout", "Выйти из аккаунта") + '</div>');
}

function beginResume() {
  if (account.user) resumeEditor();
  else {
    contacts = {};
    createAfterLogin = true;
    contactStep();
  }
}

$("account-create").addEventListener("click", beginResume);
$("promo-create").addEventListener("click", beginResume);
$("footer-builder").addEventListener("click", beginResume);
$("footer-resume").addEventListener("click", readyResume);
$("account-login").addEventListener("click", () => {
  createAfterLogin = false;
  if (account.user) profile();
  else login();
});
$("close-account").addEventListener("click", () => accountDialog.close());
accountDialog.addEventListener("click", (event) => {
  if (event.target !== accountDialog) return;
  const bounds = accountDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) accountDialog.close();
});

accountView.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "login":
      login(contacts.email || "");
      break;
    case "contacts":
      contactStep();
      break;
    case "create":
      beginResume();
      break;
    case "profile":
      profile();
      break;
    case "resume":
      resumeEditor();
      break;
    case "resume-back": {
      const editor = button.closest("form");
      setResumeStep(editor, Number(editor.dataset.step) - 1);
      editor.querySelector("[data-resume-step]:not([hidden]) input, [data-resume-step]:not([hidden]) textarea")?.focus();
      break;
    }
    case "pdf":
      await downloadResume(button);
      break;
    case "matches":
      accountDialog.close();
      showRelevantJobs();
      break;
    case "logout":
      button.disabled = true;
      try {
        setAccount(await accountRequest("logout", {}));
        accountDialog.close();
        $("account-login").focus();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        button.disabled = false;
      }
  }
});

accountView.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const type = form.dataset.form;
  const payload = Object.fromEntries(new FormData(form));
  if (type === "contacts") {
    if (payload.phone.replace(/\D/g, "").length < 10) {
      setStatus("Проверьте номер телефона. Укажите его с кодом страны.", true);
      return;
    }
    contacts = payload;
    passwordStep();
    return;
  }
  if (type === "resume") {
    const step = Number(form.dataset.step);
    if (step < 2) {
      setResumeStep(form, step + 1);
      form.querySelector("[data-resume-step]:not([hidden]) input, [data-resume-step]:not([hidden]) textarea")?.focus();
      return;
    }
    if (!(payload.skills.trim() || payload.experience.trim())) {
      setStatus("Добавьте хотя бы один навык или опишите опыт.", true);
      return;
    }
  }
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  setStatus("Сохраняем…");
  try {
    const result = await accountRequest(type, type === "register" ? {...contacts, ...payload} : payload);
    setAccount(result);
    if (!form.isConnected || !accountDialog.open) return;
    if (type === "register") {
      contacts = {};
      resumeEditor();
    } else if (type === "login") {
      if (createAfterLogin) resumeEditor();
      else profile();
    } else {
      readyResume();
    }
  } catch (error) {
    if (form.isConnected) setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});

accountView.addEventListener("input", previewResume);

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Файл не удалось прочитать."));
    reader.readAsDataURL(file);
  });
}

accountView.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.id !== "resume-file" || !input.files.length) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    setStatus("Выберите файл до 5 МБ.", true);
    input.value = "";
    return;
  }
  const editor = accountView.querySelector('[data-form="resume"]');
  const submit = editor.querySelector("[type=submit]");
  input.disabled = submit.disabled = true;
  setStatus("Читаем файл…");
  try {
    const imported = await accountRequest("resume/import", {name: file.name, file: await readFile(file)});
    if (!editor.isConnected || !accountDialog.open) return;
    for (const [key, value] of Object.entries(imported)) {
      if (value) editor.elements[key].value = value;
    }
    previewResume();
    setStatus("Текст извлечён. Проверьте должность, направление и навыки перед сохранением.");
  } catch (error) {
    if (editor.isConnected) setStatus(error.message, true);
  } finally {
    input.disabled = submit.disabled = false;
    input.value = "";
  }
});

accountRequest("account").then(setAccount).catch(() => {});
