# MLM 30-Level System API Documentation

## Overview
This document describes the comprehensive 30-level MLM (Multi-Level Marketing) system with profit sharing capabilities. The system includes:
- 30-level MLM structure with specific profit sharing percentages
- Daily profit sharing (1% from benefit wallet)
- Level-based profit sharing (0.5% per level)
- Separate schedulers for automated profit distribution
- Admin controls and user analytics

## MLM Structure

### 30-Level Profit Sharing Percentages
```
Level 1:  15.0% - Direct Referral
Level 2:  10.0% - Second Level
Level 3:  5.0%  - Third Level
Level 4:  3.0%  - Fourth Level
Level 5:  4.0%  - Fifth Level

Levels 6-10:  3.0% each (15% total) - Group 1
Levels 11-20: 2.5% each (25% total) - Group 2
Levels 21-30: 4.5% each (45% total) - Group 3

Total: 100% profit sharing across 30 levels
```

### Profit Sharing Types
1. **Daily Profit Sharing**: 1% of benefit wallet distributed daily at 12:00 AM
2. **Level-based Profit Sharing**: 0.5% per MLM level distributed daily at 1:00 AM

## API Endpoints

### Base URL
```
/api/mlm30
```

### Authentication
All endpoints require authentication using JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

---

## User Endpoints

### 1. Get MLM Structure
**GET** `/api/mlm30/structure`

Returns the complete 30-level MLM structure and configuration.

**Response:**
```json
{
  "success": true,
  "mlmStructure": {
    "1": { "percentage": 15.0, "description": "Level 1 - Direct Referral" },
    "2": { "percentage": 10.0, "description": "Level 2 - Second Level" },
    // ... up to level 30
  },
  "dailyProfitShare": {
    "percentage": 1.0,
    "description": "Daily 1% profit share from benefit wallet"
  },
  "levelBasedProfitShare": {
    "percentagePerLevel": 0.5,
    "description": "Level-based profit sharing (0.5% per level)"
  },
  "totalLevels": 30,
  "totalPercentage": 100
}
```

### 2. Get User MLM Statistics
**GET** `/api/mlm30/stats`

Returns comprehensive MLM statistics for the authenticated user.

**Response:**
```json
{
  "success": true,
  "user": {
    "name": "John Doe",
    "mobile": "1234567890",
    "referralCode": "ABC123",
    "mlmLevel": 5,
    "mlmEarnings": {
      "daily": 150.50,
      "levelBased": 75.25,
      "total": 225.75
    }
  },
  "statistics": {
    "directReferrals": 12,
    "totalDownline": 150,
    "earningsByType": [
      {
        "_id": "daily_benefit",
        "totalAmount": 150.50,
        "count": 30
      }
    ],
    "recentProfitShares": [
      {
        "userId": "user_id",
        "level": 1,
        "shareType": "daily_benefit",
        "amount": 5.25,
        "percentage": 15.0,
        "description": "15% daily benefit profit share from level 1",
        "shareDate": "2024-01-15T00:00:00.000Z"
      }
    ]
  },
  "directReferrals": [
    {
      "name": "Jane Smith",
      "mobile": "0987654321",
      "referralCode": "XYZ789",
      "mlmLevel": 3,
      "createdAt": "2024-01-10T10:00:00.000Z"
    }
  ],
  "downlineUsers": [
    // Array of downline users (limited to 20 for performance)
  ]
}
```

### 3. Get MLM Downline by Level
**GET** `/api/mlm30/downline/:level?`

Get downline users, optionally filtered by level.

**Parameters:**
- `level` (optional): Specific level to filter (1-30)

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "downlineByLevel": {
    "1": [
      {
        "name": "Direct Referral 1",
        "mobile": "1111111111",
        "referralCode": "REF001",
        "mlmLevel": 2,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "wallet": {
          "normal": 1000,
          "benefit": 500,
          "withdrawal": 250
        }
      }
    ],
    "2": [
      // Level 2 referrals
    ]
    // ... up to level 30
  },
  "totalDownline": 150,
  "level": "all"
}
```

### 4. Get Profit Share History
**GET** `/api/mlm30/profit-history`

Get user's profit share transaction history.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "profitShares": [
    {
      "userId": "user_id",
      "level": 1,
      "shareType": "daily_benefit",
      "amount": 15.75,
      "percentage": 15.0,
      "sourceAmount": 105.00,
      "walletType": "withdrawal",
      "status": "completed",
      "description": "15% daily benefit profit share from level 1",
      "shareDate": "2024-01-15T00:00:00.000Z",
      "relatedUserId": {
        "name": "Source User",
        "mobile": "1234567890"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalCount": 100,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 5. Get Earnings Summary
**GET** `/api/mlm30/earnings-summary`

Get earnings breakdown by type and monthly summaries.

**Response:**
```json
{
  "success": true,
  "earningsByType": [
    {
      "_id": "daily_benefit",
      "totalAmount": 450.75,
      "count": 90,
      "lastShare": "2024-01-15T00:00:00.000Z"
    },
    {
      "_id": "level_based",
      "totalAmount": 225.50,
      "count": 45,
      "lastShare": "2024-01-15T01:00:00.000Z"
    }
  ],
  "monthlyEarnings": [
    {
      "_id": { "year": 2024, "month": 1 },
      "totalAmount": 150.25,
      "count": 30
    },
    {
      "_id": { "year": 2023, "month": 12 },
      "totalAmount": 125.50,
      "count": 25
    }
  ]
}
```

### 6. Rebuild MLM Chain
**POST** `/api/mlm30/rebuild-chain`

Manually rebuild the MLM ancestor chain for the current user.

**Response:**
```json
{
  "success": true,
  "message": "MLM ancestor chain built successfully",
  "ancestors": [
    {
      "userId": "ancestor_id",
      "level": 1,
      "profitSharePercentage": 15.0
    }
  ],
  "userLevel": 5
}
```

---

## Admin Endpoints

### 1. Get Scheduler Status
**GET** `/api/mlm30/scheduler/status`

Get current status of MLM schedulers (Admin only).

**Response:**
```json
{
  "success": true,
  "scheduler": {
    "isRunning": true,
    "lastDailyRun": "2024-01-15T00:00:00.000Z",
    "lastLevelBasedRun": "2024-01-15T01:00:00.000Z",
    "nextDailyRun": "2024-01-16T00:00:00.000Z",
    "nextLevelBasedRun": "2024-01-16T01:00:00.000Z"
  }
}
```

### 2. Start MLM Scheduler
**POST** `/api/mlm30/scheduler/start`

Start the MLM profit sharing schedulers (Admin only).

**Response:**
```json
{
  "success": true,
  "message": "MLM scheduler started successfully"
}
```

### 3. Stop MLM Scheduler
**POST** `/api/mlm30/scheduler/stop`

Stop the MLM profit sharing schedulers (Admin only).

**Response:**
```json
{
  "success": true,
  "message": "MLM scheduler stopped successfully"
}
```

### 4. Run Daily Profit Sharing Manually
**POST** `/api/mlm30/scheduler/run-daily`

Manually trigger daily profit sharing (Admin only).

**Response:**
```json
{
  "success": true,
  "message": "Daily profit sharing completed successfully",
  "totalUsers": 150,
  "distributions": [
    {
      "userId": "user_id",
      "benefitAmount": 1000,
      "shareAmount": 10,
      "distributions": [
        {
          "ancestorId": "ancestor_id",
          "level": 1,
          "percentage": 15.0,
          "amount": 1.5
        }
      ]
    }
  ]
}
```

### 5. Run Level-based Profit Sharing Manually
**POST** `/api/mlm30/scheduler/run-level-based`

Manually trigger level-based profit sharing (Admin only).

**Response:**
```json
{
  "success": true,
  "message": "Level-based profit sharing completed successfully",
  "totalUsers": 120,
  "distributions": [
    {
      "userId": "user_id",
      "mlmLevel": 5,
      "levelPercentage": 2.5,
      "benefitAmount": 1000,
      "shareAmount": 25,
      "distributions": [
        {
          "ancestorId": "ancestor_id",
          "level": 1,
          "percentage": 15.0,
          "amount": 3.75
        }
      ]
    }
  ]
}
```

### 6. Rebuild All MLM Chains
**POST** `/api/mlm30/scheduler/rebuild-all-chains`

Rebuild MLM ancestor chains for all users (Admin only).

**Response:**
```json
{
  "success": true,
  "message": "MLM chain rebuild completed",
  "successCount": 145,
  "errorCount": 5
}
```

### 7. Get MLM Analytics
**GET** `/api/mlm30/analytics`

Get comprehensive MLM system analytics (Admin only).

**Response:**
```json
{
  "success": true,
  "analytics": {
    "totalUsers": 200,
    "usersWithMLM": 150,
    "mlmParticipationRate": "75.00",
    "levelDistribution": [
      { "_id": 1, "count": 50 },
      { "_id": 2, "count": 30 },
      { "_id": 3, "count": 20 }
    ],
    "totalProfitShares": {
      "totalAmount": 50000,
      "totalCount": 10000
    },
    "profitSharesByType": [
      {
        "_id": "daily_benefit",
        "totalAmount": 30000,
        "count": 6000
      },
      {
        "_id": "level_based",
        "totalAmount": 20000,
        "count": 4000
      }
    ]
  }
}
```

---

## Usage Examples

### For Users

#### 1. Check MLM Structure
```javascript
// Get MLM structure information
const response = await fetch('/api/mlm30/structure', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
const data = await response.json();
console.log('MLM Structure:', data.mlmStructure);
```

#### 2. View Personal MLM Stats
```javascript
// Get personal MLM statistics
const response = await fetch('/api/mlm30/stats', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
const stats = await response.json();
console.log('My MLM Level:', stats.user.mlmLevel);
console.log('Total Earnings:', stats.user.mlmEarnings.total);
console.log('Direct Referrals:', stats.statistics.directReferrals);
```

#### 3. View Downline by Level
```javascript
// Get level 1 downline
const response = await fetch('/api/mlm30/downline/1', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
const downline = await response.json();
console.log('Level 1 Referrals:', downline.downlineByLevel[1]);
```

#### 4. Check Profit History
```javascript
// Get profit share history
const response = await fetch('/api/mlm30/profit-history?page=1&limit=10', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
const history = await response.json();
console.log('Recent Profit Shares:', history.profitShares);
```

### For Admins

#### 1. Check Scheduler Status
```javascript
// Check if schedulers are running
const response = await fetch('/api/mlm30/scheduler/status', {
  headers: {
    'Authorization': 'Bearer ' + adminToken
  }
});
const status = await response.json();
console.log('Scheduler Running:', status.scheduler.isRunning);
```

#### 2. Run Manual Profit Sharing
```javascript
// Run daily profit sharing manually
const response = await fetch('/api/mlm30/scheduler/run-daily', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + adminToken,
    'Content-Type': 'application/json'
  }
});
const result = await response.json();
console.log('Daily Profit Sharing Result:', result);
```

#### 3. Get System Analytics
```javascript
// Get comprehensive MLM analytics
const response = await fetch('/api/mlm30/analytics', {
  headers: {
    'Authorization': 'Bearer ' + adminToken
  }
});
const analytics = await response.json();
console.log('MLM Participation Rate:', analytics.analytics.mlmParticipationRate);
console.log('Total Profit Distributed:', analytics.analytics.totalProfitShares.totalAmount);
```

---

## Scheduler Configuration

### Daily Profit Sharing Scheduler
- **Schedule**: Every day at 12:00 AM
- **Function**: Distributes 1% of each user's benefit wallet to their MLM ancestors
- **Timezone**: Asia/Dhaka (configurable)

### Level-based Profit Sharing Scheduler
- **Schedule**: Every day at 1:00 AM
- **Function**: Distributes 0.5% per MLM level of each user's benefit wallet to their MLM ancestors
- **Timezone**: Asia/Dhaka (configurable)

### Starting/Stopping Schedulers
The schedulers are automatically started when the application starts. Admins can control them via the API endpoints:

```javascript
// Start schedulers
await fetch('/api/mlm30/scheduler/start', { method: 'POST' });

// Stop schedulers
await fetch('/api/mlm30/scheduler/stop', { method: 'POST' });
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (development only)"
}
```

### Common HTTP Status Codes
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (admin access required)
- `404`: Not Found
- `500`: Internal Server Error

---

## Database Models

### User Model Updates
The user model has been extended with MLM-specific fields:
- `mlmLevel`: Current MLM level (0-30)
- `mlmAncestors`: Array of MLM ancestors with profit sharing percentages
- `totalReferrals`: Total number of referrals
- `directReferrals`: Number of direct referrals
- `mlmEarnings`: Earnings breakdown by type

### New Models
- `MLMLevel`: Tracks MLM level information for users
- `ProfitShare`: Records all profit sharing transactions

---

## Security Considerations

1. **Authentication**: All endpoints require valid JWT tokens
2. **Authorization**: Admin endpoints check for admin privileges
3. **Input Validation**: All inputs are validated and sanitized
4. **Transaction Safety**: Database operations use MongoDB sessions for consistency
5. **Rate Limiting**: Consider implementing rate limiting for production use

---

## Performance Considerations

1. **Pagination**: Large result sets are paginated
2. **Indexing**: Database indexes are optimized for MLM queries
3. **Caching**: Consider implementing Redis caching for frequently accessed data
4. **Background Processing**: Heavy operations are handled asynchronously

---

## Monitoring and Logging

The system includes comprehensive logging for:
- Scheduler execution
- Profit sharing distributions
- Error tracking
- Performance metrics

Monitor the application logs for:
- Scheduler start/stop events
- Profit sharing execution results
- Error conditions
- Performance bottlenecks
