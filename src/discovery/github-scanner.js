/**
 * GitHub API Integration for MCP Discovery
 * Searches GitHub for MCP repositories with rate limiting and pagination
 */

import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import pLimit from 'p-limit';

const ThrottledOctokit = Octokit.plugin(throttling);

export class GitHubScanner {
  constructor(options = {}) {
    const {
      token = process.env.GITHUB_TOKEN,
      userAgent = 'MCP-7-Discovery/3.0',
      maxConcurrentRequests = 10,
      debug = false
    } = options;

    if (!token) {
      console.warn('Warning: No GitHub token provided. Rate limits will be severe (60 requests/hour)');
    }

    // Initialize Octokit with throttling plugin
    this.octokit = new ThrottledOctokit({
      auth: token,
      userAgent,
      throttle: {
        onRateLimit: (retryAfter, options) => {
          console.warn(`Rate limit exceeded. Retrying after ${retryAfter}s...`);
          return true; // Retry
        },
        onSecondaryRateLimit: (retryAfter, options) => {
          console.warn(`Secondary rate limit hit. Retrying after ${retryAfter}s...`);
          return true; // Retry
        },
      },
    });

    this.debug = debug;
    this.concurrencyLimit = pLimit(maxConcurrentRequests);

    // MCP search patterns
    this.searchPatterns = [
      'mcp-server',
      'model-context-protocol', 
      'claude-mcp',
      'anthropic-mcp',
      'mcp-',
      '"mcp server"',
      'context-protocol',
      'claude-desktop',
      'claude_desktop_config'
    ];

    // File patterns to look for MCP indicators
    this.mcpFilePatterns = [
      'mcp-server',
      'claude_desktop_config',
      'package.json',
      'README.md',
      'server.js',
      'main.js',
      'index.js'
    ];
  }

  /**
   * Main search method to find MCP repositories
   */
  async searchMCPRepositories(options = {}) {
    const {
      maxResults = 5000,
      includeArchived = false,
      minStars = 0,
      language = null,
      sortBy = 'updated'
    } = options;

    console.log('🔍 Starting MCP repository discovery...');
    const allRepos = new Map(); // Use Map to deduplicate by repo full_name
    let totalSearched = 0;

    try {
      for (const pattern of this.searchPatterns) {
        if (allRepos.size >= maxResults) break;

        console.log(`\n📋 Searching pattern: "${pattern}"`);
        
        const repos = await this.searchByPattern(pattern, {
          maxResults: Math.min(1000, maxResults - allRepos.size),
          includeArchived,
          minStars,
          language,
          sortBy
        });

        // Add to deduplicated collection
        repos.forEach(repo => {
          if (!allRepos.has(repo.full_name)) {
            allRepos.set(repo.full_name, repo);
          }
        });

        totalSearched += repos.length;
        console.log(`   Found ${repos.length} repositories (${allRepos.size} unique total)`);
        
        // Brief pause between searches to be respectful
        await this.sleep(500);
      }

      const uniqueRepos = Array.from(allRepos.values());
      console.log(`\n✅ Discovery complete! Found ${uniqueRepos.length} unique repositories from ${totalSearched} total results`);
      
      return {
        repositories: uniqueRepos,
        stats: {
          patternsSearched: this.searchPatterns.length,
          totalResults: totalSearched,
          uniqueRepositories: uniqueRepos.length,
          duplicatesFiltered: totalSearched - uniqueRepos.length
        }
      };

    } catch (error) {
      console.error('❌ GitHub search failed:', error.message);
      throw new Error(`GitHub search failed: ${error.message}`);
    }
  }

  /**
   * Search repositories by specific pattern
   */
  async searchByPattern(pattern, options = {}) {
    const {
      maxResults = 1000,
      includeArchived = false,
      minStars = 0,
      language = null,
      sortBy = 'updated'
    } = options;

    const repositories = [];
    let page = 1;
    const perPage = 100; // GitHub max

    try {
      while (repositories.length < maxResults) {
        const query = this.buildSearchQuery(pattern, {
          includeArchived,
          minStars,
          language
        });

        if (this.debug) {
          console.log(`   🔍 Query: ${query} (page ${page})`);
        }

        const response = await this.octokit.rest.search.repos({
          q: query,
          sort: sortBy,
          order: 'desc',
          per_page: perPage,
          page: page
        });

        if (response.data.items.length === 0) {
          break; // No more results
        }

        // Add repositories with enhanced metadata
        const enhancedRepos = response.data.items.map(repo => ({
          ...repo,
          searchPattern: pattern,
          discoveredAt: new Date().toISOString()
        }));

        repositories.push(...enhancedRepos);

        // Check if we've reached the last page
        if (response.data.items.length < perPage) {
          break;
        }

        page++;
      }

      return repositories.slice(0, maxResults);

    } catch (error) {
      if (error.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Please wait or provide authentication token.');
      }
      throw error;
    }
  }

  /**
   * Build GitHub search query
   */
  buildSearchQuery(pattern, options = {}) {
    const {
      includeArchived = false,
      minStars = 0,
      language = null
    } = options;

    let query = pattern;

    // Add filters
    if (!includeArchived) {
      query += ' archived:false';
    }

    if (minStars > 0) {
      query += ` stars:>=${minStars}`;
    }

    if (language) {
      query += ` language:${language}`;
    }

    // Focus on repositories (not code)
    query += ' in:name,description,readme';

    return query;
  }

  /**
   * Get detailed repository information
   */
  async getRepositoryDetails(owner, repo) {
    try {
      const [repoInfo, contents, releases, topics] = await Promise.all([
        this.octokit.rest.repos.get({ owner, repo }),
        this.getRepositoryContents(owner, repo),
        this.octokit.rest.repos.listReleases({ 
          owner, 
          repo, 
          per_page: 5 
        }).catch(() => ({ data: [] })),
        this.octokit.rest.repos.getAllTopics({ owner, repo }).catch(() => ({ data: { names: [] } }))
      ]);

      return {
        repository: repoInfo.data,
        contents: contents,
        releases: releases.data,
        topics: topics.data.names,
        enhancedAt: new Date().toISOString()
      };

    } catch (error) {
      console.warn(`⚠️  Failed to get details for ${owner}/${repo}:`, error.message);
      return null;
    }
  }

  /**
   * Get repository contents for MCP analysis
   */
  async getRepositoryContents(owner, repo) {
    const contents = {};
    
    try {
      // Get key files that indicate MCP servers
      const filesToCheck = [
        'package.json',
        'README.md',
        'pyproject.toml',
        'setup.py',
        'Cargo.toml',
        'go.mod',
        'server.js',
        'main.js',
        'index.js',
        '__main__.py',
        'main.py'
      ];

      const filePromises = filesToCheck.map(async (filename) => {
        try {
          const response = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path: filename
          });

          if (response.data.type === 'file') {
            contents[filename] = {
              name: filename,
              size: response.data.size,
              content: response.data.content ? 
                Buffer.from(response.data.content, 'base64').toString('utf-8') : null,
              sha: response.data.sha
            };
          }
        } catch (error) {
          // File doesn't exist, ignore
          if (error.status !== 404) {
            console.warn(`Warning: Failed to fetch ${filename} from ${owner}/${repo}:`, error.message);
          }
        }
      });

      await Promise.all(filePromises);

      // Also try to get directory structure
      try {
        const rootContents = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path: ''
        });

        contents._structure = rootContents.data.map(item => ({
          name: item.name,
          type: item.type,
          size: item.size || 0
        }));

      } catch (error) {
        console.warn(`Warning: Failed to get directory structure for ${owner}/${repo}:`, error.message);
      }

      return contents;

    } catch (error) {
      console.warn(`⚠️  Failed to get contents for ${owner}/${repo}:`, error.message);
      return {};
    }
  }

  /**
   * Search for repositories containing specific files
   */
  async searchByFileContent(filename, content, options = {}) {
    const { maxResults = 100 } = options;
    
    try {
      const query = `filename:${filename} ${content}`;
      
      const response = await this.octokit.rest.search.code({
        q: query,
        per_page: Math.min(maxResults, 100)
      });

      return response.data.items.map(item => ({
        repository: item.repository,
        file: {
          name: item.name,
          path: item.path,
          sha: item.sha,
          url: item.html_url
        },
        score: item.score
      }));

    } catch (error) {
      console.warn('File content search failed:', error.message);
      return [];
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus() {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      return {
        core: response.data.resources.core,
        search: response.data.resources.search,
        graphql: response.data.resources.graphql
      };
    } catch (error) {
      console.warn('Failed to get rate limit status:', error.message);
      return null;
    }
  }

  /**
   * Utility method for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch process repositories with concurrency control
   */
  async processRepositories(repositories, processor, options = {}) {
    const { concurrency = 10, delay = 100 } = options;
    const limit = pLimit(concurrency);
    const results = [];

    console.log(`🔄 Processing ${repositories.length} repositories with ${concurrency} concurrent operations...`);

    const promises = repositories.map((repo, index) => 
      limit(async () => {
        try {
          if (delay > 0) {
            await this.sleep(delay * Math.random()); // Random delay to spread requests
          }
          
          const result = await processor(repo, index);
          if (index % 50 === 0) {
            console.log(`   ✅ Processed ${index + 1}/${repositories.length} repositories`);
          }
          return result;
        } catch (error) {
          console.warn(`⚠️  Failed to process repository ${repo.full_name}:`, error.message);
          return null;
        }
      })
    );

    const batchResults = await Promise.all(promises);
    return batchResults.filter(result => result !== null);
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const scanner = new GitHubScanner({ debug: true });
  
  try {
    console.log('🚀 MCP-7 GitHub Discovery Engine v3.0');
    console.log('=====================================\n');
    
    // Check rate limits
    const rateLimits = await scanner.getRateLimitStatus();
    if (rateLimits) {
      console.log('📊 Rate Limit Status:');
      console.log(`   Core: ${rateLimits.core.remaining}/${rateLimits.core.limit} (resets at ${new Date(rateLimits.core.reset * 1000).toLocaleTimeString()})`);
      console.log(`   Search: ${rateLimits.search.remaining}/${rateLimits.search.limit} (resets at ${new Date(rateLimits.search.reset * 1000).toLocaleTimeString()})\n`);
    }

    // Run discovery
    const results = await scanner.searchMCPRepositories({
      maxResults: 1000,
      minStars: 1
    });

    console.log('\n📊 Discovery Results:');
    console.log(`   Unique repositories found: ${results.repositories.length}`);
    console.log(`   Patterns searched: ${results.stats.patternsSearched}`);
    console.log(`   Total results: ${results.stats.totalResults}`);
    console.log(`   Duplicates filtered: ${results.stats.duplicatesFiltered}`);

    // Show sample results
    console.log('\n🔍 Sample Discoveries:');
    results.repositories.slice(0, 10).forEach((repo, i) => {
      console.log(`   ${i + 1}. ${repo.full_name} (⭐ ${repo.stargazers_count}) - ${repo.description || 'No description'}`);
    });

    if (results.repositories.length > 10) {
      console.log(`   ... and ${results.repositories.length - 10} more repositories`);
    }

  } catch (error) {
    console.error('❌ Discovery failed:', error.message);
    process.exit(1);
  }
}

export default GitHubScanner;