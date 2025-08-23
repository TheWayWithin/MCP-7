# MCP-7 Discovery Engine Components

This directory contains the core components of the MCP-7 GitHub Discovery Engine v3.0.

## Quick Start

```bash
# Run full discovery
node orchestrator.js

# Test individual components
node github-scanner.js
node repo-analyzer.js
node mcp-detector.js
node storage.js
```

## Components

### 🔍 GitHub Scanner (`github-scanner.js`)
Discovers MCP repositories on GitHub using intelligent search patterns.

**Features:**
- Multi-pattern search strategy
- Rate limit handling
- Repository content extraction
- Pagination support

**Usage:**
```javascript
import { GitHubScanner } from './github-scanner.js';
const scanner = new GitHubScanner({ token: 'your_token' });
const repos = await scanner.searchMCPRepositories({ maxResults: 1000 });
```

### 🔬 Repository Analyzer (`repo-analyzer.js`)
Analyzes repository contents to extract MCP-relevant metadata.

**Features:**
- Multi-language package analysis (Node.js, Python, Rust, Go)
- README.md parsing and capability extraction
- Documentation quality assessment
- Installation method detection

**Usage:**
```javascript
import { RepositoryAnalyzer } from './repo-analyzer.js';
const analyzer = new RepositoryAnalyzer();
const analysis = await analyzer.analyzeRepository(repo, contents);
```

### 🎯 MCP Detector (`mcp-detector.js`)
Advanced heuristics engine to identify true MCP servers and filter false positives.

**Features:**
- Multi-tier confidence scoring
- Positive and negative indicators
- Edge case handling (examples, monorepos)
- Classification system

**Usage:**
```javascript
import { MCPDetector } from './mcp-detector.js';
const detector = new MCPDetector({ strictMode: true });
const detection = detector.detectMCP(repositoryAnalysis);
```

### 💾 Storage Engine (`storage.js`)
SQLite-based persistent storage for discovered MCPs with caching and analytics.

**Features:**
- Comprehensive database schema
- Discovery run tracking
- Data export capabilities
- Performance statistics

**Usage:**
```javascript
import { MCPStorage } from './storage.js';
const storage = new MCPStorage();
await storage.initialize();
await storage.storeRepository(repoData);
```

### 🚀 Discovery Orchestrator (`orchestrator.js`)
Main coordinator that manages the entire discovery pipeline.

**Features:**
- 5-phase discovery process
- Batch processing with concurrency control
- Error handling and recovery
- Comprehensive reporting

**Usage:**
```javascript
import { DiscoveryOrchestrator } from './orchestrator.js';
const orchestrator = new DiscoveryOrchestrator({ maxRepositories: 5000 });
const results = await orchestrator.runDiscovery();
```

## Command Line Usage

Each component can be run independently:

### GitHub Scanner
```bash
# Basic search
node github-scanner.js

# With environment variables
GITHUB_TOKEN=your_token node github-scanner.js
```

### Repository Analyzer
```bash
node repo-analyzer.js
```

### MCP Detector
```bash
# Normal mode
node mcp-detector.js

# Strict mode (higher thresholds)
node mcp-detector.js --strict
```

### Storage Engine
```bash
# Initialize and show stats
node storage.js

# Custom database path
MCP_DB_PATH=./custom.db node storage.js
```

### Full Discovery
```bash
# Default configuration
node orchestrator.js

# Custom parameters
node orchestrator.js --max-repos=2000 --min-stars=5 --concurrency=3

# Dry run (no storage)
node orchestrator.js --dry-run

# Strict detection mode
node orchestrator.js --strict

# Debug mode
DEBUG=true node orchestrator.js
```

## Configuration

### Environment Variables
```bash
# GitHub token (recommended)
export GITHUB_TOKEN="ghp_your_token_here"

# Custom database path
export MCP_DB_PATH="./data/custom-discovery.db"

# Enable debug logging
export DEBUG="true"
```

### Programmatic Configuration
```javascript
const config = {
  // GitHub settings
  githubToken: process.env.GITHUB_TOKEN,
  maxRepositories: 5000,
  minStars: 1,
  
  // Processing settings
  concurrency: 5,
  batchSize: 50,
  
  // Detection settings
  strictMode: false,
  minConfidence: 30,
  
  // Storage settings
  dbPath: './data/mcp-discovery.db',
  cacheEnabled: true,
  
  // Runtime settings
  debug: false,
  dryRun: false
};
```

## Output Examples

### Discovery Results
```json
{
  "runId": "discovery-2024-08-23T12-00-00-abc123",
  "repositories": [
    {
      "fullName": "user/mcp-filesystem-server",
      "confidence": 85,
      "classification": "definite_mcp_server",
      "capabilities": ["filesystem", "tools"],
      "language": "javascript",
      "stars": 45
    }
  ],
  "stats": {
    "mcpServers": {
      "detected": 287,
      "highConfidence": 156,
      "mediumConfidence": 89,
      "lowConfidence": 42
    }
  }
}
```

### Console Output
```
🚀 MCP-7 GitHub Discovery Engine v3.0
=====================================

📋 Discovery Configuration:
   Max repositories: 5000
   Min stars: 1
   Concurrency: 5
   Run ID: discovery-2024-08-23T12-00-00-abc123

🔍 PHASE 1: Repository Discovery
--------------------------------
📋 Searching pattern: "mcp-server"
   Found 1,245 repositories (1,245 unique total)
✅ Discovery complete! Found 4,832 unique repositories

🔬 PHASE 2: Repository Analysis
-------------------------------
📦 Batch 1/97 (50 repositories)
   ✅ Analyzed 48/50 repositories
✅ Repository analysis complete!

🎯 PHASE 3: MCP Detection
-------------------------
✅ MCP detection complete!
   MCP servers detected: 287
   High confidence: 156

💾 PHASE 4: Data Storage
------------------------
✅ Data storage complete!

📊 PHASE 5: Report Generation
-----------------------------
✅ Discovery Complete!

📊 Discovery Summary
===================
🕒 Duration: 12m 34s
📦 Repositories Discovered: 4,832
🔬 Repositories Analyzed: 4,720 (98% success)
🎯 MCP Servers Detected: 287 (6% rate)
   📈 High Confidence: 156
   📊 Medium Confidence: 89
   📉 Low Confidence: 42
```

## Database Schema

The SQLite database includes these key tables:

- **repositories** - Basic repository metadata
- **mcp_analysis** - Analysis results and confidence scores
- **mcp_detection** - Detection results and classifications
- **package_info** - Package manager information
- **repository_files** - File structure and relevance
- **discovery_runs** - Run tracking and statistics

## Error Handling

Components include comprehensive error handling:

- **Rate Limit Recovery** - Automatic retry with backoff
- **Network Resilience** - Timeout and retry logic  
- **Database Safety** - Transaction rollbacks on errors
- **Graceful Degradation** - Continue on component failures

## Performance

**Typical Performance:**
- Discovery: 5,000 repositories in ~15-30 minutes
- Analysis: 100 repositories per minute
- Storage: 1,000 records per minute
- Memory: ~100-200MB peak usage

**Rate Limits:**
- GitHub Authenticated: 5,000 requests/hour
- GitHub Search: 30 requests/minute
- Processing: Limited by rate limits and concurrency

## Testing

```bash
# Run all tests
npm test

# Component-specific tests
npm test tests/discovery/github-scanner.test.js
npm test tests/discovery/mcp-detector.test.js
npm test tests/discovery/orchestrator.test.js
```

## Troubleshooting

**Common Issues:**

1. **Rate Limit Exceeded**
   - Solution: Set `GITHUB_TOKEN` environment variable
   - Or reduce `concurrency` and increase `delayBetweenRequests`

2. **No Results Found**
   - Check internet connection
   - Verify GitHub token validity
   - Review search patterns

3. **Database Errors**
   - Check disk space and permissions
   - Ensure database directory exists
   - Try deleting database to recreate

4. **Memory Issues**
   - Reduce `batchSize` and `maxRepositories`
   - Enable garbage collection: `node --expose-gc`

For detailed documentation, see `/docs/discovery-engine.md`.

## Next Steps

After discovery completes:

1. **Review Results** - Check high-confidence MCPs
2. **Export Data** - Use storage export functionality  
3. **Integrate** - Connect to MCP-7 orchestration system
4. **Schedule** - Set up periodic discovery runs
5. **Monitor** - Track discovery performance and accuracy