# Braze User Deduplication System Specification

This document outlines the design and step-by-step implementation plan for an intelligent user deduplication system that integrates with Braze CRM to automatically detect, merge, and manage duplicate user records across multiple acquisition channels.

The system will support automatic deduplication based on email, phone number, and device ID matching, preserve user information through smart merging strategies, maintain audit trails, and provide manual override capabilities including unmerge functionality.

The system is to be built using Cloudflare Workers with Hono as the API framework, Cloudflare D1 for audit logging, and Drizzle ORM for database operations.

## 1. Technology Stack

* **Edge Runtime:** Cloudflare Workers
* **API Framework:** Hono.js (TypeScript-based API framework)
* **Database:** Cloudflare D1 (SQLite-based serverless database)
* **ORM:** Drizzle (Type-safe SQL query builder)
* **External API:** Braze REST API for user management operations

## 2. Database Schema Design
The database will store deduplication operations, audit trails, and merge history to enable unmerge functionality and provide comprehensive tracking of all deduplication activities.

### 2.1. `merge_operations` Table
```sql
id (INTEGER, Primary Key, Auto Increment)
primary_user_id (TEXT, NOT NULL) -- Braze external_id of the primary user
merged_user_ids (TEXT, NOT NULL) -- JSON array of merged user external_ids
merge_strategy (TEXT, NOT NULL) -- Strategy used for merging
created_at (TEXT, NOT NULL) -- ISO timestamp
status (TEXT, NOT NULL) -- 'completed', 'failed', 'reverted'
```

### 2.2. `user_diffs` Table

```sql
id (INTEGER, Primary Key, Auto Increment)
merge_operation_id (INTEGER, Foreign Key)
user_id (TEXT, NOT NULL) -- Braze external_id
channel_name (TEXT, NOT NULL) -- Source channel
original_data (TEXT, NOT NULL) -- JSON of original user attributes
merged_data (TEXT, NOT NULL) -- JSON of final merged attributes
diff_data (TEXT, NOT NULL) -- JSON of differences between original and merged
created_at (TEXT, NOT NULL)
```

### 2.3. `deduplication_config` Table

```sql
id (INTEGER, Primary Key, Auto Increment)
matching_fields (TEXT, NOT NULL) -- JSON array of fields to match on
merge_strategy (TEXT, NOT NULL) -- Default merge strategy
auto_merge_enabled (BOOLEAN, NOT NULL)
webhook_url (TEXT) -- Optional webhook for notifications
updated_at (TEXT, NOT NULL)
```

## 3. API Endpoints

We will structure our API endpoints into logical groups for deduplication management, manual operations, and configuration.

### 3.1. Deduplication Endpoints

* **POST** `/api/deduplicate/scan`
  - **Description:** Manually trigger a full scan for duplicate users in Braze
  - **Expected Payload:**
	```json
	{
		"dry_run": true,
		"batch_size": 100,
		"filters": {
			"created_after": "2024-01-01T00:00:00Z",
			"channels": ["website", "facebook"]
		}
	}
	```

* **POST** `/api/deduplicate/merge`
  - **Description:** Manually merge specific users
  - **Expected Payload:**
	```json
	{
		"primary_user_id": "user_123",
		"duplicate_user_ids": ["user_456", "user_789"],
		"merge_strategy": "most_recent",
		"preserve_channels": true
	}
	```

* **POST** `/api/deduplicate/unmerge`
  - **Description:** Revert a previous merge operation
  - **Expected Payload:**
	```json
	{
		"merge_operation_id": 12345,
		"restore_original_users": true
	}
	```

### 3.2. Webhook Endpoints

* **POST** `/api/webhooks/braze/user-created`
	- **Description:** Process new user creation events from Braze
	- **Expected Payload:** Braze webhook payload with user data

* **POST** /api/webhooks/braze/user-updated
  - **Description:** Process user update events from Braze
  - **Expected Payload:** Braze webhook payload with updated user data

### 3.3. Management Endpoints

* **GET** `/api/operations`
  - **Description:** Retrieve merge operation history
  - **Query Params:** `page`, `limit`, `status`, `date_range`

* **GET** `/api/operations/:id`
  - **Description:** Get detailed information about a specific merge operation
  - **Response includes:** operation details, user diffs, and unmerge capability

* **GET** `/api/duplicates/potential`
  - **Description:** Get list of potential duplicates without merging
  - **Query Params:** `confidence_threshold`, `limit`, `matching_field`

### 3.4. Configuration Endpoints

* **GET** `/api/config`
  - **Description:** Retrieve current deduplication configuration

* **PUT** `/api/config`
  - **Description:** Update deduplication settings
  - **Expected Payload:**
	```json
	{
		"matching_fields": ["email", "phone", "device_id"],
		"merge_strategy": "most_recent",
		"auto_merge_enabled": true,
		"confidence_threshold": 0.8
	}
	```

## 4. Integrations
* **Braze REST API** for user data retrieval, updates, and deletion operations
* **Braze Webhooks** for real-time user event processing
* **Resend** for email notifications about merge operations and conflicts

### 4.1. Braze API Integration

The system will use Braze's REST API endpoints:

* `/users/export/ids` - Export user data for analysis
* `/users/track` - Update user attributes with merged data
* `/users/delete` - Remove duplicate user records
* `/users/export/segment` - Bulk user data retrieval

### 4.2. Required Braze Permissions

* User data export permissions
* User attribute update permissions
* User deletion permissions
* Webhook configuration access

## 5. Core Deduplication Logic

### 5.1. Matching Algorithm

The system will implement a multi-stage matching process:

1. **Exact Match:** Direct comparison of email, phone, and device_id
2. **Fuzzy Match:** Normalized email comparison and phone number formatting
3. **Confidence Scoring:** Assign confidence scores based on match quality

### 5.2. Merge Strategy

When duplicates are identified:

1. Select primary user (most recent or most complete profile)
2. Create custom attribute deduplication_history containing:
	```json
	{
		"merged_users": [
			{
				"user_id": "user_456",
				"channel": "facebook",
				"merged_at": "2024-01-15T10:30:00Z",
				"diff": {
					"name": {"old": "John", "new": "John Smith"},
					"phone": {"old": null, "new": "+1234567890"}
				}
			}
		],
		"channels": ["website", "facebook", "fanfinders"]
	}
	```
3. Update primary user with merged attributes
4. Delete duplicate user records
5. Log operation in audit database

### 5.3. Unmerge Process

To unmerge users:

1. Retrieve original user data from user_diffs table
2. Recreate deleted user records in Braze
3. Restore original attributes to all users
4. Remove deduplication_history from primary user
5. Mark merge operation as reverted

## 6. Additional Notes

### 6.1. Environment Variables
Configure the following environment variables:

* `BRAZE_API_KEY` - Braze REST API key
* `BRAZE_API_URL` - Braze instance URL
* `WEBHOOK_SECRET` - Secret for validating Braze webhooks
* `DATABASE_URL` - Cloudflare D1 database connection

### 6.2. Rate Limiting

Implement rate limiting for Braze API calls to respect their API limits and prevent overwhelming the system during bulk operations.

### 6.3. Error Handling

Implement comprehensive error handling with retry logic for API failures and rollback mechanisms for failed merge operations.

### 6.4. Monitoring

Set up monitoring for:

* Merge operation success/failure rates
* API response times
* Duplicate detection accuracy
* System performance metrics

## 7. Further Reading

* Take inspiration from the project template here: https://github.com/fiberplane/create-honc-app/tree/main/templates/d1
* For Braze API documentation: https://www.braze.com/docs/api/basics/
* For webhook implementation patterns with Hono: https://hono.dev/guides/webhooks
