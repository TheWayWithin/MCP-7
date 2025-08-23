# 🚀 MCP-7 GitHub Discovery Engine v3.0

**Transform from 50 manually curated MCPs to 5,000+ automatically discovered MCPs**

The GitHub Discovery Engine is the foundational technology powering MCP-7's evolution from static knowledge to dynamic ecosystem awareness. This system automatically discovers, analyzes, and catalogs Model Context Protocol servers across GitHub.

## 🎯 Key Features

- **🔍 Intelligent Discovery**: Multi-pattern GitHub search with advanced filtering
- **🔬 Deep Analysis**: Parse packages, documentation, and code structure  
- **🎯 Smart Detection**: Advanced heuristics to identify true MCP servers
- **💾 Persistent Storage**: SQLite database with comprehensive metadata
- **🚀 Production Ready**: Rate limiting, error handling, and batch processing

## 📊 Discovery Capabilities

| Metric | Target |
|--------|--------|
| **Repository Coverage** | 5,000+ repositories |
| **Detection Accuracy** | 95% true positive rate |
| **Languages Supported** | JavaScript, Python, Rust, Go, Java, C# |
| **Processing Speed** | 100+ repos/minute |
| **Confidence Scoring** | 0-100% with classification |

## ⚡ Quick Start

### 1. Setup
```bash
# Install dependencies
npm install

# Set GitHub token (optional but recommended for higher rate limits)
export GITHUB_TOKEN="your_token_here"
```

### 2. Run Discovery
```bash
# Simple discovery
npm start

# Using helper script
./scripts/run-discovery.sh --quick --debug

# Custom configuration
node src/discovery/orchestrator.js --max-repos=2000 --min-stars=5
```

### 3. View Results
```bash
# Show statistics
./scripts/run-discovery.sh --stats

# Export data
./scripts/run-discovery.sh --export
```

## 🏗️ Architecture Overview

```
GitHub API → Scanner → Analyzer → Detector → Storage → Reports
     ↓           ↓         ↓         ↓         ↓
  Search     Extract   Classify   Score    Store
Repositories Content  MCPs vs   & Filter  Results
             & Meta   Non-MCPs
```

### Core Components

1. **[GitHub Scanner](src/discovery/github-scanner.js)** - Repository discovery with rate limiting
2. **[Repository Analyzer](src/discovery/repo-analyzer.js)** - Content analysis and metadata extraction  
3. **[MCP Detector](src/discovery/mcp-detector.js)** - Advanced classification with confidence scoring
4. **[SQLite Storage](src/discovery/storage.js)** - Persistent data storage with analytics
5. **[Discovery Orchestrator](src/discovery/orchestrator.js)** - Pipeline coordination and management

## 📋 Discovery Process

### Phase 1: Repository Discovery (🔍)
- **Search Patterns**: `mcp-server`, `model-context-protocol`, `claude-mcp`, etc.
- **Rate Limits**: 5,000 requests/hour (authenticated) or 60/hour (public)
- **Filtering**: Stars, activity, language, archived status
- **Output**: Raw repository list with basic metadata

### Phase 2: Repository Analysis (🔬)
- **Package Analysis**: Parse `package.json`, `pyproject.toml`, `Cargo.toml`, etc.
- **Documentation**: Extract README content, installation instructions
- **Capabilities**: Identify filesystem, API, database, AI functionality  
- **Language Detection**: JavaScript/TypeScript, Python, Rust, Go, Java
- **Output**: Rich analysis with capabilities and confidence scores

### Phase 3: MCP Detection (🎯)
- **Positive Indicators**: Official packages, MCP dependencies, server patterns
- **Negative Indicators**: Tutorials, games, portfolios, archived repos
- **Edge Cases**: Examples, monorepos, documentation sites
- **Confidence Scoring**: 0-100% with high/medium/low/minimal classifications
- **Output**: Final MCP determination with detailed reasoning

### Phase 4: Data Storage (💾)
- **SQLite Database**: Comprehensive schema with relationships
- **Run Tracking**: Monitor discovery performance and history
- **Caching**: Avoid re-processing unchanged repositories
- **Export**: JSON export for integration with other systems

### Phase 5: Reporting (📊)
- **Statistics**: Discovery rates, language distribution, confidence levels
- **Performance**: Processing times, success rates, error analysis
- **Top Results**: High-confidence MCPs with detailed information

## 🎛️ Configuration

### Environment Variables
```bash
# GitHub authentication (recommended)
export GITHUB_TOKEN="ghp_your_token_here"

# Custom database path
export MCP_DB_PATH="./data/custom-discovery.db"

# Enable debug logging
export DEBUG="true"
```

### Programmatic Configuration
```javascript
import { DiscoveryOrchestrator } from './src/discovery/orchestrator.js';

const orchestrator = new DiscoveryOrchestrator({
  // Discovery settings
  maxRepositories: 5000,    // Max repos to discover
  minStars: 1,              // Minimum stars filter
  
  // Processing settings  
  concurrency: 5,           // Concurrent API requests
  batchSize: 50,            // Repos per processing batch
  
  // Detection settings
  strictMode: false,        // Higher confidence thresholds
  minConfidence: 30,        // Minimum confidence to store
  
  // Runtime settings
  debug: false,             // Verbose logging
  dryRun: false            // Skip database storage
});

const results = await orchestrator.runDiscovery();
```

## 📈 Performance & Scaling

### Typical Performance
- **Full Discovery**: 5,000 repositories in 15-30 minutes
- **Analysis Rate**: 100+ repositories per minute  
- **Memory Usage**: 100-200MB peak
- **Database Size**: ~50MB for 5,000 repositories

### Rate Limit Management
- **Authenticated**: 5,000 GitHub API requests/hour
- **Search API**: 30 requests/minute  
- **Automatic Retry**: Exponential backoff on rate limits
- **Concurrency Control**: Configurable request parallelism

### Optimization Tips
```javascript
// High-performance configuration
{
  concurrency: 10,          // More parallel requests
  batchSize: 100,           // Larger batches  
  delayBetweenRequests: 50  // Less delay
}

// Conservative configuration  
{
  concurrency: 2,           // Fewer parallel requests
  batchSize: 25,            // Smaller batches
  delayBetweenRequests: 500 // More delay
}
```

## 📊 Sample Results

### Discovery Output
```json
{
  "runId": "discovery-2024-08-23T12-00-00-abc123",
  "stats": {
    "repositories": {
      "discovered": 4832,
      "analyzed": 4720,
      "stored": 4699
    },
    "mcpServers": {
      "detected": 287,
      "highConfidence": 156,
      "mediumConfidence": 89, 
      "lowConfidence": 42
    }
  }
}
```

### High-Confidence MCP Examples
```javascript
[
  {
    "fullName": "anthropic/mcp-server-filesystem",
    "confidence": 95,
    "classification": "definite_mcp_server", 
    "capabilities": ["filesystem", "tools"],
    "language": "typescript",
    "stars": 125
  },
  {
    "fullName": "user/sqlite-mcp-server",
    "confidence": 87,
    "classification": "definite_mcp_server",
    "capabilities": ["database", "sql"],
    "language": "python", 
    "stars": 43
  }
]
```

## 🧪 Testing

### Run Test Suite
```bash
# All tests
npm test

# Component tests
npm test tests/discovery/github-scanner.test.js
npm test tests/discovery/mcp-detector.test.js
npm test tests/discovery/orchestrator.test.js

# With coverage
npm run test:coverage
```

### Test Coverage
- **GitHub Scanner**: Search patterns, rate limiting, repository processing
- **Repository Analyzer**: Package parsing, capability detection, language identification
- **MCP Detector**: Confidence scoring, classification, edge case handling
- **Storage Engine**: Database operations, schema migrations, export functionality
- **Orchestrator**: Pipeline coordination, error handling, batch processing

## 🛠️ Development

### Project Structure
```
mcp-7/
├── src/discovery/           # Core discovery components
│   ├── github-scanner.js    # GitHub API integration
│   ├── repo-analyzer.js     # Repository content analysis
│   ├── mcp-detector.js      # MCP classification engine
│   ├── storage.js           # SQLite database operations
│   ├── orchestrator.js      # Main pipeline coordinator
│   └── README.md           # Component documentation
├── tests/discovery/         # Test suites
├── scripts/                 # Helper scripts
│   └── run-discovery.sh    # CLI interface
├── data/                   # Database and exports
├── docs/                   # Comprehensive documentation
└── package.json           # Dependencies and scripts
```

### Adding Components
```javascript
// Example: Custom analyzer for specific language
export class CustomAnalyzer extends RepositoryAnalyzer {
  analyzeCustomPackage(fileContent) {
    // Custom analysis logic
    return {
      capabilities: ['custom-capability'],
      confidence: 85
    };
  }
}
```

## 🔧 Troubleshooting

### Common Issues

**No results found:**
```bash
# Check GitHub token
echo $GITHUB_TOKEN

# Test with smaller dataset
./scripts/run-discovery.sh --test

# Enable debug logging  
./scripts/run-discovery.sh --debug
```

**Rate limit exceeded:**
```bash
# Set up authentication
./scripts/run-discovery.sh --setup

# Reduce concurrency
node src/discovery/orchestrator.js --concurrency=2
```

**Database errors:**
```bash
# Clean and recreate
./scripts/run-discovery.sh --clean

# Check permissions
ls -la data/
```

### Debug Mode
Enable detailed logging:
```bash
DEBUG=true node src/discovery/orchestrator.js --debug
```

## 🚀 Integration

### With MCP-7 Orchestrator
```javascript
// Get discovered MCPs for orchestration
const orchestrator = new DiscoveryOrchestrator();
await orchestrator.initialize();

const highConfidenceMCPs = await orchestrator.getHighConfidenceMCPs(100);

// Use for project recommendations
const projectAnalysis = analyzeProject(userProject);
const recommendations = matchMCPs(projectAnalysis, highConfidenceMCPs);
```

### Export for External Systems
```bash
# Export as JSON
./scripts/run-discovery.sh --export

# Custom export with API
node -e "
import { MCPStorage } from './src/discovery/storage.js';
const storage = new MCPStorage();
await storage.initialize();
const data = await storage.exportData();
// Process data for external system
"
```

## 📚 Further Reading

- **[Complete API Documentation](docs/discovery-engine.md)** - Detailed API reference
- **[Component README](src/discovery/README.md)** - Individual component usage
- **[Test Examples](tests/discovery/)** - Usage examples and patterns
- **[MCP-7 Project Plan](project-plan.md)** - Overall project roadmap

## 🎉 Getting Started

Ready to discover the MCP ecosystem? Start with a quick test:

```bash
# Quick 5-minute discovery  
./scripts/run-discovery.sh --test --debug

# Full production discovery
./scripts/run-discovery.sh --export

# Check your results
./scripts/run-discovery.sh --stats
```

---

**MCP-7 GitHub Discovery Engine v3.0** - Transforming static knowledge into dynamic ecosystem awareness. Built for production use with comprehensive error handling, rate limiting, and scalability features.