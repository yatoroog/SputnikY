# SputnikX

Интерактивная веб-платформа для визуализации спутникового каталога, орбит, пролётов и сближений над выбранной зоной наблюдения.

Проект объединяет:
- 3D-глобус на CesiumJS;
- 2D-карту на 2GIS MapGL;
- backend на Go с расчётом орбит по TLE через SGP4;
- real-time обновление позиций по WebSocket;
- загрузку каталога из N2YO с fallback на локальный TLE;
- пользовательские TLE-загрузки и предустановленные наборы;
- уведомления о сближениях спутников для заданной зоны наблюдения.

## Возможности

- Просмотр спутников на 3D-глобусе и 2D-карте.
- Переключение между `3D` и `2D` режимами без сброса состояния UI.
- Real-time поток позиций через WebSocket.
- Режим симуляции времени: пауза, шаг назад/вперёд, ускорение до `1000x`, возврат в реальное время.
- Отрисовка орбитального трека и зоны покрытия выбранного спутника.
- Режим `close-up` для слежения камерой за выбранным спутником в 3D.
- Поиск и фильтрация каталога по стране, типу орбиты, назначению и строке поиска.
- Автоматическое формирование и сравнение спутниковых группировок по названиям серий.
- Прогноз пролётов выбранного спутника над точкой наблюдения.
- Прогноз ближайших пролётов по точке для всего текущего каталога.
- Прогноз сближений одного спутника или всего каталога с заданной зоной наблюдения.
- Центр уведомлений о сближениях спутников с фиксированной зоной наблюдения.
- Загрузка собственного `.tle`/`.txt` файла.
- Загрузка встроенных TLE-пресетов.
- Отображение реального источника каталога через `catalog_status`.

## Структура проекта

```text
web-platform-mso/
├── backend/
│   ├── cmd/server/              точка входа Fiber backend
│   ├── data/stations.tle        локальный fallback-каталог
│   ├── internal/api/            REST handlers, router, middleware
│   ├── internal/cache/          утилиты кэширования позиций
│   ├── internal/celestrak/      клиент CelesTrak GP + SATCAT enrichment
│   ├── internal/models/         модели API, WS и доменные типы
│   ├── internal/n2yo/           клиент N2YO REST API
│   ├── internal/satellite/      propagation, orbit/pass/approach logic, catalog service
│   ├── internal/tle/            парсер TLE и встроенные пресеты
│   └── internal/ws/             WebSocket hub и клиентские подписки
├── frontend/
│   ├── public/                  GLB-модель, Earth textures, skybox, GeoJSON, Cesium assets
│   ├── scripts/                 copy-cesium и утилиты ассетов
│   ├── src/app/                 страница, layout, глобальные стили
│   ├── src/components/map/      CesiumGlobe, Map2D, orbit/model entities
│   ├── src/components/ui/       sidebar, uploader, passes, comparison, notifications, timeline
│   ├── src/hooks/               catalog, WS, simulated time, notifications
│   ├── src/lib/                 API-клиент, groupings, notifications, helpers
│   ├── src/store/               Zustand stores
│   └── src/types/               frontend-типы
├── shared/api-contract.ts       общий TypeScript-контракт API
└── docker-compose.yml           локальный запуск frontend + backend
```

Примечания:
- `frontend/public/cesium/` подготавливается скриптом `frontend/scripts/copy-cesium.mjs` при `npm run dev` и `npm run build`.
- `backend/internal/celestrak/` используется в runtime для SATCAT enrichment метаданных каталога и при необходимости может также забирать bulk TLE из CelesTrak.
- Основное состояние каталога backend хранит только в памяти процесса, без БД.

## Архитектура

### Источники каталога

Backend загружает и помечает каталог одним из источников:

- `n2yo` — стартовая загрузка и периодический refresh через N2YO API;
- `local_tle` — fallback на `backend/data/stations.tle`;
- `uploaded_tle` — ручная загрузка raw TLE-текста;
- `preset` — загрузка одного из встроенных наборов.

Дополнительно:

- при отсутствии `N2YO_API_KEY` backend сразу стартует на локальном TLE;
- при ошибке чтения локального файла backend пытается использовать встроенный preset `stations`;
- текущее состояние источника возвращается в `catalog_status` вместе с `last_sync_at` и `note`.

### Backend

Основные backend-модули:

- `backend/cmd/server/main.go`
  - старт Fiber-приложения;
  - первичная загрузка каталога;
  - worker обновления позиций каждые `2s`;
  - worker refresh из N2YO каждые `2h`, если задан API key.
- `backend/internal/satellite/service.go`
  - in-memory каталог спутников;
  - фильтрация;
  - обновление текущих позиций;
  - получение позиций для произвольного времени;
  - хранение `catalog_status` и `filter_facets`.
- `backend/internal/satellite/propagator.go`
  - SGP4/SDP4 propagation;
  - вычисление орбитального типа;
  - производные орбитальные параметры;
  - fallback-эвристики для `country` и `purpose`, когда внешних метаданных недостаточно.
- `backend/internal/celestrak/`
  - SATCAT enrichment по `NORAD` / `INTDES`;
  - разрешение `owner_code` / `owner_name` для каталога.
- `backend/internal/satellite/passes.go`
  - прогноз пролётов над точкой наблюдения.
- `backend/internal/satellite/approaches.go`
  - прогноз сближений с зоной наблюдения по радиусу.
- `backend/internal/n2yo/client.go`
  - discovery каталога через N2YO;
  - дедупликация по NORAD ID;
  - загрузка TLE по категориям и точкам наблюдения.
- `backend/internal/tle/`
  - парсинг TLE из строки и файла;
  - встроенные пресеты: `amateur`, `gps`, `starlink`, `stations`, `weather`.
- `backend/internal/api/`
  - REST endpoints;
  - валидация query/body;
  - сериализация ответов.
- `backend/internal/ws/`
  - WebSocket hub;
  - broadcast позиций;
  - поддержка клиентских `subscribe`/`unsubscribe`.

### Frontend

Основные frontend-модули:

- `frontend/src/app/page.tsx`
  - сборка интерфейса;
  - переключение `3D / 2D`;
  - sidebar, карточка спутника, панель пролётов, центр уведомлений, таймлайн, сравнение группировок.
- `frontend/src/components/map/CesiumGlobe.tsx`
  - 3D-глобус на Cesium;
  - day/night текстуры Земли;
  - skybox;
  - спутники, орбита, зона покрытия, режим close-up.
- `frontend/src/components/map/Map2D.tsx`
  - 2D-карта на 2GIS MapGL;
  - маркеры спутников;
  - клик по карте для поиска ближайших пролётов;
  - орбита и зона покрытия выбранного спутника.
- `frontend/src/hooks/useSatellites.ts`
  - загрузка каталога с фильтрами;
  - сохранение `catalog_status` и `filter_facets` в store.
- `frontend/src/hooks/useWebSocket.ts`
  - real-time синхронизация позиций.
- `frontend/src/hooks/useSimulatedPositions.ts`
  - запрос `/api/positions?time=...` при симуляции времени.
- `frontend/src/hooks/useSatelliteNotifications.ts`
  - polling `/api/approaches/area`;
  - создание локальных уведомлений браузера и UI-уведомлений.
- `frontend/src/lib/groupings.ts`
  - автоматическая агрегация спутников в группы по названиям серий.
- `frontend/src/lib/api.ts`
  - typed API-клиент для всех frontend-запросов.

### Поток данных

```text
N2YO / local TLE / uploaded TLE / preset
                │
                v
      backend/internal/n2yo + tle
                │
                v
      SatelliteService (in-memory catalog)
                │
      ┌─────────┼─────────┐
      │         │         │
      v         v         v
  /api/*   2s position   2h N2YO
           refresh       refresh
      │         │
      │         v
      │    /ws/positions
      │
      v
frontend hooks + Zustand stores
      │
      v
Cesium 3D / 2GIS 2D / panels / notifications / comparison
```

## Технологический стек

### Backend

- Go `1.22`
- Fiber `v2`
- `go-satellite` для SGP4/SDP4
- `zerolog`
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

### Служебный маршрут

| Метод | Путь | Описание |
|------|------|----------|
| `GET` | `/health` | health-check backend |

### Каталог и позиции

| Метод | Путь | Описание |
|------|------|----------|
| `GET` | `/api/satellites` | список спутников, `catalog_status`, `filter_facets` |
| `GET` | `/api/satellites/:id` | детали конкретного спутника |
| `GET` | `/api/positions` | позиции спутников на текущее или заданное время |
| `GET` | `/api/satellites/:id/orbit` | орбитальный трек спутника |

Что важно знать:

- `GET /api/satellites` возвращает не только каталог, но и `catalog_status`, `filter_facets`.
- Объекты спутников содержат текущие вычисленные координаты и производные параметры орбиты.
- В деталях спутника backend также возвращает исходный `tle`.

Параметры:

- `GET /api/satellites`
  - `country`
  - `orbit_type`
  - `purpose`
  - `search`
- `GET /api/positions`
  - `time` — `RFC3339`, `RFC3339Nano`, Unix seconds или Unix millis
- `GET /api/satellites/:id/orbit`
  - `duration` — длительность в минутах, по умолчанию `90`, допустимо `1..1440`

### Пролёты

| Метод | Путь | Описание |
|------|------|----------|
| `GET` | `/api/passes` | прогноз пролётов выбранного спутника над точкой |
| `GET` | `/api/passes/area` | ближайшие пролёты для всех спутников над точкой |

Параметры:

- `GET /api/passes`
  - `id`
  - `lat`
  - `lng`
  - `alt` — необязательный, по умолчанию `0`
  - `hours` — по умолчанию `24`, допустимо `1..168`
- `GET /api/passes/area`
  - `lat`
  - `lng`
  - `hours` — по умолчанию `6`, допустимо `1..24`

Особенности:

- `GET /api/passes/area` сортирует события по `aos` и ограничивает ответ `50` ближайшими результатами.

### Сближения

| Метод | Путь | Описание |
|------|------|----------|
| `GET` | `/api/approaches` | сближения выбранного спутника с зоной наблюдения |
| `GET` | `/api/approaches/area` | сближения всего каталога с зоной наблюдения |

Параметры:

- `GET /api/approaches`
  - `id`
  - `lat`
  - `lng`
  - `radius_km` — по умолчанию `100`, допустимо `>0` и `<=5000`
  - `hours` — по умолчанию `4`, допустимо `1..168`
  - `notify_before_min` — по умолчанию `60`, допустимо `0..1440`
- `GET /api/approaches/area`
  - `lat`
  - `lng`
  - `radius_km` — по умолчанию `100`, допустимо `>0` и `<=5000`
  - `hours` — по умолчанию `4`, допустимо `1..168`
  - `notify_before_min` — по умолчанию `60`, допустимо `0..1440`

### Управление TLE

| Метод | Путь | Описание |
|------|------|----------|
| `POST` | `/api/tle/upload` | загрузка raw TLE-текста |
| `GET` | `/api/tle/presets` | список доступных пресетов |
| `POST` | `/api/tle/presets/:name` | загрузка выбранного пресета |

Важно:

- `POST /api/tle/upload` принимает `text/plain`, а не `multipart/form-data`.
- Frontend позволяет выбрать файл, но перед отправкой читает его содержимое и отправляет как raw text.
- Ручная загрузка TLE и загрузка пресета расширяют текущий in-memory каталог backend, а не заменяют его.

### WebSocket

| Протокол | Путь | Описание |
|---------|------|----------|
| `WS` | `/ws/positions` | stream позиций спутников в реальном времени |

Исходящее сообщение сервера:

```json
{
  "type": "positions",
  "data": [
    { "id": "uuid", "lat": 55.7, "lng": 37.6, "alt": 420.1 }
  ]
}
```

Поддерживаемые сообщения клиента:

```json
{ "type": "subscribe", "ids": ["sat-1", "sat-2"] }
```

```json
{ "type": "unsubscribe", "ids": ["sat-1"] }
```

```json
{ "type": "unsubscribe_all", "ids": [] }
```

Текущий frontend использует общий поток позиций для всего каталога, но backend уже поддерживает выборочную подписку.

## Запуск

### Требования

- Docker и Docker Compose plugin, либо
- Go `1.22+`, Node.js `20+`, npm `10+`.

### Docker Compose

Создайте root `.env` из шаблона:

```bash
cp .env.example .env
```

Дальше:

- замените значения-заглушки на реальные, если используете внешние ключи;
- чтобы принудительно работать только на локальном TLE, оставьте `N2YO_API_KEY=` пустым.

Запуск:

```bash
docker compose up --build
```

После запуска:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8080`

Важно:

- для frontend значения `NEXT_PUBLIC_*` используются на этапе build;
- после изменения `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_CESIUM_TOKEN` или `NEXT_PUBLIC_2GIS_MAPGL_KEY` контейнер frontend нужно пересобрать;
- самый простой способ: снова выполнить `docker compose up --build`.

### Локально без Docker

#### 1. Backend

```bash
cd backend
go mod download
go run cmd/server/main.go
```

Если нужны свои env-переменные:

```bash
cd backend
PORT=8080 N2YO_API_KEY=your_n2yo_key TLE_DATA_PATH=data/stations.tle go run cmd/server/main.go
```

#### 2. Frontend

```bash
cd frontend
npm ci
cp .env.local.example .env.local
npm run dev
```

После запуска:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8080`

Примечание:

- `npm run dev` и `npm run build` автоматически копируют runtime-ассеты Cesium в `frontend/public/cesium`.

## Переменные окружения

Для Docker Compose используется root-шаблон [`.env.example`](./.env.example).

Для локального frontend используется [`.env.local.example`](./frontend/.env.local.example).

### Backend

| Переменная | Значение по умолчанию | Описание |
|-----------|------------------------|----------|
| `PORT` | `8080` | порт backend |
| `N2YO_API_KEY` | пусто | ключ N2YO REST API |
| `TLE_DATA_PATH` | `data/stations.tle` | путь к локальному TLE-файлу |

### Frontend

| Переменная | Значение по умолчанию | Описание |
|-----------|------------------------|----------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | base URL backend API |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080` | base URL для WebSocket |
| `NEXT_PUBLIC_CESIUM_TOKEN` | пусто | опциональный Cesium Ion token |
| `NEXT_PUBLIC_2GIS_MAPGL_KEY` | пусто | ключ 2GIS MapGL для 2D-режима |

Примечания:

- все переменные с префиксом `NEXT_PUBLIC_` попадают в клиентский bundle и не являются секретами;
- `NEXT_PUBLIC_CESIUM_TOKEN` можно не задавать, 3D-режим всё равно работает на локальных ассетах;
- без `NEXT_PUBLIC_2GIS_MAPGL_KEY` 2D-режим не инициализируется и показывает понятное сообщение об ошибке;
- `.env`, `.env.local` и `.env.*.local` не должны коммититься и уже игнорируются git.

## Хранение состояния

- Backend не использует БД: каталог, позиции и источник данных живут только в памяти процесса.
- После рестарта backend ручные TLE-загрузки и загруженные пресеты теряются.
- Frontend-уведомления хранятся в браузере через `localStorage`.

## Актуальные нюансы и ограничения

- N2YO ограничен rate limit'ами; при ошибке backend уходит в fallback на локальный TLE или сохраняет текущий каталог без замены.
- Поле `country` теперь заполняется в первую очередь через CelesTrak SATCAT `OWNER` и используется как display-значение `владелец / страна`; если SATCAT не дал метаданные, backend падает обратно на эвристику по имени спутника и TLE. Поле `purpose` по-прежнему определяется эвристически.
- Центр уведомлений сейчас отслеживает фиксированную зону наблюдения: `Ростов-на-Дону`, радиус `100 км`.
- Уведомления о сближениях работают только в режиме реального времени; при симуляции времени polling приостанавливается.
- Сравнение группировок строится автоматически по названиям серий и ограничено `4` выбранными группами одновременно.
- Ручные загрузки TLE и пресетов расширяют текущий каталог, но refresh из N2YO полностью заменяет каталог свежими данными.
- В репозитории пока нет отдельного набора unit/integration tests; основная проверка сейчас это `go test ./...` и production build frontend.

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

### Docker

```bash
docker compose up --build
```
