// 우송대 학식 웹 페이지. 데이터는 wsu-meal-api (학교 홈페이지 식단을 하루 네 번 JSON으로 저장)
// https://github.com/sangukjeon/wsu-meal-api
// 메뉴 글자는 모두 textContent로만 넣는다 (외부 데이터를 HTML로 해석하지 않기).

const API = 'https://sangukjeon.github.io/wsu-meal-api/api'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const SAVED_CAFETERIA = 'wsu-meal:cafeteria'
const SAVED_THEME = 'wsu-meal:theme'

const $dates = document.getElementById('dates')
const $tabs = document.getElementById('tabs')
const $content = document.getElementById('content')
const $source = document.getElementById('source')
const $theme = document.getElementById('theme')
const $refresh = document.getElementById('refresh')

const days = new Map() // 'YYYY-MM-DD' → { 식당: { 코너: [메뉴] } } 또는 null
let order = [] // cafeterias.json 순서 (학교 홈페이지 순서 그대로)
const today = kstDate()
const state = { date: today, cafeteria: readSaved() }

// ---------- 날짜·시간 ----------

function kstDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
}

function kstHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
}

function dateParts(date) {
  const [y, m, d] = date.split('-').map(Number)
  return { month: m, day: d, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
}

function dateLabel(date) {
  const { month, day, weekday } = dateParts(date)
  return `${month}/${day} (${weekday})`
}

// ---------- 데이터 ----------

async function getJson(path) {
  const res = await fetch(`${API}/${path}`, { cache: 'no-cache' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`meal api ${res.status}`)
  return res.json()
}

async function loadDay(date) {
  if (!days.has(date)) {
    const file = await getJson(`date/${date}.json`)
    days.set(date, file?.data ?? null)
  }
  return days.get(date)
}

// 운영하는 식당만, 학교 홈페이지 순서대로
function cafeteriasOf(day) {
  const open = Object.keys(day ?? {}).filter((name) => day[name] && Object.keys(day[name]).length > 0)
  const rank = (name) => (order.includes(name) ? order.indexOf(name) : order.length)
  return open.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

// 오늘이면 지금 시간에 맞는 끼니 (조식·중식·석식 코너가 있을 때만, 야간에는 미표시)
function nowCorner(corners) {
  if (state.date !== today) return null
  const hour = kstHour()
  if (hour >= 20) return null
  const want = hour < 10 ? '조식' : hour < 14 ? '중식' : '석식'
  return corners.includes(want) ? want : null
}

// 마지막으로 본 식당·테마 기억하기 (안 되는 브라우저면 그냥 넘어간다)
function readSaved(key = SAVED_CAFETERIA) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function save(value, key = SAVED_CAFETERIA) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 저장 못 해도 화면은 그대로 */
  }
}

// ---------- 화면 ----------

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function renderDates(list) {
  $dates.replaceChildren(
    ...list.map((date) => {
      const { day, weekday } = dateParts(date)
      const isToday = date === today
      const btn = el('button', isToday ? 'date date--today' : 'date')
      btn.type = 'button'
      btn.setAttribute('aria-pressed', String(date === state.date))
      btn.setAttribute('aria-label', isToday ? `오늘 ${dateLabel(date)}` : dateLabel(date))
      btn.append(el('span', 'date__week', isToday ? '오늘' : weekday), el('span', 'date__num', String(day)))
      btn.addEventListener('click', () => {
        state.date = date
        renderDates(list)
        show()
      })
      return btn
    }),
  )
}

function renderEmpty(icon, title, body) {
  $tabs.replaceChildren()
  const box = el('div', 'empty')
  box.append(el('p', 'empty__icon', icon), el('p', 'empty__title', title), el('p', 'empty__body', body))
  $content.replaceChildren(box)
}

function renderDay(day) {
  const names = cafeteriasOf(day)
  if (names.length === 0) {
    renderEmpty('🍽️', '이날은 식단 정보가 없어요', '주말·공휴일이거나 아직 식단이 올라오지 않았어요.')
    return
  }
  const picked = names.includes(state.cafeteria) ? state.cafeteria : names[0]

  $tabs.replaceChildren(
    ...names.map((name) => {
      const tab = el('button', 'tab', name)
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(name === picked))
      tab.addEventListener('click', () => {
        state.cafeteria = name
        save(name)
        renderDay(day)
      })
      return tab
    }),
  )

  // 고른 식당 탭이 화면 밖이면 보이게 밀어 준다
  $tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })

  const corners = Object.entries(day?.[picked] ?? {})
  const current = nowCorner(corners.map(([name]) => name))
  const list = el('ul', 'corners')
  for (const [corner, menu] of corners) {
    const items = Array.isArray(menu) ? menu : (menu ? [menu] : [])
    const [main, ...sides] = items
    const item = el('li', corner === current ? 'corner corner--now' : 'corner')
    const head = el('p', 'corner__head')
    head.append(el('span', 'corner__name', corner))
    if (corner === current) head.append(el('span', 'now', '지금'))
    item.append(head, el('p', 'main', main || '등록된 메뉴가 없어요'))
    if (sides.length > 0) {
      const ul = el('ul', 'sides')
      ul.append(...sides.map((s) => el('li', null, s)))
      item.append(ul)
    }
    list.append(item)
  }
  $content.replaceChildren(list)
}

async function show() {
  const date = state.date
  $source.textContent = dateLabel(date)
  $content.replaceChildren(el('div', 'skeleton'))
  try {
    const day = await loadDay(date)
    if (date === state.date) renderDay(day) // 그사이 다른 날짜를 눌렀으면 무시
  } catch {
    if (date === state.date) renderEmpty('📡', '식단을 불러오지 못했어요', '인터넷 연결을 확인하고 잠시 뒤에 다시 열어 주세요.')
  }
}

// ---------- 오른쪽 아래 버튼 ----------

function applyTheme(theme) {
  const dark = theme === 'dark'
  if (dark) document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
  $theme.setAttribute('aria-label', dark ? '밝은 모드로 바꾸기' : '다크 모드로 바꾸기')
  document.querySelector('meta[name="theme-color"]').content = dark ? '#181d26' : '#2b6bf3'
}

$theme.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  save(next, SAVED_THEME)
})

// 새로고침: 페이지 전체를 다시 불러온다
$refresh.addEventListener('click', () => {
  $refresh.classList.add('fab--spin')
  location.reload()
})

// ---------- 시작 ----------

async function start() {
  const [week, cafeterias] = await Promise.all([getJson('week.json').catch(() => null), getJson('cafeterias.json').catch(() => null)])
  order = cafeterias?.data ?? []
  for (const [date, data] of Object.entries(week?.data ?? {})) days.set(date, data)
  const list = Object.keys(week?.data ?? {})
  if (!list.includes(today)) list.push(today)
  renderDates(list.sort())
  await show()
}

applyTheme(readSaved(SAVED_THEME))
renderDates([today]) // 주간 목록이 오기 전에도 오늘 식단부터 보이게
show()
start()
