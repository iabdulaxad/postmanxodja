package models

import "time"

// Collection represents a stored Postman collection in database
type Collection struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	RawJSON     string    `json:"raw_json" gorm:"type:text"`
	TeamID      *uint     `json:"team_id" gorm:"index"`
	CreatedAt   time.Time `json:"created_at"`
}

// PostmanCollection represents Postman Collection v2.1 format
type PostmanCollection struct {
	Info     PostmanInfo       `json:"info"`
	Item     []PostmanItem     `json:"item"`
	Variable []PostmanVariable `json:"variable,omitempty"`
}

type PostmanInfo struct {
	PostmanID      string `json:"_postman_id,omitempty"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	Schema         string `json:"schema"`
	ExporterID     string `json:"_exporter_id,omitempty"`
	CollectionLink string `json:"_collection_link,omitempty"`
}

type PostmanItem struct {
	Name     string            `json:"name"`
	Request  *PostmanRequest   `json:"request,omitempty"`
	Response []PostmanResponse `json:"response,omitempty"` // Saved example responses
	Item     []PostmanItem     `json:"item"`               // For folders
}

// PostmanResponse represents a saved example response (Postman collection v2.1 format)
type PostmanResponse struct {
	Name            string            `json:"name"`
	OriginalRequest *PostmanRequest   `json:"originalRequest,omitempty"`
	Status          string            `json:"status"`
	Code            int               `json:"code"`
	Header          []PostmanKeyValue `json:"header,omitempty"`
	Body            string            `json:"body"`
	ResponseTime    int64             `json:"responseTime,omitempty"`
}

type PostmanRequest struct {
	Auth   *PostmanAuth        `json:"auth,omitempty"`
	Method string              `json:"method"`
	Header []PostmanKeyValue   `json:"header,omitempty"`
	Body   *PostmanRequestBody `json:"body,omitempty"`
	URL    interface{}         `json:"url"` // Can be string or PostmanURL
}

// PostmanAuth represents authentication configuration
type PostmanAuth struct {
	Type   string                 `json:"type"` // bearer, basic, apikey, oauth2, etc.
	Bearer []PostmanAuthParameter `json:"bearer,omitempty"`
	Basic  []PostmanAuthParameter `json:"basic,omitempty"`
	Apikey []PostmanAuthParameter `json:"apikey,omitempty"`
	OAuth2 []PostmanAuthParameter `json:"oauth2,omitempty"`
}

// PostmanAuthParameter represents auth key-value pairs
type PostmanAuthParameter struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Type  string `json:"type,omitempty"`
}

type PostmanURL struct {
	Raw      string            `json:"raw"`
	Protocol string            `json:"protocol,omitempty"`
	Host     []string          `json:"host,omitempty"`
	Path     []string          `json:"path,omitempty"`
	Query    []PostmanKeyValue `json:"query,omitempty"`
}

type PostmanKeyValue struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled,omitempty"`
}

type PostmanRequestBody struct {
	Mode    string              `json:"mode"` // raw, formdata, urlencoded
	Raw     string              `json:"raw,omitempty"`
	Options *PostmanBodyOptions `json:"options,omitempty"`
}

type PostmanBodyOptions struct {
	Raw *PostmanRawOptions `json:"raw,omitempty"`
}

type PostmanRawOptions struct {
	Language string `json:"language,omitempty"`
}

type PostmanVariable struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Type  string `json:"type,omitempty"`
}
