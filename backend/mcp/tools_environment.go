package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"postmanxodja/database"
	"postmanxodja/models"

	mcpsdk "github.com/mark3labs/mcp-go/mcp"
)

// ---- tool definitions ----

func createEnvironmentTool() mcpsdk.Tool {
	return mcpsdk.NewTool("create_environment",
		mcpsdk.WithDescription("Create a new environment for a team."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithString("name", mcpsdk.Required(), mcpsdk.Description("Environment name.")),
		mcpsdk.WithString("variables", mcpsdk.Description(`Initial variables as a JSON object, e.g. {"base_url":"https://api.example.com","token":"abc123"}.`)),
	)
}

func getEnvironmentTool() mcpsdk.Tool {
	return mcpsdk.NewTool("get_environment",
		mcpsdk.WithDescription("Get an environment with all its variables."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("environment_id", mcpsdk.Required(), mcpsdk.Description("Environment ID.")),
	)
}

func updateEnvironmentTool() mcpsdk.Tool {
	return mcpsdk.NewTool("update_environment",
		mcpsdk.WithDescription("Update an environment's name, variables, or both. Providing variables replaces the entire variable map."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("environment_id", mcpsdk.Required(), mcpsdk.Description("Environment ID.")),
		mcpsdk.WithString("name", mcpsdk.Description("New environment name.")),
		mcpsdk.WithString("variables", mcpsdk.Description(`Complete variable map as JSON object. Replaces all existing variables.`)),
	)
}

func deleteEnvironmentTool() mcpsdk.Tool {
	return mcpsdk.NewTool("delete_environment",
		mcpsdk.WithDescription("Delete an environment permanently and unlink it from any collections."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("environment_id", mcpsdk.Required(), mcpsdk.Description("Environment ID.")),
	)
}

func setEnvVariableTool() mcpsdk.Tool {
	return mcpsdk.NewTool("set_env_variable",
		mcpsdk.WithDescription("Add or update a single variable in an environment."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("environment_id", mcpsdk.Required(), mcpsdk.Description("Environment ID.")),
		mcpsdk.WithString("key", mcpsdk.Required(), mcpsdk.Description("Variable name.")),
		mcpsdk.WithString("value", mcpsdk.Required(), mcpsdk.Description("Variable value.")),
	)
}

func deleteEnvVariableTool() mcpsdk.Tool {
	return mcpsdk.NewTool("delete_env_variable",
		mcpsdk.WithDescription("Remove a single variable from an environment by key."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("environment_id", mcpsdk.Required(), mcpsdk.Description("Environment ID.")),
		mcpsdk.WithString("key", mcpsdk.Required(), mcpsdk.Description("Variable name to remove.")),
	)
}

// ---- handlers ----

func createEnvironmentHandler(_ context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := numParam(req, "team_id")
	if err != nil {
		return errResult(err.Error())
	}
	name := strParam(req, "name")
	if name == "" {
		return errResult("name is required")
	}

	vars := make(models.Variables)
	if v := strParam(req, "variables"); v != "" {
		if err := json.Unmarshal([]byte(v), &vars); err != nil {
			return errResult("invalid variables JSON: " + err.Error())
		}
	}

	env := models.Environment{
		Name:      name,
		Variables: vars,
		TeamID:    &teamID,
	}
	if err := database.GetDB().Create(&env).Error; err != nil {
		return errResult("failed to create environment: " + err.Error())
	}
	return jsonResult(env), nil
}

func getEnvironmentHandler(_ context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := numParam(req, "team_id")
	if err != nil {
		return errResult(err.Error())
	}
	envID, err := numParam(req, "environment_id")
	if err != nil {
		return errResult(err.Error())
	}

	var env models.Environment
	if err := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).First(&env).Error; err != nil {
		return errResult("environment not found")
	}
	return jsonResult(env), nil
}

func updateEnvironmentHandler(_ context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := numParam(req, "team_id")
	if err != nil {
		return errResult(err.Error())
	}
	envID, err := numParam(req, "environment_id")
	if err != nil {
		return errResult(err.Error())
	}

	var env models.Environment
	if err := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).First(&env).Error; err != nil {
		return errResult("environment not found")
	}

	if name := strParam(req, "name"); name != "" {
		env.Name = name
	}
	if varsStr := strParam(req, "variables"); varsStr != "" {
		var vars models.Variables
		if err := json.Unmarshal([]byte(varsStr), &vars); err != nil {
			return errResult("invalid variables JSON: " + err.Error())
		}
		env.Variables = vars
	}

	if err := database.GetDB().Save(&env).Error; err != nil {
		return errResult("failed to update environment: " + err.Error())
	}
	return jsonResult(env), nil
}

func deleteEnvironmentHandler(_ context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := numParam(req, "team_id")
	if err != nil {
		return errResult(err.Error())
	}
	envID, err := numParam(req, "environment_id")
	if err != nil {
		return errResult(err.Error())
	}

	result := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).Delete(&models.Environment{})
	if result.RowsAffected == 0 {
		return errResult("environment not found")
	}
	database.GetDB().Model(&models.Collection{}).Where("environment_id = ?", envID).Update("environment_id", nil)
	return textResult(fmt.Sprintf("environment %d deleted", envID)), nil
}

func setEnvVariableHandler(_ context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := numParam(req, "team_id")
	if err != nil {
		return errResult(err.Error())
	}
	envID, err := numParam(req, "environment_id")
	if err != nil {
		return errResult(err.Error())
	}
	key := strParam(req, "key")
	value := strParam(req, "value")
	if key == "" {
		return errResult("key is required")
	}

	var env models.Environment
	if err := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).First(&env).Error; err != nil {
		return errResult("environment not found")
	}

	if env.Variables == nil {
		env.Variables = make(models.Variables)
	}
	env.Variables[key] = value

	if err := database.GetDB().Save(&env).Error; err != nil {
		return errResult("failed to save variable: " + err.Error())
	}
	return jsonResult(env), nil
}

func deleteEnvVariableHandler(_ context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := numParam(req, "team_id")
	if err != nil {
		return errResult(err.Error())
	}
	envID, err := numParam(req, "environment_id")
	if err != nil {
		return errResult(err.Error())
	}
	key := strParam(req, "key")
	if key == "" {
		return errResult("key is required")
	}

	var env models.Environment
	if err := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).First(&env).Error; err != nil {
		return errResult("environment not found")
	}

	if _, exists := env.Variables[key]; !exists {
		return errResult(fmt.Sprintf("variable '%s' not found", key))
	}
	delete(env.Variables, key)

	if err := database.GetDB().Save(&env).Error; err != nil {
		return errResult("failed to delete variable: " + err.Error())
	}
	return jsonResult(env), nil
}
