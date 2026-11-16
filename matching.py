"""Deterministic scoring against explicitly mapped vacancy requirements."""
import re

ROLES = {
    "design": ("Дизайн", r"дизайн\w*|designer|ux|ui"),
    "analytics": ("Аналитика", r"аналитик\w*|analyst|data scientist"),
    "marketing": ("Маркетинг", r"маркетол\w*|маркетинг\w*|marketing|perfomance|performance"),
    "product": ("Управление продуктом", r"продакт\w*|product manager|product owner|менеджер продукта|cpo"),
    "development": ("Разработка и AI", r"разработчик\w*|backend|front.?end|developer|engineer|инженер\w*|ai product builder"),
    "accounts": ("Аккаунты и проекты", r"аккаунт\w*|account manager|project manager|менеджер проектов"),
    "other": ("Другое", r"$^"),
}

SKILLS = {
    "Figma": ("figma", "фигма"),
    "UX/UI": ("ux", "ui", "интерфейс*", "прототип*"),
    "UX-исследования": ("ux research", "ux исследован*", "юзабилити", "пользовательские исследования", "custdev"),
    "Дизайн-системы": ("дизайн систем*", "design system*"),
    "E-commerce": ("e commerce", "ecommerce", "маркетплейс*", "интернет магазин*"),
    "Брендинг": ("брендинг*", "фирменный стиль", "айдентик*", "branding"),
    "Графический дизайн": ("графический дизайн", "коммуникационный дизайн", "графический дизайнер", "баннер*", "мерч", "упаковк*"),
    "Adobe Illustrator": ("illustrator", "иллюстратор"),
    "Tilda": ("tilda", "тильда"),
    "SQL": ("sql", "postgresql", "clickhouse"),
    "Python": ("python", "питон", "pandas"),
    "A/B-тесты": ("a b", "аб тест*", "эксперимент*"),
    "Статистика": ("статистик*", "статистическ*", "cuped", "causal inference"),
    "BI": ("bi", "tableau", "datalens", "дашборд*"),
    "Продуктовые метрики": ("продуктовые метрик*", "продуктовых метрик*", "ltv", "retention", "конверси*", "unit экономик*", "юнит экономик*"),
    "Product discovery": ("discovery", "custdev", "интервью", "пользовательские исследования", "исследование клиентов"),
    "Управление продуктом": ("product manager", "product owner", "продакт*", "менеджер продукта", "управление продукт*", "product management"),
    "Приоритизация": ("приоритизац*", "бэклог*", "roadmap", "дорожная карта"),
    "Запуск продукта": ("запуск продукт*", "запуск с нуля", "pmf", "go to market", "gtm", "mvp"),
    "Growth": ("growth", "гроус", "точки роста", "масштабирование"),
    "Performance": ("performance", "перформанс*", "платный трафик", "таргет*", "контекстная реклама"),
    "Яндекс Директ": ("яндекс директ", "директ*", "yandex direct"),
    "Веб-аналитика": ("веб аналитик*", "метрик*", "ga4", "google analytics", "skvoz"),
    "CRM": ("crm", "срм", "битрикс*", "amocrm"),
    "B2B": ("b2b", "б2б"),
    "B2C": ("b2c", "б2с"),
    "SaaS": ("saas", "сервис по подписке", "подписная модель"),
    "Лидогенерация": ("лидогенерац*", "лид*", "cpl", "lead generation"),
    "SEO": ("seo", "сео", "поисковое продвижение"),
    "Позиционирование": ("позиционирован*", "ценностное предложение", "упаковка услуг", "pmm"),
    "EdTech": ("edtech", "онлайн школа", "онлайн обучение", "образовательный продукт"),
    "Лояльность": ("лояльност*", "повторные покупки", "retention", "сегментация базы"),
    "Управление проектами": ("project management", "управление проект*", "координация", "agile", "менеджер проектов"),
    "Работа с клиентами": ("аккаунт*", "account manager", "работа с клиентами", "ведение клиентов"),
    "AI": ("ai", "ии", "llm", "нейросет*", "gpt"),
    "API": ("api", "rest", "интеграц*"),
    "Тестирование": ("qa", "тестирование по", "автотест*", "автоматизация проверок"),
    "Git": ("git", "github", "gitlab"),
}

REQUIREMENTS = {
    "hh-139509390": ("product", "Управление продуктом|Product discovery|Запуск продукта|Продуктовые метрики|Growth|AI"),
    "hh-139282492": ("marketing", "Growth|Performance|Лидогенерация|Веб-аналитика|B2C|Продуктовые метрики"),
    "hh-139483358": ("marketing", "B2B|CRM|SEO|Performance|Лидогенерация|Веб-аналитика"),
    "hh-139438107": ("marketing", "B2B|Product discovery|Позиционирование|Запуск продукта|Лидогенерация"),
    "hh-138723161": ("marketing", "B2B|SaaS|Performance|Яндекс Директ|Веб-аналитика|SEO"),
    "hh-139440496": ("marketing", "Лояльность|CRM|E-commerce|A/B-тесты|Продуктовые метрики"),
    "hh-138700719": ("marketing", "EdTech|Запуск продукта|Product discovery|Growth|Продуктовые метрики"),
    "hh-138984309": ("accounts", "Работа с клиентами|Управление проектами|Яндекс Директ|Веб-аналитика"),
    "hh-139038454": ("marketing", "Growth|Performance|Веб-аналитика|Позиционирование|B2C|AI"),
    "hh-139020375": ("marketing", "B2B|Лидогенерация|SEO|CRM|Performance|Позиционирование"),
    "habr-1000167047": ("product", "Управление продуктом|B2C|A/B-тесты|Приоритизация|Управление проектами"),
    "habr-1000167043": ("analytics", "SQL|Python|BI|Статистика|A/B-тесты|Продуктовые метрики"),
    "habr-1000169947": ("design", "Figma|UX/UI|UX-исследования|Дизайн-системы|E-commerce|Продуктовые метрики"),
    "habr-1000169979": ("design", "Figma|Графический дизайн|Брендинг|Adobe Illustrator|Tilda"),
    "habr-1000169603": ("development", "AI|API|Тестирование|Git|SQL"),
    "habr-1000169584": ("marketing", "B2B|Performance|Яндекс Директ|Веб-аналитика|AI"),
    "habr-1000169645": ("analytics", "SQL|Python|Статистика|A/B-тесты|Продуктовые метрики|BI"),
    "habr-1000168644": ("product", "Управление продуктом|Продуктовые метрики|E-commerce|B2C|SEO"),
    "tbank-pm": ("product", "Управление продуктом|Product discovery|Приоритизация|Продуктовые метрики|Управление проектами"),
}


def normalize(text):
    return " ".join(re.findall(r"[a-zа-я0-9]+", text.lower().replace("ё", "е")))


def alias_pattern(alias):
    suffix = r"\w*" if alias.endswith("*") else ""
    return re.compile(r"(?<!\w)" + re.escape(normalize(alias.rstrip("*"))) + suffix + r"(?!\w)")


SKILL_PATTERNS = {
    name: [alias_pattern(alias) for alias in (name, *aliases)]
    for name, aliases in SKILLS.items()
}
ROLE_PATTERNS = {
    role: re.compile(r"(?<!\w)(?:" + rule + r")(?!\w)") for role, (_, rule) in ROLES.items()
}


def detect_skills(text):
    content = normalize(text)
    return [name for name, patterns in SKILL_PATTERNS.items() if any(p.search(content) for p in patterns)]


def detect_role(text):
    # The first lines usually contain the candidate's chosen title.
    for line in text.splitlines()[:12]:
        content = normalize(line)
        hits = [(m.start(), role) for role, pattern in ROLE_PATTERNS.items() if (m := pattern.search(content))]
        if hits:
            return min(hits)[1]
    return ""


def job_requirements(job):
    if job["id"] in REQUIREMENTS:
        role, skills = REQUIREMENTS[job["id"]]
        return role, skills.split("|")
    category_roles = {"Маркетинг": "marketing", "Продукт": "product", "Дизайн": "design", "Аналитика": "analytics"}
    role = category_roles.get(job["category"]) or detect_role(job["title"]) or "other"
    return role, detect_skills(" ".join([*job["tags"], job["who"]]))


def score(resume, job):
    role, skills = job_requirements(job)
    candidate = set(detect_skills(" ".join([resume["title"], resume["skills"], resume["experience"]])))
    matching = [skill for skill in skills if skill in candidate]
    role_match = resume["role"] == role and role != "other"
    coverage = len(matching) / max(1, len(skills))
    value = round(30 + 70 * coverage) if role_match else round(8 * coverage)
    return {
        "percent": value,
        "roleMatch": role_match,
        "matched": matching,
        "missing": [skill for skill in skills if skill not in candidate],
    }
