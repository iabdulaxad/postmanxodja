package main

import (
	"log"
	"postmanxodja/config"
	"postmanxodja/database"
	"postmanxodja/handlers"
	"postmanxodja/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file (from project root)
	if err := godotenv.Load("../.env"); err != nil {
		// Try loading from current directory
		godotenv.Load(".env")
	}

	// Load configuration
	config.LoadConfig()

	// Initialize database
	if err := database.InitDB(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// Initialize OAuth
	handlers.InitOAuth()

	// Create Gin router
	r := gin.Default()

	// Configure CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173", "http://localhost:3000", "https://postbaby.uz", "https://www.postbaby.uz"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-API-Key", "x-api-key"},
		ExposeHeaders:    []string{"Content-Length", "Content-Disposition"},
		AllowCredentials: true,
	}))

	// Health check endpoints
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "postmanxodja"})
	})
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "postmanxodja"})
	})

	// Public auth routes
	auth := r.Group("/api/auth")
	{
		auth.POST("/register", handlers.Register)
		auth.POST("/login", handlers.Login)
		auth.POST("/refresh", handlers.RefreshToken)
		// Google OAuth
		auth.GET("/google", handlers.GoogleLogin)
		auth.GET("/google/callback", handlers.GoogleCallback)
	}

	// Public invite route (to view invite details from email link)
	r.GET("/api/invites/:token", handlers.GetInviteByToken)

	// Protected routes
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())
	{
		// Auth routes (protected)
		api.GET("/auth/me", handlers.GetCurrentUser)
		api.POST("/auth/logout", handlers.Logout)

		// Team routes
		api.GET("/teams", handlers.GetUserTeams)
		api.POST("/teams", handlers.CreateTeam)

		// User's pending invites
		api.GET("/invites", handlers.GetUserInvites)
		api.POST("/invites/:token/accept", handlers.AcceptInvite)
		api.POST("/invites/:token/decline", handlers.DeclineInvite)

		// Request execution (not team-scoped, uses environment_id in body)
		api.POST("/requests/execute", handlers.ExecuteRequest)
		api.POST("/requests/execute-multipart", handlers.ExecuteMultipartRequest)

		// Saved tabs (user-scoped)
		api.GET("/tabs", handlers.GetSavedTabs)
		api.POST("/tabs", handlers.SaveTabs)

		// Team-specific routes (require team membership)
		teamApi := api.Group("/teams/:team_id")
		teamApi.Use(middleware.TeamAccessMiddleware())
		{
			// Team management
			teamApi.GET("", handlers.GetTeam)
			teamApi.PUT("", handlers.UpdateTeam)
			teamApi.DELETE("", handlers.DeleteTeam)

			// Team members
			teamApi.GET("/members", handlers.GetTeamMembers)
			teamApi.DELETE("/members/:user_id", handlers.RemoveTeamMember)
			teamApi.POST("/leave", handlers.LeaveTeam)

			// Team invites
			teamApi.POST("/invites", handlers.CreateInvite)
			teamApi.GET("/invites", handlers.GetTeamInvites)

			// Team collections
			teamApi.GET("/collections", handlers.GetCollections)
			teamApi.POST("/collections", handlers.CreateCollection)
			teamApi.POST("/collections/import", handlers.ImportCollection)
			teamApi.GET("/collections/:id", handlers.GetCollection)
			teamApi.GET("/collections/:id/export", handlers.ExportCollection)
			teamApi.PUT("/collections/:id", handlers.UpdateCollection)
			teamApi.PATCH("/collections/:id/environment", handlers.SetCollectionEnvironment)
			teamApi.DELETE("/collections/:id", handlers.DeleteCollection)

			// Team environments
			teamApi.GET("/environments", handlers.GetEnvironments)
			teamApi.POST("/environments", handlers.CreateEnvironment)
			teamApi.PUT("/environments/:id", handlers.UpdateEnvironment)
			teamApi.DELETE("/environments/:id", handlers.DeleteEnvironment)

			// Team API keys management
			teamApi.GET("/api-keys", handlers.GetAPIKeys)
			teamApi.POST("/api-keys", handlers.CreateAPIKey)
			teamApi.DELETE("/api-keys/:key_id", handlers.DeleteAPIKey)

			// Team AI settings
			teamApi.GET("/ai-settings", handlers.GetAISettings)
			teamApi.PUT("/ai-settings", handlers.UpdateAISettings)
			teamApi.DELETE("/ai-settings", handlers.DeleteAISettings)
			teamApi.POST("/ai-analyze", handlers.AIAnalyzeDBML)
		}
	}

	// Public API routes (authenticated via API key for third-party access)
	publicApi := r.Group("/api/v1")
	publicApi.Use(middleware.APIKeyMiddleware())
	{
		// Collections - read endpoints
		publicApi.GET("/collections", handlers.PublicGetCollections)
		publicApi.GET("/collections/:id", handlers.PublicGetCollection)
		publicApi.GET("/collections/:id/raw", handlers.PublicGetCollectionRaw)

		// Collections - write endpoints (require write permission)
		writeApi := publicApi.Group("")
		writeApi.Use(middleware.RequireWritePermission())
		{
			writeApi.POST("/collections", handlers.PublicCreateCollection)
			writeApi.PUT("/collections/:id", handlers.PublicUpdateCollection)
			writeApi.DELETE("/collections/:id", handlers.PublicDeleteCollection)
		}
	}

	// Start server
	log.Println("Server starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
