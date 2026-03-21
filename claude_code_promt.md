# ПРОМПТ ДЛЯ CLAUDE CODE — Веб-платформа мониторинга пролётов спутников

## КОНТЕКСТ
Ты — senior fullstack разработчик. Создай полный рабочий монорепозиторий для веб-платформы мониторинга пролётов спутников. Стек: **Go (backend)** + **Next.js 14 (frontend)**. Референс: https://satellitemap.space/

Платформа показывает спутники на интерактивном 3D/2D глобусе в реальном времени, используя TLE-данные и SGP4-алгоритм для расчёта орбит.

---

## СТРУКТУРА МОНОРЕПО

Создай следующую структуру файлов. **Каждый файл должен содержать полный рабочий код, не заглушки.**

```
satellite-tracker/
├── docker-compose.yml
├── README.md
├── .gitignore
│
├── backend/
│   ├── go.mod
│   ├── go.sum
│   ├── Dockerfile
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   ├── internal/
│   │   ├── api/
│   │   │   ├── router.go
│   │   │   ├── handlers.go
│   │   │   └── middleware.go
│   │   ├── ws/
│   │   │   ├── hub.go
│   │   │   └── client.go
│   │   ├── tle/
│   │   │   ├── parser.go
│   │   │   └── presets.go
│   │   ├── satellite/
│   │   │   ├── service.go
│   │   │   ├── propagator.go
│   │   │   └── passes.go
│   │   ├── cache/
│   │   │   └── positions.go
│   │   └── models/
│   │       └── types.go
│   └── data/
│       └── stations.tle (тестовые TLE-данные, 20-30 спутников: ISS, Hubble, несколько Starlink и т.д.)
│
├── frontend/
│   ├── package.json
│   ├── next.config.js (или .mjs)
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── Dockerfile
│   ├── .env.local.example
│   ├── public/
│   │   └── satellite-icon.svg (простая SVG-иконка спутника)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── map/
│       │   │   ├── CesiumGlobe.tsx
│       │   │   ├── SatelliteEntity.tsx
│       │   │   └── OrbitPath.tsx
│       │   └── ui/
│       │       ├── Sidebar.tsx
│       │       ├── SatelliteCard.tsx
│       │       ├── FilterPanel.tsx
│       │       ├── TimelineControl.tsx
│       │       ├── TleUploader.tsx
│       │       └── SearchBar.tsx
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   ├── useSatellites.ts
│       │   └── useTimeControl.ts
│       ├── store/
│       │   ├── satelliteStore.ts
│       │   ├── filterStore.ts
│       │   └── timeStore.ts
│       ├── lib/
│       │   ├── api.ts
│       │   └── utils.ts
│       └── types/
│           └── index.ts
│
└── shared/
    └── api-contract.ts (TypeScript типы = единый контракт фронт-бэк)
```

---

## BACKEND (Go) — ДЕТАЛЬНЫЕ ТРЕБОВАНИЯ

### go.mod
- Module: `github.com/satellite-tracker/backend`
- Go 1.22+
- Зависимости:
  - `github.com/gofiber/fiber/v2` — HTTP фреймворк
  - `github.com/gofiber/contrib/websocket` — WebSocket для Fiber
  - `github.com/joshuaferrara/go-satellite` — SGP4/SDP4 пропагатор
  - `github.com/rs/zerolog` — логгер
  - `github.com/google/uuid` — UUID генерация

### cmd/server/main.go
- Инициализация Fiber приложения
- Загрузка TLE-данных из `data/stations.tle` при старте
- Запуск фонового воркера (горутина) для пересчёта позиций всех спутников каждые 2 секунды
- Запуск WebSocket хаба
- Graceful shutdown по SIGINT/SIGTERM
- Порт из env `PORT` (дефолт 8080)
- Логирование через zerolog

### internal/models/types.go
```go
// Определи следующие структуры:

type TLEData struct {
    Name  string // Название спутника (строка 0)
    Line1 string // TLE строка 1
    Line2 string // TLE строка 2
}

type Satellite struct {
    ID          string  `json:"id"`          // UUID или NORAD ID
    Name        string  `json:"name"`
    NoradID     int     `json:"noradId"`
    Country     string  `json:"country"`     // Из international designator
    OrbitType   string  `json:"orbitType"`   // LEO/MEO/GEO/HEO (рассчитывается по периоду)
    Purpose     string  `json:"purpose"`     // Если известно
    Latitude    float64 `json:"latitude"`
    Longitude   float64 `json:"longitude"`
    Altitude    float64 `json:"altitude"`    // В километрах
    Velocity    float64 `json:"velocity"`    // км/с
    Period      float64 `json:"period"`      // Минуты
    Inclination float64 `json:"inclination"` // Градусы
    Epoch       string  `json:"epoch"`       // TLE epoch
    TLE         TLEData `json:"-"`           // Исходные TLE данные
}

type SatellitePosition struct {
    ID        string  `json:"id"`
    Latitude  float64 `json:"lat"`
    Longitude float64 `json:"lng"`
    Altitude  float64 `json:"alt"`
}

type OrbitPoint struct {
    Latitude  float64 `json:"lat"`
    Longitude float64 `json:"lng"`
    Altitude  float64 `json:"alt"`
    Timestamp int64   `json:"ts"` // Unix timestamp
}

type Pass struct {
    SatelliteID   string  `json:"satelliteId"`
    SatelliteName string  `json:"satelliteName"`
    AOS           int64   `json:"aos"`          // Acquisition of Signal (unix ts)
    LOS           int64   `json:"los"`          // Loss of Signal (unix ts)
    MaxElevation  float64 `json:"maxElevation"` // Градусы
    Duration      int     `json:"duration"`     // Секунды
}

type WSMessage struct {
    Type string      `json:"type"` // "positions" | "notification"
    Data interface{} `json:"data"`
}

type FilterParams struct {
    Country   string `query:"country"`
    OrbitType string `query:"orbitType"`
    Purpose   string `query:"purpose"`
    Search    string `query:"search"`
}
```

### internal/tle/parser.go
- Функция `ParseTLEFile(filepath string) ([]TLEData, error)` — парсит 3-строчный формат TLE
- Функция `ParseTLEString(content string) ([]TLEData, error)` — парсит TLE из строки
- Валидация: проверка длины строк, проверка чексумм (модуль 10)
- Извлечение NORAD ID из Line1
- Извлечение International Designator (для определения страны)

### internal/tle/presets.go
- Карта предустановленных наборов TLE:
  - `stations` — космические станции (ISS, Tiangong)
  - `starlink` — Starlink
  - `gps` — GPS спутники
  - `weather` — метеоспутники
  - `amateur` — любительские спутники
- Каждый пресет содержит URL для скачивания с CelesTrak (для будущего расширения) и встроенные тестовые данные
- Функция `GetPresetNames() []string`
- Функция `GetPresetTLE(name string) ([]TLEData, error)`

### internal/satellite/propagator.go
- Использование `go-satellite` для SGP4
- Функция `Propagate(tle TLEData, time time.Time) (lat, lng, alt float64, err error)` — рассчитывает позицию спутника на момент time
- Функция `PropagateOrbit(tle TLEData, start time.Time, duration time.Duration, steps int) ([]OrbitPoint, error)` — рассчитывает массив точек орбиты
- Определение типа орбиты по периоду: LEO (<128 min), MEO (128-1440 min), GEO (~1436 min ±30), HEO (>1440 min or высокий эксцентриситет)
- Определение страны по International Designator (справочник первых 2-3 символов: US, RU/CIS, CN, JP, IN, EU/ESA и т.д.)

### internal/satellite/service.go
- Структура `SatelliteService` — основной сервис
- Хранит `map[string]*Satellite` — все загруженные спутники
- Метод `LoadFromTLE(tleData []TLEData) error` — загрузка и инициализация спутников из TLE
- Метод `GetAll(filters FilterParams) []*Satellite` — возврат списка с фильтрацией
- Метод `GetByID(id string) (*Satellite, error)`
- Метод `GetOrbit(id string, duration time.Duration) ([]OrbitPoint, error)` — траектория орбиты
- Метод `UpdatePositions(t time.Time)` — массовое обновление позиций (вызывается воркером)
- Метод `GetPositions() []SatellitePosition` — текущие позиции для WebSocket
- Thread-safe (sync.RWMutex)

### internal/satellite/passes.go
- Функция `CalculatePasses(tle TLEData, observerLat, observerLng, observerAlt float64, start time.Time, hours int) ([]Pass, error)`
- Алгоритм: итерация по времени с шагом 30 секунд, вычисление elevation спутника над горизонтом наблюдателя
- Pass начинается когда elevation > 0 (AOS), заканчивается когда elevation < 0 (LOS)
- Определение максимального elevation за пролёт

### internal/cache/positions.go
- Структура `PositionCache` с `sync.RWMutex`
- Метод `Update(positions []SatellitePosition)` — обновить кэш
- Метод `GetAll() []SatellitePosition` — получить все позиции
- Метод `GetByIDs(ids []string) []SatellitePosition` — позиции конкретных спутников

### internal/ws/hub.go
- Hub-паттерн для WebSocket:
  - `clients map[*Client]bool`
  - `register chan *Client`
  - `unregister chan *Client`
  - `broadcast chan []byte`
- Метод `Run()` — основной цикл (select по каналам)
- Метод `BroadcastPositions(positions []SatellitePosition)` — сериализует и отправляет всем клиентам

### internal/ws/client.go
- Структура `Client` с `*websocket.Conn`
- Метод `WritePump()` — горутина записи сообщений клиенту
- Метод `ReadPump()` — горутина чтения (для подписки на конкретные спутники)
- Поддержка подписки: клиент может отправить `{"type": "subscribe", "ids": ["id1", "id2"]}` для получения позиций только этих спутников

### internal/api/router.go
- Функция `SetupRoutes(app *fiber.App, service *SatelliteService, hub *ws.Hub)`
- Маршруты:
  ```
  GET  /api/satellites          — список с фильтрами
  GET  /api/satellites/:id      — детали спутника
  GET  /api/satellites/:id/orbit — траектория орбиты (query: hours=2)
  GET  /api/passes              — пролёты над точкой (query: lat, lng, hours=24)
  POST /api/tle/upload          — загрузка TLE файла
  GET  /api/tle/presets         — список предустановленных наборов
  POST /api/tle/presets/:name   — загрузить предустановленный набор
  GET  /ws/positions            — WebSocket endpoint
  ```

### internal/api/handlers.go
- Полная реализация каждого хендлера
- JSON-ответы с правильными HTTP-кодами
- Валидация входных данных
- Error handling с информативными сообщениями

### internal/api/middleware.go
- CORS middleware (разрешить localhost:3000 и *)
- Request logging middleware (zerolog)
- Recovery middleware

### data/stations.tle
- Включи реальные TLE-данные для 25-30 спутников (можешь использовать примерные/тестовые):
  - ISS (ZARYA)
  - CSS (TIANHE)
  - Hubble Space Telescope
  - 10 спутников Starlink
  - 5 GPS спутников
  - 3 метеоспутника (NOAA)
  - 3 спутника связи (Iridium)
  - 2 любительских (OSCAR)
- Формат: 3 строки на спутник (Name / Line1 / Line2)

---

## FRONTEND (Next.js) — ДЕТАЛЬНЫЕ ТРЕБОВАНИЯ

### package.json
- Next.js 14
- Зависимости:
  - `cesium` + `resium` — 3D глобус
  - `zustand` — стейт менеджмент
  - `tailwindcss` — стилизация
  - `lucide-react` — иконки
  - `clsx` — утилита классов
  - `date-fns` — форматирование дат

### next.config.mjs
- Конфигурация для CesiumJS:
  - Копирование Cesium Workers, Assets, Widgets в public
  - webpack config для cesium (определение `CESIUM_BASE_URL`)
  - Настройка для корректной работы cesium в Next.js (transpilePackages, etc.)

### .env.local.example
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_CESIUM_TOKEN=your_cesium_ion_token_here
```

### src/types/index.ts
- Полные TypeScript типы, зеркалирующие Go-структуры:
  - `Satellite`, `SatellitePosition`, `OrbitPoint`, `Pass`, `WSMessage`, `FilterParams`
  - `TLEPreset`, `TimeControlState`

### src/lib/api.ts
- Класс или функции для работы с API:
  - `fetchSatellites(filters?: FilterParams): Promise<Satellite[]>`
  - `fetchSatelliteById(id: string): Promise<Satellite>`
  - `fetchOrbit(id: string, hours?: number): Promise<OrbitPoint[]>`
  - `fetchPasses(lat: number, lng: number, hours?: number): Promise<Pass[]>`
  - `uploadTLE(file: File): Promise<Satellite[]>`
  - `fetchPresets(): Promise<string[]>`
  - `loadPreset(name: string): Promise<Satellite[]>`
- Base URL из env
- Error handling

### src/lib/utils.ts
- `formatCoordinate(lat: number, lng: number): string` — "47.3°N, 39.7°E"
- `formatAltitude(km: number): string` — "408.2 km"
- `formatPeriod(minutes: number): string` — "92.5 min"
- `getOrbitTypeColor(type: string): string` — цвет для LEO/MEO/GEO/HEO
- `getOrbitTypeLabel(type: string): string` — русское название
- `formatDateTime(timestamp: number): string` — форматированная дата/время
- `cn(...classes)` — аналог clsx

### src/store/satelliteStore.ts (Zustand)
```typescript
interface SatelliteStore {
  satellites: Satellite[];
  selectedSatellite: Satellite | null;
  positions: Map<string, SatellitePosition>;
  loading: boolean;
  error: string | null;
  
  setSatellites: (satellites: Satellite[]) => void;
  selectSatellite: (satellite: Satellite | null) => void;
  updatePositions: (positions: SatellitePosition[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}
```

### src/store/filterStore.ts (Zustand)
```typescript
interface FilterStore {
  country: string;
  orbitType: string;
  purpose: string;
  search: string;
  
  setCountry: (country: string) => void;
  setOrbitType: (orbitType: string) => void;
  setPurpose: (purpose: string) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
}
```

### src/store/timeStore.ts (Zustand)
```typescript
interface TimeStore {
  currentTime: Date;
  isPlaying: boolean;
  speed: number; // 1, 2, 5, 10, 50, 100
  isRealTime: boolean;
  
  setCurrentTime: (time: Date) => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  stepForward: (seconds: number) => void;
  stepBackward: (seconds: number) => void;
  resetToRealTime: () => void;
}
```

### src/hooks/useWebSocket.ts
- Хук подключения к WebSocket:
  - Auto-reconnect с exponential backoff
  - Парсинг сообщений типа `WSMessage`
  - Обновление `satelliteStore.updatePositions`
  - Подписка на конкретные спутники (отправка subscribe message)
  - Состояния: connecting, connected, disconnected, error

### src/hooks/useSatellites.ts
- Хук загрузки спутников через API
- Использует filterStore для параметров
- Auto-refetch при изменении фильтров
- Обновляет satelliteStore

### src/hooks/useTimeControl.ts
- Хук управления симуляцией времени
- useEffect с setInterval для инкремента времени на основе speed
- Синхронизация с WebSocket (отправка текущего времени серверу)

### src/app/layout.tsx
- Root layout с Tailwind
- Шрифт: Inter или system
- Metadata: title "Satellite Tracker — Мониторинг пролётов спутников"
- Dark тема по умолчанию (тёмный фон для космической тематики)

### src/app/page.tsx
- Основная страница — fullscreen layout:
  - Слева: Sidebar (список спутников, фильтры) — 380px, collapsible
  - Центр: CesiumGlobe на весь экран
  - Снизу: TimelineControl — фиксированная панель
  - Справа: SatelliteCard (если выбран спутник) — выдвижная панель
- Инициализация: загрузка спутников, подключение WebSocket

### src/app/globals.css
- Tailwind directives
- Кастомные стили для Cesium (скрыть дефолтные кредиты, настроить toolbar)
- CSS-переменные для космической темы:
  - `--bg-primary: #0a0e1a` (глубокий космический синий)
  - `--bg-secondary: #111827`
  - `--accent: #3b82f6`
  - `--text-primary: #e5e7eb`
  - Полупрозрачные панели с backdrop-blur

### src/components/map/CesiumGlobe.tsx
- **Это ключевой компонент!**
- Dynamic import с `ssr: false` (Cesium не работает на сервере)
- Инициализация Cesium Viewer через Resium:
  - `<Viewer>` с настройками: timeline=false, animation=false, baseLayerPicker=false
  - Imagery Provider: Cesium Ion или OpenStreetMap (без токена)
  - Terrain: отключен для производительности
- Отображение спутников как `<Entity>` с `<BillboardGraphics>` (иконка спутника)
- Подписка на satelliteStore.positions — обновление позиций Entity
- Обработка клика по спутнику → selectSatellite
- Обработка клика по карте → запрос пролётов
- Переключение 2D/3D через `viewer.scene.mode`
- Должен поддерживать 100+ спутников без лагов

### src/components/map/SatelliteEntity.tsx
- Компонент одного спутника на глобусе (Resium Entity)
- Billboard с иконкой
- Label с названием (появляется при зуме или hover)
- Цвет по типу орбиты (LEO=зелёный, MEO=жёлтый, GEO=красный, HEO=фиолетовый)
- При выделении — подсветка и показ орбиты

### src/components/map/OrbitPath.tsx
- Polyline орбиты выбранного спутника
- Массив позиций из API `/api/satellites/:id/orbit`
- Цвет = цвет типа орбиты, полупрозрачный
- Градиент прозрачности (ярче у текущей позиции, бледнее дальше)

### src/components/ui/Sidebar.tsx
- Левая панель 380px, collapsible (кнопка ◀/▶)
- Шапка: заголовок "Спутники" + счётчик (показано X из Y)
- SearchBar — поиск по названию
- FilterPanel — фильтры
- Скролл-список спутников:
  - Каждый элемент: название, тип орбиты (badge), высота
  - Клик → selectSatellite + центрирование камеры
  - Выбранный — подсветка
- Виртуализация списка для 100+ элементов (или хотя бы ленивая загрузка)
- Тёмная полупрозрачная тема (backdrop-blur, border)

### src/components/ui/SatelliteCard.tsx
- Правая выдвижная панель при выборе спутника
- Содержимое:
  - Название спутника (крупно)
  - Badge типа орбиты (цветной)
  - Таблица параметров:
    - Страна/оператор
    - Тип орбиты
    - Высота орбиты (км)
    - Период обращения (мин)
    - Наклонение (°)
    - Текущие координаты (lat, lng)
    - Текущая скорость (км/с)
  - Секция "Следующий пролёт" (если задана точка наблюдения):
    - Время AOS / LOS
    - Макс. элевация
    - Длительность
  - Кнопка "Показать орбиту" → отрисовка OrbitPath
  - Кнопка "Закрыть" (×)
- Анимация появления (slide-in)

### src/components/ui/FilterPanel.tsx
- Внутри Sidebar
- Фильтры:
  - Тип орбиты: кнопки-чипы "LEO", "MEO", "GEO", "HEO", "Все"
  - Страна: dropdown/select с опциями (US, Russia, China, Japan, India, ESA, Other)
  - Назначение: dropdown (Communications, Navigation, Weather, Science, Military, Amateur, Other)
- Кнопка "Сбросить фильтры"
- При изменении → обновление filterStore → рефетч

### src/components/ui/TimelineControl.tsx
- Фиксированная панель внизу экрана
- Элементы:
  - Текущее время UTC (крупно): "2025-03-20 15:30:00 UTC"
  - Кнопки: ⏪ (назад 1 мин) | ◀◀ (назад 10 сек) | ▶/⏸ (play/pause) | ▶▶ (вперёд 10 сек) | ⏩ (вперёд 1 мин)
  - Selector скорости: 1x, 2x, 5x, 10x, 50x, 100x
  - Кнопка "Real-time" — сброс к текущему времени
  - Slider (range input) для грубой перемотки (±24 часа от текущего времени)
- Тёмная полупрозрачная панель

### src/components/ui/TleUploader.tsx
- Область drag & drop для загрузки TLE файлов
- Или выбор из пресетов (dropdown: "ISS & Stations", "Starlink", "GPS", "Weather", "Amateur")
- Индикатор загрузки
- Сообщение об успехе: "Загружено N спутников"

### src/components/ui/SearchBar.tsx
- Input с иконкой поиска
- Debounced (300ms) поиск
- Обновляет filterStore.search

---

## DOCKER

### docker-compose.yml
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
    volumes:
      - ./backend:/app
    
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8080
      - NEXT_PUBLIC_WS_URL=ws://localhost:8080
    depends_on:
      - backend
```

### backend/Dockerfile
- Multi-stage: build с golang:1.22-alpine, run с alpine:latest
- Копирование бинарника и data/

### frontend/Dockerfile
- Node 20 alpine
- npm install + npm run build + npm start

---

## .gitignore
- node_modules, .next, dist, out
- *.exe, бинарники Go
- .env.local
- .DS_Store

---

## README.md
- Заголовок проекта
- Скриншот-placeholder
- Быстрый старт:
  1. `docker-compose up --build`
  2. Открыть http://localhost:3000
- Альтернативный запуск без Docker:
  - Backend: `cd backend && go run cmd/server/main.go`
  - Frontend: `cd frontend && npm install && npm run dev`
- Описание архитектуры
- API документация (список эндпоинтов)
- Стек технологий

---

## КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ

1. **Всё должно компилироваться и запускаться.** Не пиши `// TODO` — пиши реальный код. `go build` должен проходить. `npm run build` должен проходить.

2. **TLE-данные:** включи реальные TLE-строки (можно слегка устаревшие, это нормально для прототипа). Формат:
```
ISS (ZARYA)
1 25544U 98067A   24080.54791667  .00016717  00000-0  10270-3 0  9002
2 25544  51.6400 208.9163 0002526 120.1194 240.0149 15.49580741441075
```

3. **CesiumJS:** обязательно dynamic import с `ssr: false`. Cesium Workers должны корректно копироваться. Если Cesium Ion токен не задан — использовать OpenStreetMap imagery (без токена).

4. **WebSocket:** полный цикл — сервер отправляет позиции каждые 2 секунды, клиент получает и обновляет карту. Формат: `{"type": "positions", "data": [{"id": "...", "lat": 51.6, "lng": -0.1, "alt": 408}]}`

5. **Производительность:** при 100+ спутниках не должно быть тормозов. На бэкенде — горутина-воркер, не пересчёт на каждый запрос. На фронте — обновление позиций Entity без пересоздания.

6. **UI:** тёмная космическая тема. Полупрозрачные панели с backdrop-blur. Иконки через lucide-react. Responsive sidebar. Всё на русском языке (labels, placeholder, кнопки).

7. **Типизация:** строгие TypeScript типы. Никаких `any`. Типы из `types/index.ts` используются везде.

8. **Go-satellite библиотека:** используй `github.com/joshuaferrara/go-satellite`. Ключевые функции:
```go
import satellite "github.com/joshuaferrara/go-satellite"

// Парсинг TLE
sat := satellite.TLEToSat(line1, line2, satellite.GravityWGS84)

// Пропагация на момент времени
position, velocity := satellite.Propagate(sat, year, month, day, hour, minute, second)

// Конвертация в lat/lng
gmst := satellite.GSTimeFromDate(year, month, day, hour, minute, second)
alt, _, latLng := satellite.ECIToLLA(position, gmst)
latDeg := latLng.Latitude * 180 / math.Pi
lngDeg := latLng.Longitude * 180 / math.Pi
```

9. **Не забудь shared/api-contract.ts** — единый файл с типами, который можно копировать/импортить и на фронте, и использовать как справку для бэка.

---

## НАЧИНАЙ ГЕНЕРАЦИЮ КОДА СЕЙЧАС

Создай все файлы по порядку. Каждый файл — полный, рабочий, с импортами. Начни с backend (go.mod → models → tle → satellite → cache → ws → api → main.go), затем frontend (package.json → types → stores → hooks → components → pages), затем docker и readme.