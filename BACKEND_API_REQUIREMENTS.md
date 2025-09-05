# Backend API Requirements - Updated for Google CSE + GPT-5

The frontend now uses **Google CSE Images** instead of Unsplash and **GPT-5** instead of GPT-4o. Much simpler, pragmatic approach.

## 1. URL Shortening Service

### POST `/api/short-urls`
Create a shortened URL for sharing charts.

**Request:**
```json
{
  "long_url": "https://twoby.ike.rs/v/abc123?s=def456",
  "short_code": "best-movies-abc123", 
  "chart_id": "abc123",
  "is_vote": true,
  "title": "Best Movies Ever"
}
```

**Response:**
```json
{
  "short_url": "https://twoby.ike.rs/s/best-movies-abc123",
  "short_code": "best-movies-abc123",
  "long_url": "https://twoby.ike.rs/v/abc123?s=def456"
}
```

### GET `/s/:short_code`
Redirect short URLs to their full destinations.

**Response:** 302 redirect to the long URL

**Database Schema:**
```sql
CREATE TABLE short_urls (
  id INTEGER PRIMARY KEY,
  short_code TEXT UNIQUE NOT NULL,
  long_url TEXT NOT NULL,
  chart_id TEXT,
  is_vote BOOLEAN DEFAULT FALSE,
  title TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  click_count INTEGER DEFAULT 0
);
```

## 2. AI Services (using latest OpenAI API with **GPT-5**)

### POST `/api/ai/generate-items`
Generate suggested items for a chart.

**Request:**
```json
{
  "title": "Best Programming Languages",
  "description": "Languages for web development",
  "existingItems": ["JavaScript", "Python"],
  "xAxis": "Easy to Learn → Hard to Learn", 
  "yAxis": "Low Performance → High Performance",
  "mode": "two_axis"
}
```

**Response:**
```json
{
  "items": [
    "TypeScript",
    "Go", 
    "Rust",
    "Java",
    "C++"
  ]
}
```

### POST `/api/ai/generate-axes`
Generate X/Y axis suggestions for 2x2 charts.

**Request:**
```json
{
  "title": "Best Streaming Services",
  "items": ["Netflix", "Hulu", "Disney+", "HBO Max", "Prime Video"]
}
```

**Response:**
```json
{
  "x_axis": "Affordable → Expensive",
  "y_axis": "Limited Content → Extensive Library"  
}
```

### POST `/api/ai/generate-description`
Generate engaging chart descriptions.

**Request:**
```json
{
  "title": "Best Coffee Shops", 
  "items": ["Starbucks", "Blue Bottle", "Local Cafe", "Dunkin"]
}
```

**Response:**
```json
{
  "description": "Settle the eternal debate: where do you get the best cup of joe? Vote to create the definitive coffee shop ranking!"
}
```

**OpenAI Integration Notes:**
- Use **GPT-5** (latest model)
- Set appropriate temperature (0.7-0.8 for creativity)
- Include system prompts for context
- Handle rate limiting and errors gracefully
- Store OpenAI API key securely in backend environment

## 3. Google CSE Images Service (Much Simpler!)

### GET `/api/images/search?q=coffee`
Search for images using Google Custom Search Engine.

**Response:**
```json
{
  "results": [
    {
      "id": "abc123",
      "thumbnail": "https://encrypted-tbn0.gstatic.com/images?q=...",
      "full": "https://example.com/coffee.jpg",
      "source": "example.com",
      "contextLink": "https://example.com/page"
    }
  ]
}
```

### POST `/api/images/attach`
Download, normalize, and attach image to an item.

**Body:** `item_id, source_url, chart_id, admin_key`

**Response:**
```json
{
  "success": true,
  "image_url": "/static/images/abc123.webp",
  "dominant_color": "#3B82F6"
}
```

**Google CSE Setup:**
1. Create a Custom Search Engine at: https://cse.google.com/cse/
2. Configure to "Search the entire web"
3. Get your CSE ID and Google API key
4. Cache results 24h to reduce costs

**Google CSE Integration Notes:**
- Much simpler than Unsplash - just one provider
- Auto-appends "logo" to queries for better brand results
- Filters out favicons and small images automatically
- 24-hour file-based caching to cut API costs
- Graceful fallback to placeholder images

## 4. Environment Variables (Backend)

Add these to your backend environment:

```env
# OpenAI for AI features (GPT-5!)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5

# Google CSE for image search
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CSE_ID=your_custom_search_engine_id

# Database
DATABASE_URL=sqlite:///twoby_local.db
```

## 5. Security Considerations

- **API Keys**: Keep all third-party API keys on the backend only
- **Rate Limiting**: Implement rate limiting for AI and image search endpoints
- **Input Validation**: Validate and sanitize all inputs from frontend
- **Error Handling**: Don't expose internal errors or API keys in responses
- **Caching**: Cache AI responses and image search results to reduce costs
- **CORS**: Configure CORS properly for your domain

## 6. Implementation Priority

1. **URL Shortening** (High) - Essential for sharing experience
2. **AI Item Generation** (High) - Core feature for user experience  
3. **Image Search** (Medium) - Nice-to-have for visual appeal
4. **AI Axes/Description** (Medium) - Additional AI enhancements

The frontend is already updated to call these endpoints, so implementing them will immediately enable all the new features.