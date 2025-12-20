# TODO API - Menadżer Zadań

**Autor:** Adrian  
**Grupa:** INMN2(hybryda)  
**Data:** 16.11.2025

## Opis projektu

REST API dla menadżera zadań opartego o Supabase (PostgreSQL) z rejestracją/logowaniem, ochroną JWT i rozbudowanymi filtrami/paginacją.

## Technologie

- Node.js + Express.js
- Supabase (PostgreSQL + Auth JWT)
- Jest + Supertest

## Instalacja i uruchomienie

### Wymagania

- Node.js 18+

### Krok po kroku

```bash
# 1. Sklonuj repozytorium
git clone https://github.com/adsuwala/backend-labs.git

# 2. Przejdź do katalogu
cd lab1

# 3. Zainstaluj zależności
npm install

# 4. Dodaj i skonfiguruj plik .env

# 5. Uruchom serwer
npm run start

# 6. (Opcjonalnie) Testy
npm test

## Dostępne endpointy

- `POST /auth/register` – rejestracja użytkownika w Supabase.
- `POST /auth/login` – logowanie i pobranie tokena JWT (nagłówek `Authorization: Bearer <token>` wymagany w /tasks).
- `GET /tasks` – lista zadań z obsługą zapytań:
  - `completed=true|false`
  - `sort=createdAt` (rosnąco) lub `sort=-createdAt` (malejąco, domyślne)
  - `limit` i `page` (paginacja tylko gdy podasz `limit`, strona domyślna = 1)
  - `createdFrom`, `createdTo` – zakres dat ISO (np. `2024-01-01`)
  Nagłówki `X-Total-Count`, `X-Page`, `X-Limit` są ustawiane wyłącznie przy aktywnej paginacji.
- `GET /tasks/:id` – pojedynczy task po UUID.
- `POST /tasks` – tworzenie zadania (JSON `{ "title": "..." }`).
- `PATCH /tasks/:id` – aktualizacja pola `completed`.
- `DELETE /tasks/:id` – usunięcie zadania.
```
