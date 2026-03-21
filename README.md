# SputnikX

Интерактивная веб-платформа для визуализации спутникового каталога, орбит и пролётов над точкой наблюдения.

Проект сочетает:
- 3D-глобус на CesiumJS
- 2D-карту на 2GIS MapGL
- backend на Go с расчётом орбит по TLE через SGP4
- real-time обновление позиций по WebSocket
- импорт каталога из N2YO с fallback на локальный TLE-файл

## Возможности

- Просмотр спутников на 3D-глобусе и 2D-карте.
- Переключение между `3D` и `2D` режимами без смены состояния приложения.
- Real-time позиции спутников через WebSocket.
- Режим симуляции времени: пауза, перемотка, шаг назад/вперёд, ускорение.
- Отрисовка орбиты, зоны покрытия и выделение выбранного спутника.
- Поиск и фильтрация каталога по стране, типу орбиты, назначению и строке поиска.
- Прогноз пролётов конкретного спутника над точкой.
- Прогноз ближайших пролётов над выбранной областью сразу для всего каталога.
- Загрузка собственного TLE-файла.
- Загрузка предустановленных TLE-наборов.
- Показ реального источника каталога: `n2yo`, `local_tle`, `uploaded_tle`, `preset`.

## Что внутри

```text
web-platform-mso/
├── backend/                  Go API, расчёты орбит, WebSocket, TLE/N2YO
│   ├── cmd/server/           точка входа backend
│   ├── internal/api/         HTTP handlers, router, middleware
│   ├── internal/n2yo/        клиент N2YO REST API
│   ├── internal/satellite/   сервис каталога, SGP4, passes, orbit logic
│   ├── internal/tle/         парсинг TLE и пресеты
│   ├── internal/ws/          WebSocket hub и клиенты
│   └── data/stations.tle     локальный fallback-каталог
├── frontend/                 Next.js приложение
│   ├── src/app/              корневая страница и layout
│   ├── src/components/map/   3D-глобус Cesium и 2D-карта
│   ├── src/components/ui/    sidebar, timeline, passes, upload UI
│   ├── src/hooks/            загрузка каталога, WS, simulated time
│   ├── src/lib/              API-клиент и утилиты
│   ├── src/store/            Zustand stores
│   └── public/               ассеты карты, модели спутника, текстуры Земли
├── shared/                   общий API-контракт в TypeScript
└── docker-compose.yml        локальный запуск frontend + backend
```

## Архитектура

### 1. Источники данных

Backend собирает каталог спутников из одного из четырёх источников:

- `n2yo` — попытка получить TLE через N2YO REST API
- `local_tle` — fallback на `backend/data/stations.tle`
- `uploaded_tle` — каталог, загруженный пользователем
- `preset` — один из встроенных наборов TLE

Текущий источник и время последней синхронизации возвращаются в `catalog_status`.

### 2. Backend слой

Основные модули backend:

- `cmd/server/main.go`
  - инициализация сервиса
  - старт Fiber-приложения
  - запуск background workers
  - первичная загрузка каталога через `N2YO -> fallback local TLE`
- `internal/satellite/service.go`
  - in-memory каталог спутников
  - фильтрация
  - обновление позиций
  - расчёт орбит
  - хранение `catalog_status`
- `internal/satellite/propagator.go`
  - SGP4/SDP4 propagation
  - определение орбитального типа
  - расчёт производных параметров
- `internal/satellite/passes.go`
  - прогноз пролётов над точкой наблюдения
- `internal/n2yo/client.go`
  - discovery спутников через `/above`
  - догрузка TLE через `/tle`
  - дедупликация по NORAD ID
- `internal/api/`
  - REST endpoints
  - валидация query/body
  - сериализация ответов
- `internal/ws/`
  - WebSocket hub
  - вещание позиций всем подключённым клиентам

### 3. Frontend слой

Основные модули frontend:

- `src/app/page.tsx`
  - корневая композиция интерфейса
  - переключение `3D / 2D`
  - sidebar, карточка спутника, панель пролётов, timeline
- `src/components/map/CesiumGlobe.tsx`
  - 3D-глобус на Cesium
  - realistic day/night Earth imagery
  - ночные огни на теневой стороне
  - спутники, орбита, зона покрытия, режим close-up
- `src/components/map/Map2D.tsx`
  - 2D-карта на 2GIS MapGL
  - маркеры спутников
  - орбита и покрытие в плоском режиме
- `src/hooks/useSatellites.ts`
  - загрузка каталога с учётом фильтров
- `src/hooks/useWebSocket.ts`
  - real-time позиции в режиме реального времени
- `src/hooks/useSimulatedPositions.ts`
  - загрузка исторических/симулируемых позиций при управлении временем
- `src/store/*.ts`
  - Zustand stores для каталога, фильтров, времени и темы
- `src/lib/api.ts`
  - единый typed API-клиент для frontend

### 4. Поток данных

```text
N2YO / local TLE / uploaded TLE / preset
                │
                v
     backend/internal/tle + internal/n2yo
                │
                v
     SatelliteService (in-memory catalog)
                │
      ┌─────────┴─────────┐
      │                   │
      v                   v
 REST API            Background workers
 /api/*              update positions каждые 2 сек
      │                   │
      │                   v
      │              WebSocket /ws/positions
      │                   │
      └─────────┬─────────┘
                v
         Frontend hooks + stores
                │
                v
        Cesium 3D / 2GIS 2D / UI panels
```

## Технологический стек

### Backend

- Go `1.22`
- Fiber `v2`
- `go-satellite` для SGP4/SDP4
- `zerolog` для логирования
- Fiber WebSocket

### Frontend

- Next.js `16`
- React `18`
- TypeScript
- CesiumJS `1.125`
- Resium
- 2GIS MapGL
- Zustand
- Tailwind CSS

### Инфраструктура

- Docker
- Docker Compose

## API

### Служебные маршруты

| Метод | Путь | Описание |
|------|------|----------|
| `GET` | `/health` | health-check backend |

### Каталог и позиции

| Метод | Путь | Описание |
|------|------|----------|
| `GET` | `/api/satellites` | список спутников + `catalog_status` |
| `GET` | `/api/satellites/:id` | детали спутника |
| `GET` | `/api/positions` | позиции спутников на текущее или заданное время |
| `GET` | `/api/satellites/:id/orbit` | орбитальный трек спутника |

Параметры `GET /api/satellites`:

- `country`
- `orbit_type`
- `purpose`
- `search`

Параметры `GET /api/positions`:

- `time` — `RFC3339`, `RFC3339Nano`, Unix seconds или Unix millis

Параметры `GET /api/satellites/:id/orbit`:

- `duration` — длительность в минутах, по умолчанию `90`

### Пролёты

| Метод | Путь | Описание |
|------|------|----------|
| `GET` | `/api/passes` | прогноз пролётов выбранного спутника над точкой |
| `GET` | `/api/passes/area` | ближайшие пролёты по области для всего каталога |

Параметры `GET /api/passes`:

- `id`
- `lat`
- `lng`
- `alt` — необязательный, по умолчанию `0`
- `hours` — по умолчанию `24`

Параметры `GET /api/passes/area`:

- `lat`
- `lng`
- `hours` — по умолчанию `6`, максимум `24`

### Управление TLE

| Метод | Путь | Описание |
|------|------|----------|
| `POST` | `/api/tle/upload` | загрузка raw TLE-текста |
| `GET` | `/api/tle/presets` | список доступных пресетов |
| `POST` | `/api/tle/presets/:name` | загрузка пресета в каталог |

Важно:

- `POST /api/tle/upload` принимает `text/plain`, а не `multipart/form-data`.
- После загрузки TLE frontend повторно запрашивает каталог через `/api/satellites`.

### WebSocket

| Протокол | Путь | Описание |
|---------|------|----------|
| `WS` | `/ws/positions` | stream позиций спутников в реальном времени |

Формат сообщения:

```json
{
  "type": "positions",
  "data": [
    { "id": "uuid", "lat": 55.7, "lng": 37.6, "alt": 420.1 }
  ]
}
```

## Запуск

### Docker Compose

Перед запуском создайте root `.env` из шаблона:

```bash
cp .env.example .env
```

```bash
docker-compose up --build
```

После запуска:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8080`

### Локально без Docker

#### 1. Backend

```bash
cd backend
go mod tidy
go run cmd/server/main.go
```

#### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

После запуска:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8080`

## Переменные окружения

Для `docker-compose` используется root-файл [`.env.example`](/Users/axidend/Documents/Hackaton/web-platform-mso/.env.example).

### Backend

| Переменная | По умолчанию | Описание |
|-----------|--------------|----------|
| `PORT` | `8080` | порт backend |
| `N2YO_API_KEY` | пусто | ключ N2YO REST API |
| `TLE_DATA_PATH` | `data/stations.tle` | путь к локальному TLE-файлу |

Пример:

```bash
export PORT=8080
export N2YO_API_KEY=your_n2yo_key
export TLE_DATA_PATH=data/stations.tle
```

### Frontend

Файл-шаблон: [frontend/.env.local.example](/Users/axidend/Documents/Hackaton/web-platform-mso/frontend/.env.local.example)

| Переменная | По умолчанию | Описание |
|-----------|--------------|----------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | base URL backend API |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080` | base URL для WebSocket |
| `NEXT_PUBLIC_CESIUM_TOKEN` | пусто | опциональный Cesium Ion token |
| `NEXT_PUBLIC_2GIS_MAPGL_KEY` | пусто | ключ 2GIS MapGL для 2D-режима |

Пример:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_CESIUM_TOKEN=your_cesium_ion_token_here
NEXT_PUBLIC_2GIS_MAPGL_KEY=your_2gis_mapgl_key_here
```

## Безопасность ключей

- Секретный server-side ключ в проекте только один: `N2YO_API_KEY`.
- Он больше не захардкожен в backend и должен задаваться только через env.
- Если `N2YO_API_KEY` не задан, backend не ходит во внешний API и стартует на локальном `TLE`-каталоге.
- Все переменные с префиксом `NEXT_PUBLIC_` не являются секретами. Они попадают в клиентский bundle и видны в браузере.
- Поэтому `NEXT_PUBLIC_CESIUM_TOKEN` и `NEXT_PUBLIC_2GIS_MAPGL_KEY` нужно хранить в env для удобства конфигурации, но не считать их приватными секретами.
- Файлы `.env`, `.env.local` и `.env.*.local` игнорируются git и не должны коммититься.

## Пользовательские сценарии

### Мониторинг каталога

- Открыть список спутников в sidebar.
- Отфильтровать по типу орбиты, стране, назначению.
- Выбрать спутник и увидеть детали, орбиту и покрытие.

### Симуляция времени

- Поставить timeline на паузу.
- Перематывать время вперёд/назад.
- Ускорять модель до `1000x`.
- Сравнивать расположение спутников в разные моменты времени.

### Анализ пролётов

- Кликнуть по карте/глобусу.
- Получить ближайшие пролёты в выбранной области.
- Перейти к конкретному спутнику и посмотреть его трек.

### Импорт данных

- Загрузить собственный `.tle`/`.txt` файл.
- Или выбрать готовый пресет.
- Сразу увидеть новый каталог на карте.

## Актуальные особенности проекта

- Frontend не ходит напрямую в N2YO. Он работает только с backend API.
- Backend сам решает, откуда заполнить каталог: `N2YO` или `local TLE`.
- В `/api/satellites` возвращается `catalog_status`, чтобы UI понимал реальный источник данных.
- В 3D-режиме используется отдельная day/night Earth imagery:
  - дневная карта Земли
  - ночные огни только на теневой стороне
- Если `NEXT_PUBLIC_2GIS_MAPGL_KEY` не задан, 2D-режим показывает понятное сообщение об ошибке вместо молчаливого падения.

## Ограничения

- N2YO REST API ограничен rate limit'ами. При недоступности, лимите или отсутствии `N2YO_API_KEY` backend уходит в fallback на локальный TLE.
- Каталог `n2yo` не является полным мировым каталогом спутников. Он собирается через discovery по категориям и observation points.
- Поле `country` сейчас определяется эвристически на backend, а не приходит напрямую из N2YO REST API.
- При ручной загрузке TLE и загрузке пресетов каталог расширяется поверх текущего in-memory состояния backend.

## Полезные команды

### Backend

```bash
cd backend
go test ./...
```

### Frontend

```bash
cd frontend
npm run build
```

## Статус

Проект находится в активной разработке.
