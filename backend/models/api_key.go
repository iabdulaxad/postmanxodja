package models

import "time"

// TeamAPIKey represents an API key for third-party access to team resources
type TeamAPIKey struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	TeamID      uint      `json:"team_id" gorm:"not null;index"`
	Name        string    `json:"name" gorm:"not null"` // e.g., "CI/CD Pipeline", "External Integration"
	Key         string    `json:"-" gorm:"uniqueIndex;not null"`
	KeyPrefix   string    `json:"key_prefix" gorm:"not null"` // First 8 chars for identification
	Permissions string    `json:"permissions" gorm:"default:'read'"` // read, write, read_write
	LastUsedAt  *time.Time `json:"last_used_at"`
	ExpiresAt   *time.Time `json:"expires_at"` // nil means no expiration
	CreatedAt   time.Time `json:"created_at"`
	CreatedBy   uint      `json:"created_by" gorm:"not null"`
	Team        *Team     `json:"team,omitempty" gorm:"foreignKey:TeamID"`
}

type CreateAPIKeyRequest struct {
	Name        string `json:"name" binding:"required"`
	Permissions string `json:"permissions"` // read, write, read_write (default: read)
	ExpiresIn   int    `json:"expires_in"`  // Days until expiration, 0 = no expiration
}

type APIKeyResponse struct {
	ID          uint       `json:"id"`
	TeamID      uint       `json:"team_id"`
	Name        string     `json:"name"`
	Key         string     `json:"key,omitempty"` // Only returned on creation
	KeyPrefix   string     `json:"key_prefix"`
	Permissions string     `json:"permissions"`
	LastUsedAt  *time.Time `json:"last_used_at"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
}
