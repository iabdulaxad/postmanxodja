package handlers

import (
	"net/http"
	"postmanxodja/database"
	"postmanxodja/models"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GetEnvironments returns all environments for a team
func GetEnvironments(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var environments []models.Environment

	if err := database.GetDB().Where("team_id = ?", teamID).Find(&environments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch environments"})
		return
	}

	c.JSON(http.StatusOK, environments)
}

// CreateEnvironment creates a new environment
func CreateEnvironment(c *gin.Context) {
	teamID := c.GetUint("team_id")

	var env models.Environment

	if err := c.ShouldBindJSON(&env); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	env.TeamID = &teamID

	if err := database.GetDB().Create(&env).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create environment"})
		return
	}

	c.JSON(http.StatusOK, env)
}

// UpdateEnvironment updates an environment
func UpdateEnvironment(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")
	envID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	var env models.Environment
	if err := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).First(&env).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Environment not found"})
		return
	}

	var updates models.Environment
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	env.Name = updates.Name
	env.Variables = updates.Variables

	if err := database.GetDB().Save(&env).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update environment"})
		return
	}

	c.JSON(http.StatusOK, env)
}

// DeleteEnvironment deletes an environment
func DeleteEnvironment(c *gin.Context) {
	teamID := c.GetUint("team_id")
	id := c.Param("id")
	envID, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment ID"})
		return
	}

	result := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).Delete(&models.Environment{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Environment not found"})
		return
	}

	// Clear environment_id from collections that referenced this environment
	database.GetDB().Model(&models.Collection{}).
		Where("environment_id = ? AND team_id = ?", envID, teamID).
		Update("environment_id", nil)

	c.JSON(http.StatusOK, gin.H{"message": "Environment deleted successfully"})
}
