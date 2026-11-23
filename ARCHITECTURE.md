# LabLink – Architecture Guide

## System Overview
LabLink is a campus laboratory resource-sharing platform designed for deterministic fairness, explainable conflict resolution, and intelligent resource discovery.

```
┌────────────────────────────────────────────────────────┐
│                   Web Client (SPA)                     │
│    Floating Pill Nav · Hero · Vanilla ES Modules       │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON
┌───────────────────────────▼────────────────────────────┐
│                  Express 5 Application                 │
│         Helmet CSP · Rate Limit · Gzip Compression     │
└──────────────┬───────────────────────────┬─────────────┘
               │                           │
┌──────────────▼─────────────┐ ┌───────────▼─────────────┐
│       HTTP Route Layer     │ │     Central Middleware  │
│  items · bookings · auth   │ │  attachUser · AppError  │
│  scheduler · analytics     │ │  requestLogger          │
└──────────────┬─────────────┘ └─────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────┐
│                    Service Layer                       │
│  bookingService · geminiService · noshow · checkin     │
└──────────────┬───────────────────────────┬─────────────┘
               │                           │
┌──────────────▼─────────────┐ ┌───────────▼─────────────┐
│   Pure Domain Scheduler    │ │       Vector Search     │
│  O(n log n) conflict logic │ │   TF-IDF + Gemini Dense │
│  Priority Scoring [0, 1]   │ │   Smart Kit Bundling    │
└──────────────┬─────────────┘ └───────────┬─────────────┘
               │                           │
┌──────────────▼───────────────────────────▼─────────────┐
│                  Repository Layer                      │
│     itemRepo · userRepo · projectRepo · bookingRepo    │
│            distances.js · seedData.js                  │
└────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

1. **Config Layer (`src/config.js`)**
   - Injectable clock abstraction (`now()`, `setClock()`)
   - Named algorithm constants (`WEIGHT_*`, `SLOT_*`, `SCORE_EXP_DECAY`)
   - HTTP status code mapping (`HTTP_STATUS`)
   - HMAC signing & timing-safe equality

2. **Repository Layer (`src/repo/`)**
   - In-memory data store matching Firestore / pgvector interface
   - `distances.js`: Symmetric physical distance matrix between campus labs
   - `seedData.js`: Initial seed users, projects, and bookings

3. **Domain & Pure Logic Layer (`src/scheduler/`)**
   - Pure functions with zero I/O side effects
   - `intervalsOverlap`, `findConflicts` (O(n log n) sort-sweep)
   - `computeScore`: deterministic multi-criteria scoring
   - `helpers.js`: `findNextFreeSlot`, `findEquivalentItem`, `buildLoserAlternatives`

4. **Service Layer (`src/services/`)**
   - `bookingService.js`: State transition validation and lifecycle orchestration
   - `gemini.js`: GenAI explanation layer with 5s timeout, LRU cache, and deterministic fallback
   - `noshow.js`: Lazy & interval-based slot reclamation
   - `checkin.js`: Cryptographic HMAC token generation and verification

5. **Route Controllers (`src/routes/`)**
   - Thin handlers that parse/validate input, call services, and handle `AppError`

6. **Error Handling (`src/errors.js`)**
   - Structured `AppError` class with status, machine-readable code, and client message
