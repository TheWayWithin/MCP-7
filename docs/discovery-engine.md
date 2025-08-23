# MCP-7 GitHub Discovery Engine v3.0

## Overview

The GitHub Discovery Engine is the foundation of MCP-7 v3.0, transforming the system from static knowledge (50 manually curated MCPs) to dynamic discovery (5,000+ automatically discovered MCPs). This document provides comprehensive guidance on using, configuring, and extending the discovery system.

## Architecture

The discovery engine consists of five core components working in orchestrated phases:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  GitHub Scanner │ -> │ Repository      │ -> │ MCP Detector    │
│                 │    │ Analyzer        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         v                       v                       v
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Discovery       │ <- │ SQLite Storage  │ <- │ Results         │
│ Orchestrator    │    │                 │    │ Processor       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Components

1. **GitHub Scanner** (`github-scanner.js`)
   - Searches GitHub repositories using multiple MCP-related patterns
   - Handles rate limiting and pagination
   - Extracts repository metadata and contents

2. **Repository Analyzer** (`repo-analyzer.js`)
   - Analyzes package.json, README.md, and other files
   - Extracts MCP capabilities and metadata
   - Determines programming language and installation method

3. **MCP Detector** (`mcp-detector.js`)
   - Advanced heuristics to identify true MCP servers
   - Filters false positives using negative indicators
   - Provides confidence scoring and classification

4. **SQLite Storage** (`storage.js`)
   - Persistent storage for discovered repositories
   - Caching and metadata management
   - Data export and statistics

5. **Discovery Orchestrator** (`orchestrator.js`)
   - Coordinates the entire discovery pipeline
   - Manages batch processing and error handling
   - Generates comprehensive reports

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/TheWayWithin/MCP-7.git
cd MCP-7

# Install dependencies
npm install

# Set up GitHub token (optional but recommended)
export GITHUB_TOKEN="your_github_token_here"
```

### Basic Usage

```bash
# Run discovery with default settings
npm start

# Run with custom parameters
node src/discovery/orchestrator.js --max-repos=1000 --min-stars=5

# Dry run (no database storage)
node src/discovery/orchestrator.js --dry-run

# Strict mode (higher confidence thresholds)
node src/discovery/orchestrator.js --strict
```

### Programmatic Usage

```javascript
import { DiscoveryOrchestrator } from './src/discovery/orchestrator.js';

const orchestrator = new DiscoveryOrchestrator({
  maxRepositories: 2000,
  minStars: 1,
  concurrency: 5,
  strictMode: false,
  debug: true
});

const results = await orchestrator.runDiscovery();
console.log(`Found ${results.stats.mcpServers.detected} MCP servers`);
```

## Configuration

### Environment Variables

```bash
# GitHub API token (recommended for higher rate limits)
GITHUB_TOKEN="ghp_your_token_here"

# Database path (optional)
MCP_DB_PATH="./data/custom-mcp-discovery.db"
```

### Configuration Options

```javascript
const options = {
  // GitHub Settings
  githubToken: process.env.GITHUB_TOKEN,
  maxRepositories: 5000,        // Maximum repositories to discover
  minStars: 0,                  // Minimum stars filter

  // Processing Settings
  concurrency: 5,               // Concurrent API requests
  batchSize: 50,                // Repositories per batch
  delayBetweenRequests: 200,    // Milliseconds between requests

  // Detection Settings
  strictMode: false,            // Higher confidence thresholds
  minConfidence: 30,            // Minimum confidence to consider MCP

  // Storage Settings
  dbPath: './data/discovery.db', // SQLite database path
  cacheEnabled: true,           // Enable result caching

  // Runtime Settings
  debug: false,                 // Verbose logging
  dryRun: false                // Skip database storage
};
```

## Discovery Process

### Phase 1: Repository Discovery

The scanner searches GitHub using multiple patterns:

- `mcp-server`
- `model-context-protocol`
- `claude-mcp`
- `anthropic-mcp`
- `"mcp server"`
- `context-protocol`
- `claude-desktop`
- `claude_desktop_config`

**Rate Limits:**
- Authenticated: 5,000 requests/hour
- Unauthenticated: 60 requests/hour

### Phase 2: Repository Analysis

For each repository, the analyzer:

1. **Extracts Package Information**
   - `package.json` for Node.js projects
   - `pyproject.toml` for Python projects
   - `Cargo.toml` for Rust projects
   - `go.mod` for Go projects

2. **Analyzes Documentation**
   - README.md content and structure
   - Installation instructions
   - Usage examples

3. **Identifies Capabilities**
   - Filesystem operations
   - Database access
   - API integrations
   - AI/ML functionality
   - Web scraping
   - And more...

### Phase 3: MCP Detection

The detector uses advanced heuristics:

**Positive Indicators (confidence boost):**
- Official MCP packages (`@modelcontextprotocol/*`)
- MCP-related dependencies
- Server-like characteristics
- Good documentation
- Recent activity

**Negative Indicators (confidence penalty):**
- Tutorial/homework projects
- Archived repositories
- Gaming projects
- Portfolio websites
- No clear server functionality

**Edge Cases:**
- Monorepos (searched for MCP components)
- Example projects (confidence reduced)
- Documentation repos (heavily penalized)

### Phase 4: Data Storage

Results are stored in SQLite with comprehensive schema:

- Repository metadata
- Analysis results
- Detection outcomes
- Package information
- File structure
- Discovery run tracking

### Phase 5: Report Generation

Comprehensive reports include:

- Discovery statistics
- Processing metrics
- Error analysis
- Top MCP servers
- Language distribution
- Confidence breakdowns

## API Reference

### DiscoveryOrchestrator

```javascript
// Initialize orchestrator
const orchestrator = new DiscoveryOrchestrator(options);

// Run complete discovery
const results = await orchestrator.runDiscovery();

// Get high-confidence MCPs
const topMCPs = await orchestrator.getHighConfidenceMCPs(50);

// Export results
const exportData = await orchestrator.exportResults('json');

// Clean up
await orchestrator.cleanup();
```

### GitHubScanner

```javascript
const scanner = new GitHubScanner({ token: 'your-token' });

// Search for MCP repositories
const results = await scanner.searchMCPRepositories({
  maxResults: 1000,
  minStars: 5
});

// Get repository details
const details = await scanner.getRepositoryDetails('owner', 'repo');

// Check rate limits
const limits = await scanner.getRateLimitStatus();
```

### RepositoryAnalyzer

```javascript
const analyzer = new RepositoryAnalyzer({ debug: true });

// Analyze single repository
const analysis = await analyzer.analyzeRepository(repository, contents);

// Batch analyze
const analyses = await analyzer.analyzeRepositories(repositories);

// Generate summary
const summary = analyzer.generateSummary(analyses);
```

### MCPDetector

```javascript
const detector = new MCPDetector({ strictMode: true });

// Detect MCP server
const detection = detector.detectMCP(repositoryAnalysis);

// Batch detection
const detections = await detector.detectMCPRepositories(analyses);

// Filter by confidence
const highConf = detector.filterByConfidence(detections, 70);
```

### MCPStorage

```javascript
const storage = new MCPStorage({ dbPath: './custom.db' });
await storage.initialize();

// Store repository
const repoId = await storage.storeRepository(repositoryData);

// Get MCP repositories
const mcps = await storage.getMCPRepositories({
  minConfidence: 50,
  limit: 100
});

// Get statistics
const stats = await storage.getDiscoveryStats();

// Export data
const data = await storage.exportData();
```

## Advanced Usage

### Custom Search Patterns

```javascript
const scanner = new GitHubScanner();
scanner.searchPatterns.push('my-custom-mcp-pattern');
```

### Custom Detection Rules

```javascript
const detector = new MCPDetector();
detector.mcpIndicators.strongPositive.push({
  pattern: /my-custom-indicator/i,
  weight: 35,
  description: 'Custom MCP indicator'
});
```

### Database Queries

```javascript
const storage = new MCPStorage();
await storage.initialize();

// Custom query
const results = await storage.db.allAsync(`
  SELECT r.full_name, ma.confidence 
  FROM repositories r
  JOIN mcp_analysis ma ON r.id = ma.repository_id
  WHERE ma.confidence > 80
  ORDER BY r.stars DESC
  LIMIT 10
`);
```

## Monitoring and Debugging

### Enable Debug Mode

```javascript
const orchestrator = new DiscoveryOrchestrator({ debug: true });
```

### Monitor Progress

```bash
# Watch logs
tail -f discovery.log

# Check database
sqlite3 data/mcp-discovery.db ".tables"
sqlite3 data/mcp-discovery.db "SELECT COUNT(*) FROM repositories;"
```

### Performance Metrics

```javascript
// Track processing time
const startTime = Date.now();
await orchestrator.runDiscovery();
const duration = Date.now() - startTime;
console.log(`Discovery took ${duration}ms`);

// Memory usage
console.log(process.memoryUsage());
```

## Error Handling

The system includes comprehensive error handling:

### Common Issues

1. **Rate Limit Exceeded**
   ```
   Error: GitHub API rate limit exceeded
   Solution: Wait for reset or use authentication token
   ```

2. **Network Timeouts**
   ```
   Error: Request timeout
   Solution: Reduce concurrency or increase timeout
   ```

3. **Database Lock**
   ```
   Error: SQLITE_BUSY: database is locked
   Solution: Reduce concurrent database operations
   ```

### Recovery Strategies

- Automatic retries with exponential backoff
- Graceful degradation on component failures
- Resume capability for interrupted runs
- Comprehensive error logging

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test tests/discovery/github-scanner.test.js

# Run with coverage
npm run test:coverage
```

### Test Structure

- Unit tests for each component
- Integration tests for workflows
- Mock components for isolated testing
- Performance benchmarks

## Performance Optimization

### Tuning Parameters

```javascript
// High-performance configuration
const options = {
  concurrency: 10,        // Higher concurrency
  batchSize: 100,         // Larger batches
  delayBetweenRequests: 50, // Lower delay
  cacheEnabled: true      // Enable caching
};

// Conservative configuration
const options = {
  concurrency: 2,         // Lower concurrency
  batchSize: 25,          // Smaller batches
  delayBetweenRequests: 500, // Higher delay
  strictMode: true        // Higher quality threshold
};
```

### Memory Management

- Process repositories in batches
- Use streaming for large datasets
- Clear caches periodically
- Monitor memory usage

### Rate Limit Management

- Use authenticated requests
- Implement exponential backoff
- Monitor remaining quotas
- Queue requests efficiently

## Troubleshooting

### Common Problems

**Discovery finds no repositories:**
- Check GitHub token validity
- Verify rate limit status
- Review search patterns
- Check network connectivity

**Analysis fails:**
- Verify repository access
- Check file parsing logic
- Review error logs
- Test with smaller batches

**Detection confidence is low:**
- Review detection thresholds
- Check indicator patterns
- Analyze false positives
- Tune scoring weights

**Database issues:**
- Check disk space
- Verify permissions
- Review schema version
- Check for corruption

### Debug Steps

1. Enable debug mode
2. Check rate limits
3. Test with small dataset
4. Review error logs
5. Validate configuration
6. Test individual components

## Extending the System

### Adding New Search Patterns

```javascript
// In github-scanner.js
this.searchPatterns.push('new-mcp-pattern');
```

### Custom Analysis Rules

```javascript
// In repo-analyzer.js
this.capabilityPatterns.newCapability = /pattern/i;
```

### Additional Storage Fields

```sql
-- Add column to existing table
ALTER TABLE repositories ADD COLUMN custom_field TEXT;
```

### New Detection Heuristics

```javascript
// In mcp-detector.js
this.mcpIndicators.positive.push({
  pattern: /new-pattern/i,
  weight: 20,
  description: 'New detection rule'
});
```

## Best Practices

### Configuration

- Use authentication tokens
- Set appropriate rate limits
- Configure reasonable batch sizes
- Enable caching for repeated runs

### Processing

- Start with small datasets for testing
- Monitor resource usage
- Use dry-run mode for validation
- Implement proper error handling

### Storage

- Regular database backups
- Monitor disk usage
- Clean up old cache entries
- Index frequently queried columns

### Analysis

- Validate results manually
- Tune confidence thresholds
- Review false positives
- Monitor detection accuracy

## Contributing

To contribute to the discovery engine:

1. Fork the repository
2. Create feature branch
3. Add comprehensive tests
4. Update documentation
5. Submit pull request

### Development Setup

```bash
git clone https://github.com/TheWayWithin/MCP-7.git
cd MCP-7
npm install
npm run dev
```

### Code Standards

- Use ESLint configuration
- Add JSDoc comments
- Include unit tests
- Follow existing patterns
- Update documentation

---

*This documentation covers the core functionality of the MCP-7 GitHub Discovery Engine. For additional help, please refer to the test files or submit an issue on GitHub.*