package models

import "time"

type SavedTab struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"not null;index" json:"user_id"`
	TabID       string    `gorm:"not null" json:"tab_id"`
	Name        string    `json:"name"`
	Method      string    `json:"method"`
	URL         string    `json:"url"`
	Headers     string    `gorm:"type:text" json:"headers"`      // JSON string
	Body        string    `gorm:"type:text" json:"body"`
	QueryParams string    `gorm:"type:text" json:"query_params"` // JSON string
	Docs        string    `gorm:"type:text" json:"docs"`
	IsActive    bool      `json:"is_active"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
