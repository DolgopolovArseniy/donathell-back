# Donathell API Specification

This document provides a comprehensive overview of the backend API endpoints for the Donathell project. It is intended for frontend developers to understand the structures of API calls, their required inputs, and their expected outputs.

## Base URL
All endpoints are relative to: `/api/v1`

---

## 1. Authentication

### 1.1 Signup
- **Endpoint:** `POST /users/signup`
- **Description:** Register a new user and generate an authentication token. Also automatically creates a `donationSlug` formatted as `{username}-donate`.

**Input Schema (JSON Body):**
```json
{
  "username": "string (required)",
  "email": "string (required, unique)",
  "password": "string (required, min length: 8)",
  "passwordConfirm": "string (required, must match password)"
}
```

**Output Schema:**
```json
{
  "status": "success",
  "token": "string (JWT)",
  "data": {
    "user": {
      "_id": "string",
      "username": "string",
      "email": "string",
      "donationSlug": "string"
    }
  }
}
```

### 1.2 Login
- **Endpoint:** `POST /users/login`
- **Description:** Authenticate an existing user and generate an authentication token.

**Input Schema (JSON Body):**
```json
{
  "loginIdentifier": "string (required, can be username or email)",
  "password": "string (required)"
}
```

**Output Schema:**
```json
{
  "status": "success",
  "token": "string (JWT)",
  "data": {
    "user": {
      "_id": "string",
      "username": "string",
      "email": "string",
      "donationSlug": "string"
    }
  }
}
```

---

## 2. Users

### 2.1 Get Current User (Me)
- **Endpoint:** `GET /users/me`
- **Description:** Get the profile details of the currently authenticated user.
- **Headers Required:** `Authorization: Bearer <token>` or `?token=<token>` query param.

**Output Schema:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "string",
      "username": "string",
      "email": "string",
      "donationSlug": "string"
    }
  }
}
```

### 2.2 Get User by Slug
- **Endpoint:** `GET /users/:slug`
- **Description:** Retrieve a user's details using their unique `donationSlug`. Primarily used on the public donation page.

**Output Schema:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "_id": "string",
      "username": "string",
      "email": "string",
      "donationSlug": "string"
    }
  }
}
```

---

## 3. Transactions (Donations)

### 3.1 Create Transaction
- **Endpoint:** `POST /transactions/`
- **Description:** Submit a new donation to a user. This endpoint will also trigger a real-time event via Redis Pub/Sub to the recipient's stream.

**Input Schema (JSON Body):**
```json
{
  "slug": "string (required, recipient's donationSlug)",
  "amount": "number (required, > 0)",
  "currency": "string (required, enum: ['ETH', 'BTC', 'SOL', 'USDT', 'USD', 'EUR', 'UAH'])",
  "from": "string (required, sender's name)",
  "message": "string (optional)"
}
```

**Output Schema:**
```json
{
  "status": "success",
  "data": {
    "transaction": {
      "_id": "string",
      "amount": "number",
      "currency": "string",
      "from": "string",
      "to": "string (ObjectId)",
      "message": "string",
      "transactionStatus": "string (e.g., 'completed')",
      "transactionDate": "string (ISO Date)"
    }
  }
}
```

### 3.2 Get User Transactions
- **Endpoint:** `GET /transactions/`
- **Description:** Retrieve a paginated list of completed transactions received by the authenticated user.
- **Headers Required:** `Authorization: Bearer <token>`
- **Query Parameters (Optional):**
  - `page`: number (default: 1, limit per page: 7)
  - `currency`: string (exact match filter)
  - `from`: string (exact match filter)
  - `dateFrom`: string (ISO date, >= filter)
  - `dateTo`: string (ISO date, <= filter)
  - `minAmount`: number (>= filter)
  - `maxAmount`: number (<= filter)

**Output Schema:**
```json
{
  "status": "success",
  "results": "number (count in current page)",
  "total": "number (total matching documents)",
  "data": {
    "transactions": [
      {
        "_id": "string",
        "amount": "number",
        "currency": "string",
        "from": "string",
        "to": "string (ObjectId)",
        "message": "string",
        "transactionStatus": "string",
        "transactionDate": "string (ISO Date)"
      }
    ]
  }
}
```

### 3.3 Get Dashboard Stats
- **Endpoint:** `GET /transactions/stats`
- **Description:** Retrieve aggregated statistics for the authenticated user's dashboard (balances, distributions, top donors, chart data). Conversions are applied dynamically based on exchange rates.
- **Headers Required:** `Authorization: Bearer <token>`
- **Query Parameters:**
  - `range`: string (`'1d'`, `'7d'`, or defaults to 30 days)

**Output Schema:**
```json
{
  "status": "success",
  "data": {
    "cryptoBalances": [
      {
        "currency": "string",
        "amount": "number (original amount)",
        "convertedAmount": "number (USD equivalent)"
      }
    ],
    "fiatBalances": [
      {
        "currency": "string",
        "amount": "number (original amount)",
        "convertedAmount": "number (USD equivalent)"
      }
    ],
    "cryptoDistribution": [
      {
        "name": "string (currency)",
        "value": "number (original amount)",
        "convertedValue": "number (USD equivalent)"
      }
    ],
    "fiatDistribution": [
      {
        "name": "string (currency)",
        "value": "number (original amount)",
        "convertedValue": "number (USD equivalent)"
      }
    ],
    "topDonors": [
      {
        "name": "string (donor's 'from' name)",
        "amount": "number (sum of original amounts)",
        "convertedValue": "number (USD equivalent)"
      }
    ],
    "chartData": [
      {
        "time": "string (formatted date/time based on range)",
        "amount": "number (USD equivalent sum for the period)"
      }
    ]
  }
}
```

### 3.4 Connect To Stream (Real-Time)
- **Endpoint:** `GET /transactions/stream`
- **Description:** Establishes a Server-Sent Events (SSE) connection to receive real-time donation alerts for the authenticated user.
- **Headers Required:** `Authorization: Bearer <token>` or `?token=<token>` query param.

**Output Schema (Stream Data):**
- Content-Type: `text/event-stream`
- Stream pushes data strings formatted as JSON, which match the transaction schema:
```json
{
  "_id": "string",
  "amount": "number",
  "currency": "string",
  "from": "string",
  "to": "string (ObjectId)",
  "message": "string",
  "transactionStatus": "string",
  "transactionDate": "string (ISO Date)"
}
```
