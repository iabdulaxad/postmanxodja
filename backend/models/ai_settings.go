package models

import "time"

// TeamAISettings stores OpenAI configuration per team
type TeamAISettings struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	TeamID    uint      `json:"team_id" gorm:"uniqueIndex;not null"`
	APIKey    string    `json:"-" gorm:"not null"`                  // Encrypted, never returned in JSON
	Provider  string    `json:"provider" gorm:"default:'openai'"`   // openai, anthropic, etc.
	Model     string    `json:"model" gorm:"default:'gpt-4o-mini'"` // gpt-4o, gpt-4o-mini, gpt-3.5-turbo, etc.
	IsEnabled bool      `json:"is_enabled" gorm:"default:true"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Team      *Team     `json:"team,omitempty" gorm:"foreignKey:TeamID"`
}

// AISettingsRequest is the request body for creating/updating AI settings
type AISettingsRequest struct {
	APIKey   string `json:"api_key"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

// AISettingsResponse is returned when fetching AI settings (no raw key)
type AISettingsResponse struct {
	ID         uint      `json:"id"`
	TeamID     uint      `json:"team_id"`
	Provider   string    `json:"provider"`
	Model      string    `json:"model"`
	IsEnabled  bool      `json:"is_enabled"`
	HasAPIKey  bool      `json:"has_api_key"`
	KeyPreview string    `json:"key_preview"` // e.g. "sk-...abc"
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// AIAnalyzeRequest is the request to analyze DBML via AI
type AIAnalyzeRequest struct {
	DBML          string `json:"dbml" binding:"required"`
	ProjectID     string `json:"project_id"`
	EnvironmentID string `json:"environment_id"`
	BaseURL       string `json:"base_url"`
	UCodeAPIKey   string `json:"ucode_api_key"`
}
