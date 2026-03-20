package services

import (
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"postmanxodja/models"
	"strings"
	"time"
)

// rewriteLocalhostURL rewrites localhost / 127.0.0.1 URLs so that requests
// made from inside a Docker container reach the host machine.
// When DOCKER_HOST_OVERRIDE is set (e.g. "host.docker.internal") the host
// portion of the URL is replaced.  Falls back to the original URL when not
// running in Docker or the env var is unset.
func RewriteLocalhostURL(rawURL string) string {
	override := os.Getenv("DOCKER_HOST_OVERRIDE")
	if override == "" {
		// Auto-detect: if /proc/1/cgroup exists we're likely in a container
		if _, err := os.Stat("/.dockerenv"); err == nil {
			override = "host.docker.internal"
		} else {
			return rawURL
		}
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}

	host := parsed.Hostname()
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		port := parsed.Port()
		if port != "" {
			parsed.Host = net.JoinHostPort(override, port)
		} else {
			parsed.Host = override
		}
		return parsed.String()
	}

	return rawURL
}

// isLocalhostURL returns true when the target is a loopback / private address.
func isLocalhostURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1" ||
		strings.HasPrefix(host, "192.168.") ||
		strings.HasPrefix(host, "10.") ||
		strings.HasPrefix(host, "172.")
}

// httpClientFor returns an *http.Client that is appropriate for the target URL.
// For localhost / private-network targets it disables TLS verification and
// allows plain HTTP.
func HttpClientFor(targetURL string) *http.Client {
	if isLocalhostURL(targetURL) {
		return &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		}
	}
	return &http.Client{
		Timeout: 30 * time.Second,
	}
}

// ExecuteHTTPRequest executes an HTTP request and returns the response
func ExecuteHTTPRequest(req *models.ExecuteRequest) (*models.ExecuteResponse, error) {
	// Validate URL
	if req.URL == "" {
		return nil, errors.New("URL is required")
	}

	startTime := time.Now()

	// Build URL with query parameters
	fullURL := req.URL
	if len(req.QueryParams) > 0 {
		// Parse existing URL to handle query params properly
		parsedURL, err := url.Parse(fullURL)
		if err == nil {
			existingParams := parsedURL.Query()
			for key, value := range req.QueryParams {
				// Only add if not already in URL
				if existingParams.Get(key) == "" {
					existingParams.Add(key, value)
				}
			}
			parsedURL.RawQuery = existingParams.Encode()
			fullURL = parsedURL.String()
		} else {
			// Fallback to simple concatenation if URL parsing fails
			params := url.Values{}
			for key, value := range req.QueryParams {
				params.Add(key, value)
			}
			if strings.Contains(fullURL, "?") {
				fullURL += "&" + params.Encode()
			} else {
				fullURL += "?" + params.Encode()
			}
		}
	}

	// Rewrite localhost URLs when running inside Docker
	fullURL = RewriteLocalhostURL(fullURL)

	// Create request
	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	httpReq, err := http.NewRequest(req.Method, fullURL, bodyReader)
	if err != nil {
		return nil, err
	}

	// Add headers
	for key, value := range req.Headers {
		httpReq.Header.Set(key, value)
	}

	// Use a client appropriate for the target (relaxed TLS for localhost)
	client := HttpClientFor(fullURL)
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Read response body
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Calculate elapsed time
	elapsed := time.Since(startTime).Milliseconds()

	// Build response headers map
	respHeaders := make(map[string]string)
	for key, values := range resp.Header {
		if len(values) > 0 {
			respHeaders[key] = values[0]
		}
	}

	return &models.ExecuteResponse{
		Status:     resp.StatusCode,
		StatusText: resp.Status,
		Headers:    respHeaders,
		Body:       string(bodyBytes),
		Time:       elapsed,
	}, nil
}
