package database

import (
	"fmt"
	"log"
	"os"
	"postmanxodja/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

// InitDB initializes the database connection
func InitDB() error {
	// Get database connection string from environment or use default
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=postgres dbname=postmanxodja port=5432 sslmode=disable"
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Auto-migrate models
	if err := DB.AutoMigrate(
		&models.User{},
		&models.Team{},
		&models.TeamMember{},
		&models.TeamInvite{},
		&models.TeamAPIKey{},
		&models.TeamAISettings{},
		&models.Collection{},
		&models.Environment{},
		&models.SavedTab{},
	); err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	log.Println("Database connected and migrated successfully")
	return nil
}

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return DB
}
