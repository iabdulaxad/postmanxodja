package handlers

import (
	"encoding/json"
	"net/http"
	"postmanxodja/database"
	"postmanxodja/models"
	"postmanxodja/services"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// CreateCollection creates a new empty collection
func CreateCollection(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create empty Postman collection format
	rawJSON := services.CreateEmptyCollection(req.Name, req.Description)

	dbCollection := models.Collection{
		Name:        req.Name,
		Description: req.Description,
		RawJSON:     rawJSON,
		TeamID:      &teamID,
	}

	if err := database.GetDB().Create(&dbCollection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create collection"})
		return
	}

	c.JSON(http.StatusCreated, dbCollection)
}

// ImportCollection imports a Postman collection
// Supports mode: "replace" (update existing), "duplicate" (create copy), or "" (detect conflict)
func ImportCollection(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var req struct {
		CollectionJSON string `json:"collection_json" binding:"required"`
		Mode           string `json:"mode"` // "replace", "duplicate", or "" (default: detect conflict)
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse collection
	collection, err := services.ParsePostmanCollection(req.CollectionJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid Postman collection format"})
		return
	}

	// Extract info
	name, description := services.ExtractCollectionInfo(collection)

	// Check for existing collection with same name
	var existing models.Collection
	hasExisting := database.GetDB().Where("name = ? AND team_id = ?", name, teamID).First(&existing).Error == nil

	if hasExisting && req.Mode == "" {
		// Return conflict so frontend can ask user what to do
		c.JSON(http.StatusConflict, gin.H{
			"error":       "Collection with this name already exists",
			"existing_id": existing.ID,
			"name":        name,
		})
		return
	}

	if hasExisting && req.Mode == "replace" {
		// Replace existing collection
		existing.Name = name
		existing.Description = description
		existing.RawJSON = req.CollectionJSON

		// Handle variables — update or create environment
		if len(collection.Variable) > 0 {
			variables := make(models.Variables)
			for _, v := range collection.Variable {
				variables[v.Key] = v.Value
			}

			if existing.EnvironmentID != nil {
				// Update existing linked environment
				database.GetDB().Model(&models.Environment{}).Where("id = ?", *existing.EnvironmentID).Updates(map[string]interface{}{
					"variables": variables,
				})
			} else {
				env := models.Environment{
					Name:      name + " Environment",
					Variables: variables,
					TeamID:    &teamID,
				}
				if err := database.GetDB().Create(&env).Error; err == nil {
					existing.EnvironmentID = &env.ID
				}
			}
		}

		if err := database.GetDB().Save(&existing).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update collection"})
			return
		}

		c.JSON(http.StatusOK, existing)
		return
	}

	// Mode is "duplicate" or no existing collection — create new
	dbCollection := models.Collection{
		Name:        name,
		Description: description,
		RawJSON:     req.CollectionJSON,
		TeamID:      &teamID,
	}

	// If collection has variables, create an environment from them
	if len(collection.Variable) > 0 {
		variables := make(models.Variables)
		for _, v := range collection.Variable {
			variables[v.Key] = v.Value
		}

		env := models.Environment{
			Name:      name + " Environment",
			Variables: variables,
			TeamID:    &teamID,
		}

		if err := database.GetDB().Create(&env).Error; err == nil {
			dbCollection.EnvironmentID = &env.ID
		}
	}

	if err := database.GetDB().Create(&dbCollection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save collection"})
		return
	}

	c.JSON(http.StatusOK, dbCollection)
}

// GetCollections returns all collections for a team
func GetCollections(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var collections []models.Collection

	if err := database.GetDB().Where("team_id = ?", teamID).Find(&collections).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch collections"})
		return
	}

	c.JSON(http.StatusOK, collections)
}

// GetCollection returns a specific collection with full details
func GetCollection(c *gin.Context) {
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
		"id":             collection.ID,
		"name":           collection.Name,
		"description":    collection.Description,
		"team_id":        collection.TeamID,
		"environment_id": collection.EnvironmentID,
		"created_at":     collection.CreatedAt,
		"collection":     parsed,
	})
}

// UpdateCollection updates a collection's raw JSON or name
func UpdateCollection(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")
	collectionID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
		return
	}

	var req struct {
		RawJSON string `json:"raw_json"`
		Name    string `json:"name"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// At least one field must be provided
	if req.RawJSON == "" && req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Either raw_json or name must be provided"})
		return
	}

	// Get existing collection
	var collection models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", collectionID, teamID).First(&collection).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	// If raw_json is provided, validate and update it
	if req.RawJSON != "" {
		parsed, err := services.ParsePostmanCollection(req.RawJSON)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection format"})
			return
		}
		name, description := services.ExtractCollectionInfo(parsed)
		collection.RawJSON = req.RawJSON
		collection.Name = name
		collection.Description = description
	} else if req.Name != "" {
		// Update just the name - need to update both Name field and info.name in raw_json
		collection.Name = req.Name
		// Update the name in raw_json as well
		updatedRawJSON, err := services.UpdateCollectionName(collection.RawJSON, req.Name)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update collection name"})
			return
		}
		collection.RawJSON = updatedRawJSON
	}

	if err := database.GetDB().Save(&collection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update collection"})
		return
	}

	c.JSON(http.StatusOK, collection)
}

// DeleteCollection deletes a collection
func DeleteCollection(c *gin.Context) {
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

// ExportCollection exports a collection in Postman-compatible JSON format
func ExportCollection(c *gin.Context) {
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

	exportJSON := collection.RawJSON

	// If collection has a linked environment, embed its variables
	if collection.EnvironmentID != nil {
		var env models.Environment
		if err := database.GetDB().Where("id = ?", *collection.EnvironmentID).First(&env).Error; err == nil {
			parsed, err := services.ParsePostmanCollection(exportJSON)
			if err == nil {
				vars := make([]models.PostmanVariable, 0, len(env.Variables))
				for key, value := range env.Variables {
					vars = append(vars, models.PostmanVariable{
						Key:   key,
						Value: value,
						Type:  "default",
					})
				}
				parsed.Variable = vars

				updatedJSON, err := json.MarshalIndent(parsed, "", "  ")
				if err == nil {
					exportJSON = string(updatedJSON)
				}
			}
		}
	}

	// Sanitize filename - remove special characters
	filename := collection.Name
	for _, char := range []string{"/", "\\", ":", "*", "?", "\"", "<", ">", "|"} {
		filename = strings.ReplaceAll(filename, char, "_")
	}

	// Set headers for file download
	c.Header("Content-Disposition", "attachment; filename=\""+filename+".postman_collection.json\"")
	c.Header("Content-Type", "application/json")
	c.String(http.StatusOK, exportJSON)
}

// SetCollectionEnvironment links or unlinks an environment to a collection
func SetCollectionEnvironment(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")
	collectionID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid collection ID"})
		return
	}

	var req struct {
		EnvironmentID *uint `json:"environment_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate environment belongs to same team if non-null
	if req.EnvironmentID != nil {
		var env models.Environment
		if err := database.GetDB().Where("id = ? AND team_id = ?", *req.EnvironmentID, teamID).First(&env).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Environment not found"})
			return
		}
	}

	var collection models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", collectionID, teamID).First(&collection).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Collection not found"})
		return
	}

	collection.EnvironmentID = req.EnvironmentID
	if err := database.GetDB().Save(&collection).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update collection"})
		return
	}

	c.JSON(http.StatusOK, collection)
}
