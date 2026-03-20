package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"postmanxodja/database"
	"postmanxodja/models"
	"postmanxodja/services"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ExecuteRequest executes an HTTP request with variable substitution
func ExecuteRequest(c *gin.Context) {
	var req models.ExecuteRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Failed to bind JSON: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Executing request: %s %s", req.Method, req.URL)

	// Get environment variables if environment ID is provided
	var variables models.Variables
	if req.EnvironmentID != nil {
		var env models.Environment
		if err := database.GetDB().First(&env, *req.EnvironmentID).Error; err == nil {
			variables = env.Variables
			log.Printf("Loaded %d variables from environment: %s", len(variables), env.Name)
		} else {
			log.Printf("Failed to load environment ID %d: %v", *req.EnvironmentID, err)
		}
	}

	// Replace variables in request
	if len(variables) > 0 {
		log.Printf("Replacing variables in request. URL before: %s", req.URL)
		services.ReplaceInRequest(&req, variables)
		log.Printf("URL after variable replacement: %s", req.URL)
	}

	// Execute the request
	response, err := services.ExecuteHTTPRequest(&req)
	log.Default().Print(response, "heeeeeereee reponse")
	if err != nil {
		log.Printf("Request execution failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// RequestMeta represents the metadata sent with multipart requests
type RequestMeta struct {
	Method        string            `json:"method"`
	URL           string            `json:"url"`
	Headers       map[string]string `json:"headers"`
	QueryParams   map[string]string `json:"query_params"`
	EnvironmentID *uint             `json:"environment_id"`
	BodyType      string            `json:"body_type"`
}

// ExecuteMultipartRequest handles multipart form-data requests with file uploads
func ExecuteMultipartRequest(c *gin.Context) {
	// Parse multipart form (32 MB max memory)
	if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
		log.Printf("Failed to parse multipart form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse multipart form: " + err.Error()})
		return
	}

	// Get request metadata
	metaJSON := c.Request.FormValue("_request_meta")
	if metaJSON == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "_request_meta is required"})
		return
	}

	var meta RequestMeta
	if err := json.Unmarshal([]byte(metaJSON), &meta); err != nil {
		log.Printf("Failed to parse request meta: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid _request_meta JSON: " + err.Error()})
		return
	}

	log.Printf("Executing multipart request: %s %s", meta.Method, meta.URL)

	// Get environment variables if environment ID is provided
	var variables models.Variables
	if meta.EnvironmentID != nil {
		var env models.Environment
		if err := database.GetDB().First(&env, *meta.EnvironmentID).Error; err == nil {
			variables = env.Variables
			log.Printf("Loaded %d variables from environment: %s", len(variables), env.Name)
		}
	}

	// Replace variables in URL
	targetURL := meta.URL
	if len(variables) > 0 {
		targetURL = services.ReplaceVariables(targetURL, variables)
	}

	// Rewrite localhost URLs when running inside Docker
	targetURL = services.RewriteLocalhostURL(targetURL)

	// Build URL with query parameters
	if len(meta.QueryParams) > 0 {
		parsedURL, err := url.Parse(targetURL)
		if err == nil {
			existingParams := parsedURL.Query()
			for key, value := range meta.QueryParams {
				replacedValue := value
				if len(variables) > 0 {
					replacedValue = services.ReplaceVariables(value, variables)
				}
				if existingParams.Get(key) == "" {
					existingParams.Add(key, replacedValue)
				}
			}
			parsedURL.RawQuery = existingParams.Encode()
			targetURL = parsedURL.String()
		}
	}

	// Collect form data items from the incoming request
	type formItem struct {
		key      string
		value    string
		isFile   bool
		file     multipart.File
		filename string
	}

	var formItems []formItem
	fileRegex := regexp.MustCompile(`^file_(\d+)$`)
	textKeyRegex := regexp.MustCompile(`^text_(\d+)_key$`)

	// Process files
	if c.Request.MultipartForm != nil && c.Request.MultipartForm.File != nil {
		for fieldName, fileHeaders := range c.Request.MultipartForm.File {
			matches := fileRegex.FindStringSubmatch(fieldName)
			if matches != nil && len(fileHeaders) > 0 {
				index := matches[1]
				keyField := "file_" + index + "_key"
				key := c.Request.FormValue(keyField)
				if key == "" {
					key = fieldName
				}

				file, err := fileHeaders[0].Open()
				if err != nil {
					log.Printf("Failed to open uploaded file: %v", err)
					continue
				}

				formItems = append(formItems, formItem{
					key:      key,
					isFile:   true,
					file:     file,
					filename: fileHeaders[0].Filename,
				})
			}
		}
	}

	// Process text fields
	if c.Request.MultipartForm != nil && c.Request.MultipartForm.Value != nil {
		for fieldName := range c.Request.MultipartForm.Value {
			matches := textKeyRegex.FindStringSubmatch(fieldName)
			if matches != nil {
				index := matches[1]
				key := c.Request.FormValue("text_" + index + "_key")
				value := c.Request.FormValue("text_" + index + "_value")

				if len(variables) > 0 {
					key = services.ReplaceVariables(key, variables)
					value = services.ReplaceVariables(value, variables)
				}

				formItems = append(formItems, formItem{
					key:    key,
					value:  value,
					isFile: false,
				})
			}
		}
	}

	startTime := time.Now()

	// Build the outgoing multipart request
	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)

	for _, item := range formItems {
		if item.isFile {
			part, err := writer.CreateFormFile(item.key, item.filename)
			if err != nil {
				log.Printf("Failed to create form file: %v", err)
				continue
			}
			io.Copy(part, item.file)
			item.file.Close()
		} else {
			writer.WriteField(item.key, item.value)
		}
	}
	writer.Close()

	// Create the HTTP request
	httpReq, err := http.NewRequest(meta.Method, targetURL, &requestBody)
	if err != nil {
		log.Printf("Failed to create request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request: " + err.Error()})
		return
	}

	// Set Content-Type with boundary
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	// Add custom headers (but don't override Content-Type)
	for key, value := range meta.Headers {
		if !strings.EqualFold(key, "Content-Type") {
			replacedValue := value
			if len(variables) > 0 {
				replacedValue = services.ReplaceVariables(value, variables)
			}
			httpReq.Header.Set(key, replacedValue)
		}
	}

	// Execute the request (relaxed TLS for localhost)
	client := services.HttpClientFor(targetURL)
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("Request execution failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Request failed: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	// Read response body
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Failed to read response body: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response: " + err.Error()})
		return
	}

	elapsed := time.Since(startTime).Milliseconds()

	// Build response headers map
	respHeaders := make(map[string]string)
	for key, values := range resp.Header {
		if len(values) > 0 {
			respHeaders[key] = values[0]
		}
	}

	c.JSON(http.StatusOK, models.ExecuteResponse{
		Status:     resp.StatusCode,
		StatusText: resp.Status,
		Headers:    respHeaders,
		Body:       string(bodyBytes),
		Time:       elapsed,
	})
}
