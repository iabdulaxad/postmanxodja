package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"postmanxodja/database"
	"postmanxodja/models"
	"postmanxodja/services"

	"github.com/gin-gonic/gin"
)

// generateAPIKey generates a secure random API key
func generateAPIKey() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return "pmx_" + hex.EncodeToString(bytes), nil
}

// CreateAPIKey creates a new API key for a team
func CreateAPIKey(c *gin.Context) {
	teamID := c.GetUint("team_id")
	userID := c.GetUint("user_id")

	// Only team owners can create API keys
	if !services.IsTeamOwner(userID, teamID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only team owners can create API keys"})
		return
	}

	var req models.CreateAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate permissions
	if req.Permissions == "" {
		req.Permissions = "read"
	}
	if req.Permissions != "read" && req.Permissions != "write" && req.Permissions != "read_write" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid permissions. Must be: read, write, or read_write"})
		return
	}

	// Generate API key
	key, err := generateAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate API key"})
		return
	}

	apiKey := models.TeamAPIKey{
		TeamID:      teamID,
		Name:        req.Name,
		Key:         key,
		KeyPrefix:   key[:12], // "pmx_" + first 8 hex chars
		Permissions: req.Permissions,
		CreatedBy:   userID,
	}

	// Set expiration if specified
	if req.ExpiresIn > 0 {
		expiresAt := time.Now().AddDate(0, 0, req.ExpiresIn)
		apiKey.ExpiresAt = &expiresAt
	}

	if err := database.GetDB().Create(&apiKey).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create API key"})
		return
	}

	// Return response with full key (only shown once)
	c.JSON(http.StatusCreated, models.APIKeyResponse{
		ID:          apiKey.ID,
		TeamID:      apiKey.TeamID,
		Name:        apiKey.Name,
		Key:         key, // Only returned on creation
		KeyPrefix:   apiKey.KeyPrefix,
		Permissions: apiKey.Permissions,
		LastUsedAt:  apiKey.LastUsedAt,
		ExpiresAt:   apiKey.ExpiresAt,
		CreatedAt:   apiKey.CreatedAt,
	})
}

// GetAPIKeys returns all API keys for a team
func GetAPIKeys(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var keys []models.TeamAPIKey
	if err := database.GetDB().Where("team_id = ?", teamID).Find(&keys).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch API keys"})
		return
	}

	// Convert to response format (without full keys)
	response := make([]models.APIKeyResponse, len(keys))
	for i, key := range keys {
		response[i] = models.APIKeyResponse{
			ID:          key.ID,
			TeamID:      key.TeamID,
			Name:        key.Name,
			KeyPrefix:   key.KeyPrefix,
			Permissions: key.Permissions,
			LastUsedAt:  key.LastUsedAt,
			ExpiresAt:   key.ExpiresAt,
			CreatedAt:   key.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, response)
}

// DeleteAPIKey deletes an API key
func DeleteAPIKey(c *gin.Context) {
	teamID := c.GetUint("team_id")
	userID := c.GetUint("user_id")
	keyID := c.Param("key_id")

	// Only team owners can delete API keys
	if !services.IsTeamOwner(userID, teamID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only team owners can delete API keys"})
		return
	}

	keyIDInt, err := strconv.ParseUint(keyID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid key ID"})
		return
	}

	result := database.GetDB().Where("id = ? AND team_id = ?", keyIDInt, teamID).Delete(&models.TeamAPIKey{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "API key deleted successfully"})
}

// ============================================================
// Public API endpoints (authenticated via API key)
// ============================================================

// PublicGetCollections returns all collections for the team
func PublicGetCollections(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var collections []models.Collection
	if err := database.GetDB().Where("team_id = ?", teamID).Find(&collections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch collections"})
		return
	}

	c.JSON(http.StatusOK, collections)
}

// PublicGetCollection returns a specific collection with full details
func PublicGetCollection(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")

	collectionID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
		return
	}

	var collection models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", collectionID, teamID).First(&collection).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	// Parse the raw JSON to return structured data
	parsed, err := services.ParsePostmanCollection(collection.RawJSON)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse collection"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          collection.ID,
		"name":        collection.Name,
		"description": collection.Description,
		"team_id":     collection.TeamID,
		"created_at":  collection.CreatedAt,
		"collection":  parsed,
	})
}

// PublicGetCollectionRaw returns the raw JSON of a collection
func PublicGetCollectionRaw(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")

	collectionID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
		return
	}

	var collection models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", collectionID, teamID).First(&collection).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	c.Header("Content-Type", "application/json")
	c.String(http.StatusOK, collection.RawJSON)
}

// PublicUpdateCollection updates a collection's raw JSON
func PublicUpdateCollection(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")

	collectionID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
		return
	}

	var req struct {
		RawJSON string `json:"raw_json" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate it's a valid collection
	parsed, err := services.ParsePostmanCollection(req.RawJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection format"})
		return
	}

	// Get existing collection
	var collection models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", collectionID, teamID).First(&collection).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	// Update
	name, description := services.ExtractCollectionInfo(parsed)
	collection.RawJSON = req.RawJSON
	collection.Name = name
	collection.Description = description

	if err := database.GetDB().Save(&collection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update collection"})
		return
	}

	c.JSON(http.StatusOK, collection)
}

// PublicCreateCollection creates a new collection
// Accepts either:
// 1. {"raw_json": "..."} - raw JSON string of collection
// 2. {"name": "...", "description": "..."} - create empty collection
// 3. Direct Postman collection JSON: {"info": {...}, "item": [...]}
func PublicCreateCollection(c *gin.Context) {
	teamID := c.GetUint("team_id")

	// First, try to read raw body
	bodyBytes, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}

	var rawJSON string
	var name, description string

	// Try to parse as wrapper format first
	var wrapperReq struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		RawJSON     string `json:"raw_json"`
	}

	if err := json.Unmarshal(bodyBytes, &wrapperReq); err == nil && (wrapperReq.RawJSON != "" || wrapperReq.Name != "") {
		// Wrapper format detected
		if wrapperReq.RawJSON != "" {
			parsed, err := services.ParsePostmanCollection(wrapperReq.RawJSON)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection format in raw_json"})
				return
			}
			rawJSON = wrapperReq.RawJSON
			name, description = services.ExtractCollectionInfo(parsed)
		} else {
			rawJSON = services.CreateEmptyCollection(wrapperReq.Name, wrapperReq.Description)
			name = wrapperReq.Name
			description = wrapperReq.Description
		}
	} else {
		// Try to parse as direct Postman collection format
		parsed, err := services.ParsePostmanCollection(string(bodyBytes))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format. Send either {\"raw_json\": \"...\"} or direct Postman collection JSON"})
			return
		}
		rawJSON = string(bodyBytes)
		name, description = services.ExtractCollectionInfo(parsed)
	}

	// Check if collection with same name already exists for this team
	var existingCollection models.Collection
	if err := database.GetDB().Where("name = ? AND team_id = ?", name, teamID).First(&existingCollection).Error; err == nil {
		// Collection exists - update it instead of creating duplicate
		existingCollection.RawJSON = rawJSON
		existingCollection.Description = description
		if err := database.GetDB().Save(&existingCollection).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update existing collection"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":    "Collection updated (already existed)",
			"collection": existingCollection,
		})
		return
	}

	// Create new collection
	dbCollection := models.Collection{
		Name:        name,
		Description: description,
		RawJSON:     rawJSON,
		TeamID:      &teamID,
	}

	if err := database.GetDB().Create(&dbCollection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create collection"})
		return
	}

	c.JSON(http.StatusCreated, dbCollection)
}

// PublicDeleteCollection deletes a collection
func PublicDeleteCollection(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")

	collectionID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
		return
	}

	result := database.GetDB().Where("id = ? AND team_id = ?", collectionID, teamID).Delete(&models.Collection{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Collection deleted successfully"})
}
