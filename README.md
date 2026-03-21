# SputnikX — Мониторинг пролётов спутников

Веб-платформа для мониторинга спутников в реальном времени на интерактивном 3D-глобусе. Использует TLE-данные и SGP4-алгоритм для расчёта орбит.

## Быстрый старт

### Docker (рекомендуется)

```bash
docker-compose up --build
```

Откройте http://localhost:3000

### Без Docker

**Backend (Go):**
```bash
cd backend
go mod tidy
go run cmd/server/main.go
```

**Frontend (Next.js):**
```bash
cd frontend
npm install
npm run dev
```

Backend: http://localhost:8080
Frontend: http://localhost:3000

## Архитектура

```
SputnikX/
├── backend/          # Go (Fiber) — API + WebSocket + SGP4 propagation
├── frontend/         # Next.js 14 — CesiumJS 3D globe + Zustand state
├── shared/           # TypeScript API contract
└── docker-compose.yml
```

### Backend
- **Go + Fiber** — HTTP API и WebSocket сервер
- **go-satellite** — SGP4/SDP4 пропагация орбит
- Фоновый воркер пересчитывает позиции каждые 2 секунды
- WebSocket транслирует позиции всем клиентам

### Frontend
- **Next.js 14** — React фреймворк
- **CesiumJS + Resium** — 3D глобус с отображением спутников
- **Zustand** — стейт-менеджмент
- **Tailwind CSS** — космическая тёмная тема

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/satellites` | Список спутников (фильтры: country, orbitType, purpose, search) |
| GET | `/api/satellites/:id` | Детали спутника |
| GET | `/api/satellites/:id/orbit` | Траектория орбиты (query: hours) |
| GET | `/api/passes` | Пролёты над точкой (query: lat, lng, hours) |
| POST | `/api/tle/upload` | Загрузка TLE файла |
| GET | `/api/tle/presets` | Список предустановленных наборов |
| POST | `/api/tle/presets/:name` | Загрузка предустановленного набора |
| WS | `/ws/positions` | Позиции спутников в реальном времени |

## Стек технологий

- **Backend:** Go 1.22, Fiber, go-satellite (SGP4), zerolog, WebSocket
- **Frontend:** Next.js 14, TypeScript, CesiumJS, Resium, Zustand, Tailwind CSS
- **Инфра:** Docker, Docker Compose
