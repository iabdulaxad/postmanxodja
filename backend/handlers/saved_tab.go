package handlers

import (
	"encoding/json"
	"net/http"
	"postmanxodja/database"
	"postmanxodja/models"

	"github.com/gin-gonic/gin"
)

type TabRequest struct {
	TabID       string            `json:"tab_id"`
	Name        string            `json:"name"`
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	QueryParams map[string]string `json:"query_params"`
	Docs        string            `json:"docs"`
	IsActive    bool              `json:"is_active"`
	SortOrder   int               `json:"sort_order"`
}

type TabResponse struct {
	ID          uint              `json:"id"`
	TabID       string            `json:"tab_id"`
	Name        string            `json:"name"`
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	QueryParams map[string]string `json:"query_params"`
	Docs        string            `json:"docs"`
	IsActive    bool              `json:"is_active"`
	SortOrder   int               `json:"sort_order"`
}

// GetSavedTabs returns all saved tabs for the current user
func GetSavedTabs(c *gin.Context) {
	userID := c.GetUint("user_id")

	var tabs []models.SavedTab
	if err := database.DB.Where("user_id = ?", userID).Order("sort_order ASC").Find(&tabs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tabs"})
		return
	}

	// Convert to response format
	response := make([]TabResponse, len(tabs))
	for i, tab := range tabs {
		headers := make(map[string]string)
		queryParams := make(map[string]string)

		if tab.Headers != "" {
			json.Unmarshal([]byte(tab.Headers), &headers)
		}
		if tab.QueryParams != "" {
			json.Unmarshal([]byte(tab.QueryParams), &queryParams)
		}

		response[i] = TabResponse{
			ID:          tab.ID,
			TabID:       tab.TabID,
			Name:        tab.Name,
			Method:      tab.Method,
			URL:         tab.URL,
			Headers:     headers,
			Body:        tab.Body,
			QueryParams: queryParams,
			Docs:        tab.Docs,
			IsActive:    tab.IsActive,
			SortOrder:   tab.SortOrder,
		}
	}

	c.JSON(http.StatusOK, response)
}

// SaveTabs saves all tabs for the current user (replaces existing)
func SaveTabs(c *gin.Context) {
	userID := c.GetUint("user_id")

	var req struct {
		Tabs         []TabRequest `json:"tabs"`
		ActiveTabID  string       `json:"active_tab_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Start transaction
	tx := database.DB.Begin()

	// Delete existing tabs for this user
	if err := tx.Where("user_id = ?", userID).Delete(&models.SavedTab{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save tabs"})
		return
	}

	// Insert new tabs
	for i, tab := range req.Tabs {
		headersJSON, _ := json.Marshal(tab.Headers)
		queryParamsJSON, _ := json.Marshal(tab.QueryParams)

		savedTab := models.SavedTab{
			UserID:      userID,
			TabID:       tab.TabID,
			Name:        tab.Name,
			Method:      tab.Method,
			URL:         tab.URL,
			Headers:     string(headersJSON),
			Body:        tab.Body,
			QueryParams: string(queryParamsJSON),
			Docs:        tab.Docs,
			IsActive:    tab.TabID == req.ActiveTabID,
			SortOrder:   i,
		}

		if err := tx.Create(&savedTab).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save tabs"})
			return
		}
	}

	tx.Commit()
	c.JSON(http.StatusOK, gin.H{"message": "Tabs saved successfully"})
}
