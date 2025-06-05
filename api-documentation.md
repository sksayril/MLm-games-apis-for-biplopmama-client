# API Documentation

## Table of Contents
1. [Authentication APIs](#authentication-apis)
   - [Register](#register)
   - [Login](#login)
   - [Get Profile](#get-profile)
2. [Wallet APIs](#wallet-apis)
   - [Get Wallet Balance](#get-wallet-balance)
   - [Transfer Between Wallets](#transfer-between-wallets)
   - [Create Withdrawal Request](#create-withdrawal-request)
   - [Get All Withdrawal Requests](#get-all-withdrawal-requests)
   - [Get Specific Withdrawal Request](#get-specific-withdrawal-request)
3. [MLM System APIs](#mlm-system-apis)
   - [MLM Statistics](#mlm-statistics)

## Authentication APIs

### Register
Creates a new user account and sets up MLM referral structure if a referral code is provided.

**URL**: `/api/users/register`

**Method**: `POST`

**Auth required**: No

**Request Body**:
```json
{
  "name": "User Name",
  "mobile": "9876543210",
  "email": "user@example.com",
  "password": "password123",
  "referralCode": "ABC123" // Optional
}
```

**Success Response**:
- **Code**: 201 Created
- **Content example**:
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "JWT_TOKEN",
  "user": {
    "id": "user_id",
    "name": "User Name",
    "mobile": "9876543210",
    "email": "user@example.com",
    "referralCode": "XYZ789",
    "level": 1,
    "wallet": {
      "normal": 0,
      "benefit": 0,
      "game": 0,
      "withdrawal": 0,
      "withdrawalDaysGrown": 0
    }
  }
}
```

**Error Response**:
- **Code**: 400 Bad Request
- **Content example**:
```json
{
  "success": false,
  "message": "User with this mobile number already exists"
}
```

**Notes**:
- When a user registers with a referral code, they are added to the MLM structure
- The system supports up to 10 levels of referrals with corresponding benefits
- Each user gets a unique referral code for sharing

### Login
Authenticates a user and returns a JWT token.

**URL**: `/api/users/login`

**Method**: `POST`

**Auth required**: No

**Request Body**:
```json
{
  "mobile": "9876543210",
  "password": "password123"
}
```

**Success Response**:
- **Code**: 200 OK
- **Content example**:
```json
{
  "success": true,
  "message": "Login successful",
  "token": "JWT_TOKEN",
  "user": {
    "id": "user_id",
    "name": "User Name",
    "mobile": "9876543210",
    "email": "user@example.com",
    "referralCode": "XYZ789",
    "level": 1,
    "wallet": {
      "normal": 0,
      "benefit": 0,
      "game": 0,
      "withdrawal": 0,
      "withdrawalDaysGrown": 0
    }
  }
}
```

**Error Response**:
- **Code**: 400 Bad Request
- **Content example**:
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### Get Profile
Gets the profile of the authenticated user.

**URL**: `/api/users/profile`

**Method**: `GET`

**Auth required**: Yes (JWT Token)

**Headers**:
```
Authorization: Bearer JWT_TOKEN
```

**Success Response**:
- **Code**: 200 OK
- **Content example**:
```json
{
  "success": true,
  "user": {
    "_id": "user_id",
    "name": "User Name",
    "mobile": "9876543210",
    "email": "user@example.com",
    "referralCode": "XYZ789",
    "level": 1,
    "wallet": {
      "normal": 0,
      "benefit": 0,
      "game": 0,
      "withdrawal": 0,
      "withdrawalDaysGrown": 0
    },
    "referredBy": "referrer_id",
    "ancestors": [
      {
        "userId": {
          "_id": "ancestor_id",
          "name": "Ancestor Name"
        },
        "level": 1
      }
    ],
    "createdAt": "2025-06-01T10:00:00.000Z",
    "updatedAt": "2025-06-01T10:00:00.000Z"
  }
}
```

## Wallet APIs

### Get Wallet Balance
Gets the wallet balances for the authenticated user.

**URL**: `/api/users/wallet`

**Method**: `GET`

**Auth required**: Yes (JWT Token)

**Headers**:
```
Authorization: Bearer JWT_TOKEN
```

**Success Response**:
- **Code**: 200 OK
- **Content example**:
```json
{
  "success": true,
  "wallet": {
    "normal": 100,
    "benefit": 50,
    "game": 20,
    "withdrawal": 0,
    "withdrawalDaysGrown": 0
  }
}
```

### Transfer Between Wallets
Transfers funds between different wallet types.

**URL**: `/api/users/wallet/transfer`

**Method**: `POST`

**Auth required**: Yes (JWT Token)

**Headers**:
```
Authorization: Bearer JWT_TOKEN
```

**Request Body**:
```json
{
  "fromWallet": "normal",
  "toWallet": "game",
  "amount": 100
}
```

**Success Response**:
- **Code**: 200 OK
- **Content example**:
```json
{
  "success": true,
  "message": "Transfer completed successfully",
  "wallet": {
    "normal": 0,
    "benefit": 0,
    "game": 100,
    "withdrawal": 0,
    "withdrawalDaysGrown": 0
  }
}
```

**Error Response**:
- **Code**: 400 Bad Request
- **Content example**:
```json
{
  "success": false,
  "message": "Insufficient balance in normal wallet. Available: 50 Rs"
}
```

**Notes**:
- When transferring from normal to game wallet, if benefit wallet has sufficient balance, it will deduct double the amount from benefit wallet
- Valid wallet types: "normal", "benefit", "game"

### Create Withdrawal Request
Creates a withdrawal request from the game wallet.

**URL**: `/api/users/withdrawal`

**Method**: `POST`

**Auth required**: Yes (JWT Token)

**Headers**:
```
Authorization: Bearer JWT_TOKEN
```

**Request Body**:
```json
{
  "amount": 500,
  "upiId": "user@bank"
}
```

**Success Response**:
- **Code**: 201 Created
- **Content example**:
```json
{
  "success": true,
  "message": "Withdrawal request created successfully. Waiting for admin approval.",
  "withdrawal": {
    "id": "withdrawal_id",
    "amount": 500,
    "upiId": "user@bank",
    "status": "pending",
    "createdAt": "2025-06-01T10:00:00.000Z"
  }
}
```

**Error Response**:
- **Code**: 400 Bad Request
- **Content example**:
```json
{
  "success": false,
  "message": "Minimum withdrawal amount is 500"
}
```

**Notes**:
- Minimum withdrawal amount is 500
- When a withdrawal is processed, MLM benefits are automatically distributed to the user's ancestors
- The MLM benefits distribution follows the level-based rates as follows:
  - Level 1: 4.00%
  - Level 2: 2.00%
  - Level 3: 1.00%
  - Level 4: 0.50%
  - Level 5: 0.40%
  - Level 6: 0.30%
  - Level 7: 0.30%
  - Level 8: 0.40%
  - Level 9: 0.50%
  - Level 10: 0.60%
  - Total: 10.00% of transaction amount

### Get All Withdrawal Requests
Gets all withdrawal requests for the authenticated user.

**URL**: `/api/users/withdrawals`

**Method**: `GET`

**Auth required**: Yes (JWT Token)

**Headers**:
```
Authorization: Bearer JWT_TOKEN
```

**Success Response**:
- **Code**: 200 OK
- **Content example**:
```json
{
  "success": true,
  "withdrawals": [
    {
      "id": "withdrawal_id",
      "amount": 500,
      "upiId": "user@bank",
      "status": "pending",
      "remarks": null,
      "createdAt": "2025-06-01T10:00:00.000Z",
      "processedAt": null
    },
    {
      "id": "withdrawal_id2",
      "amount": 1000,
      "upiId": "user@bank",
      "status": "completed",
      "remarks": "Payment processed",
      "createdAt": "2025-05-01T10:00:00.000Z",
      "processedAt": "2025-05-01T12:00:00.000Z"
    }
  ]
}
```

### Get Specific Withdrawal Request
Gets details of a specific withdrawal request.

**URL**: `/api/users/withdrawal/:id`

**Method**: `GET`

**Auth required**: Yes (JWT Token)

**Headers**:
```
Authorization: Bearer JWT_TOKEN
```

**Success Response**:
- **Code**: 200 OK
- **Content example**:
```json
{
  "success": true,
  "withdrawal": {
    "id": "withdrawal_id",
    "amount": 500,
    "upiId": "user@bank",
    "status": "pending",
    "remarks": null,
    "createdAt": "2025-06-01T10:00:00.000Z",
    "processedAt": null
  }
}
```

## MLM System APIs

### MLM Statistics
Gets MLM referral statistics for the authenticated user.

**URL**: `/api/mlm/stats`

**Method**: `GET`

**Auth required**: Yes (JWT Token)

**Headers**:
```
Authorization: Bearer JWT_TOKEN
```

**Success Response**:
- **Code**: 200 OK
- **Content example**:
```json
{
  "success": true,
  "user": {
    "name": "User Name",
    "mobile": "9876543210",
    "referralCode": "XYZ789",
    "level": 1
  },
  "mlmStats": {
    "directReferrals": 5,
    "totalNetworkSize": 42,
    "levels": [
      {
        "level": 1,
        "rate": 4.00,
        "referralsCount": 5,
        "potentialEarnings": "4.00% of transactions"
      },
      {
        "level": 2,
        "rate": 2.00,
        "referralsCount": 12,
        "potentialEarnings": "2.00% of transactions"
      },
      {
        "level": 3,
        "rate": 1.00,
        "referralsCount": 10,
        "potentialEarnings": "1.00% of transactions"
      },
      {
        "level": 4,
        "rate": 0.50,
        "referralsCount": 8,
        "potentialEarnings": "0.50% of transactions"
      },
      {
        "level": 5,
        "rate": 0.40,
        "referralsCount": 3,
        "potentialEarnings": "0.40% of transactions"
      },
      {
        "level": 6,
        "rate": 0.30,
        "referralsCount": 2,
        "potentialEarnings": "0.30% of transactions"
      },
      {
        "level": 7,
        "rate": 0.30,
        "referralsCount": 1,
        "potentialEarnings": "0.30% of transactions"
      },
      {
        "level": 8,
        "rate": 0.40,
        "referralsCount": 1,
        "potentialEarnings": "0.40% of transactions"
      },
      {
        "level": 9,
        "rate": 0.50,
        "referralsCount": 0,
        "potentialEarnings": "0.50% of transactions"
      },
      {
        "level": 10,
        "rate": 0.60,
        "referralsCount": 0,
        "potentialEarnings": "0.60% of transactions"
      }
    ]
  },
  "directReferrals": [
    {
      "_id": "referral_id1",
      "name": "Referral 1",
      "mobile": "9876543211",
      "referralCode": "ABC123",
      "level": 1,
      "createdAt": "2025-06-01T10:00:00.000Z"
    },
    {
      "_id": "referral_id2",
      "name": "Referral 2",
      "mobile": "9876543212",
      "referralCode": "DEF456",
      "level": 1,
      "createdAt": "2025-06-02T10:00:00.000Z"
    }
  ],
  "recentBonuses": [
    {
      "_id": "transaction_id1",
      "amount": 50,
      "walletType": "benefit",
      "description": "4.0% MLM bonus from level 1 referral transaction",
      "transactionDate": "2025-06-03T10:00:00.000Z"
    },
    {
      "_id": "transaction_id2",
      "amount": 20,
      "walletType": "benefit",
      "description": "2.0% MLM bonus from level 2 referral transaction",
      "transactionDate": "2025-06-02T10:00:00.000Z"
    }
  ]
}
```

**Notes**:
- Displays the MLM structure up to 10 levels
- Each level has its own bonus rate as follows:
  - Level 1: 4.00%
  - Level 2: 2.00%
  - Level 3: 1.00%
  - Level 4: 0.50%
  - Level 5: 0.40%
  - Level 6: 0.30%
  - Level 7: 0.30%
  - Level 8: 0.40%
  - Level 9: 0.50%
  - Level 10: 0.60%
- All MLM bonuses are added to the benefit wallet
- Total network size includes all users in the downline across all levels
