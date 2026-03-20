package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"postmanxodja/database"
	"postmanxodja/models"
	"postmanxodja/services"

	"github.com/gin-gonic/gin"
)

// GetAISettings returns the AI settings for a team (without exposing the raw API key)
func GetAISettings(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var settings models.TeamAISettings
	result := database.DB.Where("team_id = ?", teamID).First(&settings)
	if result.Error != nil {
		// No settings found - return empty response indicating no AI configured
		c.JSON(http.StatusOK, models.AISettingsResponse{
			TeamID:    teamID,
			Provider:  "openai",
			Model:     "gpt-4o-mini",
			IsEnabled: false,
			HasAPIKey: false,
		})
		return
	}

	c.JSON(http.StatusOK, models.AISettingsResponse{
		ID:         settings.ID,
		TeamID:     settings.TeamID,
		Provider:   settings.Provider,
		Model:      settings.Model,
		IsEnabled:  settings.IsEnabled,
		HasAPIKey:  settings.APIKey != "",
		KeyPreview: maskAPIKey(settings.APIKey),
		CreatedAt:  settings.CreatedAt,
		UpdatedAt:  settings.UpdatedAt,
	})
}

// UpdateAISettings creates or updates AI settings for a team
func UpdateAISettings(c *gin.Context) {
	teamID := c.GetUint("team_id")
	userID := c.GetUint("user_id")

	// Only team owner can manage AI settings
	if !services.IsTeamOwner(userID, teamID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only team owner can manage AI settings"})
		return
	}

	var req models.AISettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate provider
	validProviders := map[string]bool{"openai": true}
	if req.Provider != "" && !validProviders[req.Provider] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid provider. Supported: openai"})
		return
	}

	// Validate model
	validModels := map[string]bool{
		"gpt-4o":        true,
		"gpt-4o-mini":   true,
		"gpt-4-turbo":   true,
		"gpt-3.5-turbo": true,
		"o1":            true,
		"o1-mini":       true,
		"o3-mini":       true,
	}
	if req.Model != "" && !validModels[req.Model] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid model. Supported: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, o1, o1-mini, o3-mini"})
		return
	}

	var settings models.TeamAISettings
	result := database.DB.Where("team_id = ?", teamID).First(&settings)

	if result.Error != nil {
		// Create new
		settings = models.TeamAISettings{
			TeamID:    teamID,
			APIKey:    req.APIKey,
			Provider:  defaultString(req.Provider, "openai"),
			Model:     defaultString(req.Model, "gpt-4o-mini"),
			IsEnabled: true,
		}
		if err := database.DB.Create(&settings).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save AI settings"})
			return
		}
	} else {
		// Update existing
		if req.APIKey != "" {
			settings.APIKey = req.APIKey
		}
		if req.Provider != "" {
			settings.Provider = req.Provider
		}
		if req.Model != "" {
			settings.Model = req.Model
		}
		settings.IsEnabled = true
		if err := database.DB.Save(&settings).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update AI settings"})
			return
		}
	}

	c.JSON(http.StatusOK, models.AISettingsResponse{
		ID:         settings.ID,
		TeamID:     settings.TeamID,
		Provider:   settings.Provider,
		Model:      settings.Model,
		IsEnabled:  settings.IsEnabled,
		HasAPIKey:  settings.APIKey != "",
		KeyPreview: maskAPIKey(settings.APIKey),
		CreatedAt:  settings.CreatedAt,
		UpdatedAt:  settings.UpdatedAt,
	})
}

// DeleteAISettings removes AI settings for a team
func DeleteAISettings(c *gin.Context) {
	teamID := c.GetUint("team_id")
	userID := c.GetUint("user_id")

	if !services.IsTeamOwner(userID, teamID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only team owner can manage AI settings"})
		return
	}

	result := database.DB.Where("team_id = ?", teamID).Delete(&models.TeamAISettings{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "AI settings not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "AI settings deleted"})
}

// AIAnalyzeDBML uses the team's OpenAI key to analyze DBML and return a smart collection structure
func AIAnalyzeDBML(c *gin.Context) {
	teamID := c.GetUint("team_id")

	// Get AI settings
	var settings models.TeamAISettings
	if err := database.DB.Where("team_id = ? AND is_enabled = ?", teamID, true).First(&settings).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "AI is not configured for this team. Go to AI Settings to add your OpenAI API key."})
		return
	}

	var req models.AIAnalyzeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build the prompt for OpenAI
	systemPrompt := `You are an expert database architect and API designer. You analyze DBML (Database Markup Language) schemas and produce smart, logically grouped API collection structures.

Your job:
1. Analyze all tables and their relationships (Ref lines)
2. Identify which tables are CORE business entities vs. auxiliary/junction tables
3. Group related tables into logical domains (e.g., "User Management", "Orders & Payments", "Products & Catalog")
4. For each group, identify the correct auth flow tables (tables used for login/register - usually containing login, password, role_id, client_type_id fields)
5. Determine which tables are essential and which are secondary/internal
6. For auth-related tables, generate proper Login and Register request bodies using the actual field names from the schema

IMPORTANT RULES:
- Respond ONLY with valid JSON, no markdown, no explanation
- Group tables into logical domains with clear names
- Mark tables as "essential" (true/false) - essential means a developer would commonly need CRUD for it
- For tables with login/password fields, include them in an "auth_tables" list with suggested register/login body fields
- Include the relationships between tables in each group
- The response must follow this exact JSON structure:

{
  "project_summary": "Brief description of what this project appears to be",
  "domains": [
    {
      "name": "Domain Name",
      "icon": "emoji",
      "description": "What this domain handles",
      "tables": [
        {
          "name": "table_name",
          "essential": true,
          "purpose": "Brief purpose",
          "auth_type": null
        }
      ]
    }
  ],
  "auth_tables": [
    {
      "table_name": "clients",
      "auth_type": "client",
      "login_fields": ["login", "password"],
      "register_fields": {"login": "", "password": "", "first_name": "", "last_name": "", "email": "", "phone": ""},
      "login_body": {"login": "", "password": ""},
      "has_roles": true,
      "client_type_table": "client_type"
    }
  ],
  "skip_tables": ["table_names_that_are_empty_or_pure_junction_tables_with_no_useful_fields"],
  "table_count_total": 0,
  "table_count_essential": 0,
  "table_count_skipped": 0
}`

	userPrompt := fmt.Sprintf("Analyze this DBML schema and return the JSON structure:\n\n%s", req.DBML)

	// Call OpenAI API
	aiResponse, err := callOpenAI(settings.APIKey, settings.Model, systemPrompt, userPrompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("AI analysis failed: %v", err)})
		return
	}

	// Try to parse the AI response as JSON to validate it
	var analysisResult map[string]interface{}
	if err := json.Unmarshal([]byte(aiResponse), &analysisResult); err != nil {
		// Try to extract JSON from markdown code blocks
		cleaned := extractJSON(aiResponse)
		if err2 := json.Unmarshal([]byte(cleaned), &analysisResult); err2 != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":        "AI returned invalid JSON",
				"raw_response": aiResponse,
			})
			return
		}
		aiResponse = cleaned
	}

	c.JSON(http.StatusOK, gin.H{
		"analysis": json.RawMessage(aiResponse),
		"model":    settings.Model,
		"provider": settings.Provider,
	})
}

// callOpenAI makes a request to the OpenAI Chat Completions API
func callOpenAI(apiKey, model, systemPrompt, userPrompt string) (string, error) {
	reqBody := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"temperature":     0.2,
		"max_tokens":      8000,
		"response_format": map[string]string{"type": "json_object"},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(jsonBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]interface{}
		json.Unmarshal(body, &errResp)
		if errObj, ok := errResp["error"].(map[string]interface{}); ok {
			return "", fmt.Errorf("OpenAI API error (%d): %v", resp.StatusCode, errObj["message"])
		}
		return "", fmt.Errorf("OpenAI API error (%d): %s", resp.StatusCode, string(body))
	}

	var openAIResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(body, &openAIResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI model")
	}

	return openAIResp.Choices[0].Message.Content, nil
}

// maskAPIKey returns a masked version like "sk-...xyz"
func maskAPIKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 8 {
		return "***"
	}
	return key[:3] + "..." + key[len(key)-3:]
}

// defaultString returns the value if non-empty, otherwise the fallback
func defaultString(val, fallback string) string {
	if val == "" {
		return fallback
	}
	return val
}

// extractJSON attempts to extract JSON from a string that might have markdown code blocks
func extractJSON(s string) string {
	// Try to find JSON between ```json and ```
	if idx := strings.Index(s, "```json"); idx != -1 {
		s = s[idx+7:]
		if end := strings.Index(s, "```"); end != -1 {
			s = s[:end]
		}
	} else if idx := strings.Index(s, "```"); idx != -1 {
		s = s[idx+3:]
		if end := strings.Index(s, "```"); end != -1 {
			s = s[:end]
		}
	}
	return strings.TrimSpace(s)
}
