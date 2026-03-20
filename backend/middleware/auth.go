package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"postmanxodja/database"
	"postmanxodja/models"
	"postmanxodja/services"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			return
		}

		claims, err := services.ValidateJWT(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("email", claims.Email)
		c.Next()
	}
}

func TeamAccessMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetUint("user_id")
		teamIDStr := c.Param("team_id")

		if teamIDStr == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Team ID required"})
			return
		}

		teamID, err := strconv.ParseUint(teamIDStr, 10, 32)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Invalid team ID"})
			return
		}

		if !services.UserBelongsToTeam(userID, uint(teamID)) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Access denied to this team"})
			return
		}

		c.Set("team_id", uint(teamID))
		c.Next()
	}
}

func TeamOwnerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetUint("user_id")
		teamID := c.GetUint("team_id")

		if !services.IsTeamOwner(userID, teamID) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Only team owner can perform this action"})
			return
		}

		c.Next()
	}
}

// APIKeyMiddleware authenticates requests using API keys for third-party access
func APIKeyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			// Also check Authorization header with "ApiKey" scheme
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "ApiKey ") {
				apiKey = strings.TrimPrefix(authHeader, "ApiKey ")
			}
		}

		if apiKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "API key required"})
			return
		}

		// Find the API key in database
		var keyRecord models.TeamAPIKey
		if err := database.GetDB().Where("key = ?", apiKey).First(&keyRecord).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid API key"})
			return
		}

		// Check if key is expired
		if keyRecord.ExpiresAt != nil && keyRecord.ExpiresAt.Before(time.Now()) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "API key has expired"})
			return
		}

		// Update last used timestamp
		now := time.Now()
		database.GetDB().Model(&keyRecord).Update("last_used_at", now)

		// Set team_id and permissions in context
		c.Set("team_id", keyRecord.TeamID)
		c.Set("api_key_id", keyRecord.ID)
		c.Set("api_key_permissions", keyRecord.Permissions)
		c.Next()
	}
}

// RequireWritePermission checks if the API key has write permissions
func RequireWritePermission() gin.HandlerFunc {
	return func(c *gin.Context) {
		permissions := c.GetString("api_key_permissions")
		if permissions != "write" && permissions != "read_write" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Write permission required"})
			return
		}
		c.Next()
	}
}
