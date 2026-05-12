package models

import "time"

type PerformanceTest struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `json:"user_id"`
	URL       string     `json:"url"`
	Status    string     `json:"status"` // pending, running, completed, failed
	Error     string     `json:"error,omitempty"`
	Output    string     `gorm:"type:text" json:"output,omitempty"`
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}
