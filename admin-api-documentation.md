# Admin Management API Documentation

## Overview
This document describes the new admin management APIs that allow admins to manage their profiles, upload images, and manage wallet addresses.

## Authentication
All endpoints require admin authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Base URL
```
/api/admin
```

## Endpoints

### 1. Get All Admins (Superadmin Only)
**GET** `/all`

Returns a list of all admins in the system.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "admins": [
    {
      "_id": "admin_id",
      "name": "Admin Name",
      "email": "admin@example.com",
      "role": "admin",
      "profileImage": "/uploads/profile-123.jpg",
      "walletAddress": "0x123...",
      "isActive": true,
      "lastLogin": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 2. Get Admin by ID
**GET** `/:id`

Returns a specific admin's profile. Admins can only view their own profile unless they are superadmin.

**Response:**
```json
{
  "success": true,
  "admin": {
    "_id": "admin_id",
    "name": "Admin Name",
    "email": "admin@example.com",
    "role": "admin",
    "profileImage": "/uploads/profile-123.jpg",
    "walletAddress": "0x123...",
    "isActive": true,
    "lastLogin": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Update Admin Profile
**PUT** `/:id`

Updates an admin's profile information. Admins can only update their own profile unless they are superadmin.

**Request Body:**
```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "walletAddress": "0x456..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Admin profile updated successfully",
  "admin": {
    "id": "admin_id",
    "name": "Updated Name",
    "email": "updated@example.com",
    "role": "admin",
    "profileImage": "/uploads/profile-123.jpg",
    "walletAddress": "0x456...",
    "isActive": true,
    "lastLogin": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Upload Profile Image
**POST** `/:id/upload-image`

Uploads a profile image for an admin. Uses multipart/form-data.

**Request:**
- Content-Type: `multipart/form-data`
- Body: 
  - `profileImage` file field
  - `title` string field (optional) - title/description for the profile image

**Response:**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "imagePath": "/uploads/profile-123.jpg",
  "title": "Professional Headshot",
  "admin": {
    "id": "admin_id",
    "name": "Admin Name",
    "email": "admin@example.com",
    "profileImage": "/uploads/profile-123.jpg",
    "profileImageTitle": "Professional Headshot"
  }
}
```

### 5. Update Profile Image Title
**PUT** `/:id`

Updates the profile image title for an admin.

**Request:**
```json
{
  "profileImageTitle": "New Professional Headshot Title"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Admin profile updated successfully",
  "admin": {
    "id": "admin_id",
    "name": "Admin Name",
    "email": "admin@example.com",
    "role": "admin",
    "profileImage": "/uploads/profile-123.jpg",
    "profileImageTitle": "New Professional Headshot Title",
    "walletAddress": "0x123...",
    "isActive": true,
    "lastLogin": "2024-01-01T00:00:00.000Z"
  }
}
```

### 6. Delete Profile Image
**DELETE** `/:id/delete-image`

Removes the profile image for an admin.

**Response:**
```json
{
  "success": true,
  "message": "Profile image deleted successfully",
  "admin": {
    "id": "admin_id",
    "name": "Admin Name",
    "email": "admin@example.com",
    "profileImage": null
  }
}
```

### 7. Update Wallet Address
**PUT** `/:id/wallet-address`

Updates the wallet address for an admin.

**Request Body:**
```json
{
  "walletAddress": "0x789..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet address updated successfully",
  "admin": {
    "id": "admin_id",
    "name": "Admin Name",
    "email": "admin@example.com",
    "walletAddress": "0x789..."
  }
}
```

### 8. Toggle Admin Status (Superadmin Only)
**PATCH** `/:id/toggle-status`

Activates or deactivates an admin account.

**Response:**
```json
{
  "success": true,
  "message": "Admin activated successfully",
  "admin": {
    "id": "admin_id",
    "name": "Admin Name",
    "email": "admin@example.com",
    "isActive": true
  }
}
```

### 9. Delete Admin (Superadmin Only)
**DELETE** `/:id`

Permanently removes an admin account.

**Response:**
```json
{
  "success": true,
  "message": "Admin deleted successfully"
}
```

### 10. Get Admin Statistics (Superadmin Only)
**GET** `/stats/overview`

Returns statistics about all admins in the system.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalAdmins": 5,
    "activeAdmins": 4,
    "superadmins": 1,
    "regularAdmins": 4,
    "recentAdmins": [
      {
        "_id": "admin_id",
        "name": "Admin Name",
        "email": "admin@example.com",
        "role": "admin",
        "isActive": true,
        "lastLogin": "2024-01-01T00:00:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Error description"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Access denied. You can only update your own profile."
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied. Only superadmin can perform this action."
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Admin not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Server error",
  "error": "Error details"
}
```

## File Upload Notes

1. **Image Storage**: Images are stored in the `/uploads` directory
2. **File Naming**: Files are automatically renamed with timestamps to prevent conflicts
3. **Access**: Images are accessible via `/uploads/filename.jpg`
4. **Cleanup**: Old images are automatically deleted when replaced
5. **Validation**: Only image files are accepted, maximum size 5MB

## Security Features

1. **Role-based Access**: Different endpoints have different access levels
2. **Self-restriction**: Regular admins can only modify their own profiles
3. **Superadmin Protection**: Superadmins cannot deactivate/delete themselves
4. **File Validation**: Strict file type and size validation
5. **Authentication Required**: All endpoints require valid admin JWT token

## Usage Examples

### Upload Profile Image (JavaScript)
```javascript
const formData = new FormData();
formData.append('profileImage', fileInput.files[0]);

fetch('/api/admin/123/upload-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

### Update Wallet Address (JavaScript)
```javascript
fetch('/api/admin/123/wallet-address', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    walletAddress: '0x1234567890abcdef...'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

### Get Admin Profile (JavaScript)
```javascript
fetch('/api/admin/123', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(response => response.json())
.then(data => console.log(data));
```
