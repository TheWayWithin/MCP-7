/**
 * Repository Analysis Engine for MCP Discovery
 * Analyzes repository contents to extract MCP metadata and capabilities
 */

import { marked } from 'marked';
import * as cheerio from 'cheerio';
import semver from 'semver';
import yaml from 'yaml';

export class RepositoryAnalyzer {
  constructor(options = {}) {
    this.debug = options.debug || false;
    
    // MCP-specific indicators
    this.mcpKeywords = [
      'mcp-server', 'model-context-protocol', 'claude-mcp', 'anthropic-mcp',
      'claude-desktop', 'claude_desktop_config', 'context-protocol',
      'mcp server', 'model context protocol', 'anthropic claude'
    ];

    // Programming language indicators
    this.languageIndicators = {
      javascript: ['package.json', 'node_modules', '.js', '.ts', '.jsx', '.tsx'],
      python: ['setup.py', 'pyproject.toml', 'requirements.txt', '__init__.py', '.py'],
      rust: ['Cargo.toml', 'Cargo.lock', '.rs'],
      go: ['go.mod', 'go.sum', '.go'],
      java: ['pom.xml', 'build.gradle', '.java'],
      csharp: ['.csproj', '.sln', '.cs'],
      php: ['composer.json', '.php'],
      ruby: ['Gemfile', '.rb'],
      swift: ['Package.swift', '.swift']
    };

    // MCP capability patterns
    this.capabilityPatterns = {
      filesystem: /file|directory|path|read|write|list|delete|create/i,
      database: /sql|database|db|query|table|insert|select|update/i,
      api: /api|http|request|endpoint|rest|graphql|webhook/i,
      ai: /ai|ml|model|openai|anthropic|llm|gpt|claude/i,
      tools: /tool|function|command|execute|run|script/i,
      data: /json|csv|xml|yaml|parse|transform|convert/i,
      web: /web|browser|scrape|html|dom|selenium|playwright/i,
      git: /git|github|repository|commit|branch|pull|push/i,
      time: /time|date|calendar|schedule|cron|timer/i,
      math: /math|calculate|compute|formula|statistics/i,
      search: /search|index|elasticsearch|solr|lucene/i,
      monitoring: /monitor|log|metric|alert|dashboard|observability/i
    };
  }

  /**
   * Analyze a repository and extract MCP-relevant metadata
   */
  async analyzeRepository(repository, contents = {}) {
    const analysis = {
      repository: {
        fullName: repository.full_name,
        name: repository.name,
        owner: repository.owner.login,
        description: repository.description,
        url: repository.html_url,
        cloneUrl: repository.clone_url,
        sshUrl: repository.ssh_url
      },
      metadata: {
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        watchers: repository.watchers_count,
        size: repository.size,
        language: repository.language,
        topics: repository.topics || [],
        license: repository.license?.name,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
        pushedAt: repository.pushed_at
      },
      mcp: {
        confidence: 0,
        indicators: [],
        capabilities: [],
        serverType: null,
        configFiles: [],
        packageInfo: null
      },
      files: {
        analyzed: [],
        mcpRelevant: []
      },
      analysis: {
        language: null,
        framework: null,
        mcpImplementation: null,
        installationMethod: null,
        dependencies: {},
        documentation: {
          hasReadme: false,
          hasDocs: false,
          examples: false,
          installation: false
        }
      },
      analyzedAt: new Date().toISOString()
    };

    try {
      // Analyze package.json for Node.js projects
      if (contents['package.json']) {
        this.analyzePackageJson(contents['package.json'], analysis);
      }

      // Analyze pyproject.toml for Python projects
      if (contents['pyproject.toml']) {
        this.analyzePyprojectToml(contents['pyproject.toml'], analysis);
      }

      // Analyze setup.py for Python projects
      if (contents['setup.py']) {
        this.analyzeSetupPy(contents['setup.py'], analysis);
      }

      // Analyze Cargo.toml for Rust projects
      if (contents['Cargo.toml']) {
        this.analyzeCargoToml(contents['Cargo.toml'], analysis);
      }

      // Analyze go.mod for Go projects
      if (contents['go.mod']) {
        this.analyzeGoMod(contents['go.mod'], analysis);
      }

      // Analyze README
      if (contents['README.md']) {
        this.analyzeReadme(contents['README.md'], analysis);
      }

      // Analyze directory structure
      if (contents._structure) {
        this.analyzeStructure(contents._structure, analysis);
      }

      // Analyze main entry files
      const entryFiles = ['server.js', 'main.js', 'index.js', 'main.py', '__main__.py'];
      for (const file of entryFiles) {
        if (contents[file]) {
          this.analyzeEntryFile(contents[file], analysis);
        }
      }

      // Calculate overall MCP confidence score
      this.calculateMCPConfidence(analysis);

      // Determine programming language and framework
      this.determineLanguageAndFramework(analysis);

      // Classify MCP server type
      this.classifyMCPServerType(analysis);

      return analysis;

    } catch (error) {
      console.warn(`⚠️  Analysis failed for ${repository.full_name}:`, error.message);
      analysis.error = error.message;
      return analysis;
    }
  }

  /**
   * Analyze package.json for Node.js MCP servers
   */
  analyzePackageJson(file, analysis) {
    try {
      const pkg = JSON.parse(file.content);
      analysis.files.analyzed.push('package.json');
      
      analysis.mcp.packageInfo = {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        main: pkg.main,
        bin: pkg.bin,
        scripts: pkg.scripts
      };

      analysis.analysis.language = 'javascript';
      analysis.analysis.dependencies = pkg.dependencies || {};

      // Check for MCP-related dependencies
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const mcpDeps = Object.keys(deps).filter(dep => 
        dep.includes('mcp') || 
        dep.includes('claude') || 
        dep.includes('anthropic') ||
        dep.includes('context-protocol')
      );

      if (mcpDeps.length > 0) {
        analysis.mcp.indicators.push(`MCP dependencies: ${mcpDeps.join(', ')}`);
        analysis.mcp.confidence += 30;
      }

      // Check package name and description
      const nameAndDesc = `${pkg.name} ${pkg.description || ''}`.toLowerCase();
      let mcpKeywordMatches = 0;
      
      this.mcpKeywords.forEach(keyword => {
        if (nameAndDesc.includes(keyword.toLowerCase())) {
          analysis.mcp.indicators.push(`Package references: ${keyword}`);
          mcpKeywordMatches++;
        }
      });

      analysis.mcp.confidence += mcpKeywordMatches * 15;

      // Check for server-like characteristics
      if (pkg.bin || (pkg.scripts && pkg.scripts.start)) {
        analysis.mcp.indicators.push('Executable/server characteristics');
        analysis.mcp.confidence += 10;
      }

      // Detect framework
      if (deps.express) analysis.analysis.framework = 'express';
      else if (deps.fastify) analysis.analysis.framework = 'fastify';
      else if (deps.koa) analysis.analysis.framework = 'koa';

      // Check for TypeScript
      if (deps.typescript || deps['@types/node']) {
        analysis.analysis.language = 'typescript';
      }

    } catch (error) {
      console.warn('Failed to parse package.json:', error.message);
    }
  }

  /**
   * Analyze pyproject.toml for Python MCP servers
   */
  analyzePyprojectToml(file, analysis) {
    try {
      const config = yaml.parse(file.content);
      analysis.files.analyzed.push('pyproject.toml');
      
      analysis.analysis.language = 'python';
      
      const project = config.project || {};
      analysis.mcp.packageInfo = {
        name: project.name,
        version: project.version,
        description: project.description,
        dependencies: project.dependencies
      };

      // Check for MCP-related dependencies
      const deps = project.dependencies || [];
      const mcpDeps = deps.filter(dep => 
        dep.includes('mcp') || 
        dep.includes('claude') || 
        dep.includes('anthropic')
      );

      if (mcpDeps.length > 0) {
        analysis.mcp.indicators.push(`MCP dependencies: ${mcpDeps.join(', ')}`);
        analysis.mcp.confidence += 30;
      }

      // Check project name and description
      const nameAndDesc = `${project.name} ${project.description || ''}`.toLowerCase();
      this.mcpKeywords.forEach(keyword => {
        if (nameAndDesc.includes(keyword.toLowerCase())) {
          analysis.mcp.indicators.push(`Project references: ${keyword}`);
          analysis.mcp.confidence += 15;
        }
      });

    } catch (error) {
      console.warn('Failed to parse pyproject.toml:', error.message);
    }
  }

  /**
   * Analyze setup.py for Python projects
   */
  analyzeSetupPy(file, analysis) {
    try {
      analysis.files.analyzed.push('setup.py');
      analysis.analysis.language = 'python';
      
      const content = file.content.toLowerCase();
      
      // Look for MCP-related keywords in setup.py
      this.mcpKeywords.forEach(keyword => {
        if (content.includes(keyword.toLowerCase())) {
          analysis.mcp.indicators.push(`Setup.py references: ${keyword}`);
          analysis.mcp.confidence += 10;
        }
      });

      // Check for server-like entry points
      if (content.includes('entry_points') || content.includes('console_scripts')) {
        analysis.mcp.indicators.push('Console script entry points');
        analysis.mcp.confidence += 10;
      }

    } catch (error) {
      console.warn('Failed to analyze setup.py:', error.message);
    }
  }

  /**
   * Analyze Cargo.toml for Rust projects
   */
  analyzeCargoToml(file, analysis) {
    try {
      const config = yaml.parse(file.content);
      analysis.files.analyzed.push('Cargo.toml');
      
      analysis.analysis.language = 'rust';
      
      const packageInfo = config.package || {};
      analysis.mcp.packageInfo = {
        name: packageInfo.name,
        version: packageInfo.version,
        description: packageInfo.description
      };

      // Check dependencies
      const deps = config.dependencies || {};
      const mcpDeps = Object.keys(deps).filter(dep => 
        dep.includes('mcp') || 
        dep.includes('claude') || 
        dep.includes('anthropic')
      );

      if (mcpDeps.length > 0) {
        analysis.mcp.indicators.push(`Rust MCP dependencies: ${mcpDeps.join(', ')}`);
        analysis.mcp.confidence += 30;
      }

    } catch (error) {
      console.warn('Failed to parse Cargo.toml:', error.message);
    }
  }

  /**
   * Analyze go.mod for Go projects
   */
  analyzeGoMod(file, analysis) {
    try {
      analysis.files.analyzed.push('go.mod');
      analysis.analysis.language = 'go';
      
      const content = file.content.toLowerCase();
      
      // Look for MCP-related imports
      this.mcpKeywords.forEach(keyword => {
        if (content.includes(keyword.toLowerCase())) {
          analysis.mcp.indicators.push(`Go module references: ${keyword}`);
          analysis.mcp.confidence += 15;
        }
      });

    } catch (error) {
      console.warn('Failed to analyze go.mod:', error.message);
    }
  }

  /**
   * Analyze README.md for MCP information
   */
  analyzeReadme(file, analysis) {
    try {
      analysis.files.analyzed.push('README.md');
      analysis.analysis.documentation.hasReadme = true;
      
      const content = file.content.toLowerCase();
      
      // Look for MCP keywords in README
      let keywordMatches = 0;
      this.mcpKeywords.forEach(keyword => {
        if (content.includes(keyword.toLowerCase())) {
          analysis.mcp.indicators.push(`README mentions: ${keyword}`);
          keywordMatches++;
        }
      });
      
      analysis.mcp.confidence += keywordMatches * 10;

      // Look for capability indicators
      Object.entries(this.capabilityPatterns).forEach(([capability, pattern]) => {
        if (pattern.test(content)) {
          analysis.mcp.capabilities.push(capability);
        }
      });

      // Check for installation instructions
      if (content.includes('install') || content.includes('setup')) {
        analysis.analysis.documentation.installation = true;
      }

      // Check for examples
      if (content.includes('example') || content.includes('usage')) {
        analysis.analysis.documentation.examples = true;
      }

      // Parse README structure for additional context
      try {
        const html = marked(file.content);
        const $ = cheerio.load(html);
        
        // Extract headings for structure analysis
        const headings = [];
        $('h1, h2, h3, h4, h5, h6').each((i, el) => {
          headings.push($(el).text().toLowerCase());
        });

        // Look for MCP-specific sections
        const mcpSections = headings.filter(h => 
          this.mcpKeywords.some(keyword => h.includes(keyword.toLowerCase()))
        );

        if (mcpSections.length > 0) {
          analysis.mcp.indicators.push(`MCP-related sections: ${mcpSections.length}`);
          analysis.mcp.confidence += mcpSections.length * 5;
        }

      } catch (parseError) {
        // Markdown parsing failed, continue with basic analysis
        console.warn('Failed to parse README markdown:', parseError.message);
      }

    } catch (error) {
      console.warn('Failed to analyze README.md:', error.message);
    }
  }

  /**
   * Analyze repository structure
   */
  analyzeStructure(structure, analysis) {
    analysis.files.analyzed.push('_structure');
    
    const files = structure.map(item => item.name.toLowerCase());
    
    // Look for MCP-specific files
    const mcpFiles = files.filter(file => 
      file.includes('mcp') || 
      file.includes('claude') || 
      file === 'server.js' || 
      file === 'server.py' ||
      file === 'claude_desktop_config.json'
    );

    if (mcpFiles.length > 0) {
      analysis.mcp.indicators.push(`MCP-related files: ${mcpFiles.join(', ')}`);
      analysis.mcp.confidence += mcpFiles.length * 10;
      analysis.files.mcpRelevant = mcpFiles;
    }

    // Check for documentation directories
    if (files.includes('docs') || files.includes('documentation')) {
      analysis.analysis.documentation.hasDocs = true;
    }

    // Check for examples directory
    if (files.includes('examples') || files.includes('example')) {
      analysis.analysis.documentation.examples = true;
    }
  }

  /**
   * Analyze main entry files
   */
  analyzeEntryFile(file, analysis) {
    try {
      analysis.files.analyzed.push(file.name);
      
      const content = file.content.toLowerCase();
      
      // Look for MCP server patterns
      const serverPatterns = [
        /mcp.*server/,
        /server.*mcp/,
        /context.*protocol/,
        /claude.*server/,
        /anthropic.*mcp/
      ];

      serverPatterns.forEach((pattern, index) => {
        if (pattern.test(content)) {
          analysis.mcp.indicators.push(`Server pattern ${index + 1} in ${file.name}`);
          analysis.mcp.confidence += 20;
        }
      });

      // Look for capability implementations
      Object.entries(this.capabilityPatterns).forEach(([capability, pattern]) => {
        if (pattern.test(content)) {
          if (!analysis.mcp.capabilities.includes(capability)) {
            analysis.mcp.capabilities.push(capability);
          }
        }
      });

    } catch (error) {
      console.warn(`Failed to analyze ${file.name}:`, error.message);
    }
  }

  /**
   * Calculate overall MCP confidence score
   */
  calculateMCPConfidence(analysis) {
    let confidence = analysis.mcp.confidence;
    
    // Boost for multiple indicators
    if (analysis.mcp.indicators.length >= 3) {
      confidence += 15;
    }
    
    // Boost for capabilities
    confidence += analysis.mcp.capabilities.length * 5;
    
    // Boost for good documentation
    if (analysis.analysis.documentation.hasReadme && analysis.analysis.documentation.installation) {
      confidence += 10;
    }
    
    // Boost for recent activity
    const updatedAt = new Date(analysis.metadata.updatedAt);
    const monthsOld = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsOld < 6) {
      confidence += 10;
    } else if (monthsOld > 24) {
      confidence -= 10;
    }
    
    // Boost for popularity
    if (analysis.metadata.stars > 50) confidence += 10;
    if (analysis.metadata.stars > 100) confidence += 5;
    if (analysis.metadata.forks > 10) confidence += 5;
    
    // Cap at 100
    analysis.mcp.confidence = Math.min(confidence, 100);
  }

  /**
   * Determine primary language and framework
   */
  determineLanguageAndFramework(analysis) {
    // Language already set by individual file analyzers
    if (!analysis.analysis.language && analysis.metadata.language) {
      analysis.analysis.language = analysis.metadata.language.toLowerCase();
    }

    // Determine installation method based on language
    switch (analysis.analysis.language) {
      case 'javascript':
      case 'typescript':
        analysis.analysis.installationMethod = 'npm';
        break;
      case 'python':
        analysis.analysis.installationMethod = 'pip';
        break;
      case 'rust':
        analysis.analysis.installationMethod = 'cargo';
        break;
      case 'go':
        analysis.analysis.installationMethod = 'go install';
        break;
      default:
        analysis.analysis.installationMethod = 'unknown';
    }
  }

  /**
   * Classify MCP server type based on capabilities
   */
  classifyMCPServerType(analysis) {
    const capabilities = analysis.mcp.capabilities;
    
    if (capabilities.includes('filesystem')) {
      analysis.mcp.serverType = 'filesystem';
    } else if (capabilities.includes('database')) {
      analysis.mcp.serverType = 'database';
    } else if (capabilities.includes('api')) {
      analysis.mcp.serverType = 'api';
    } else if (capabilities.includes('ai')) {
      analysis.mcp.serverType = 'ai';
    } else if (capabilities.includes('web')) {
      analysis.mcp.serverType = 'web';
    } else if (capabilities.includes('tools')) {
      analysis.mcp.serverType = 'tools';
    } else {
      analysis.mcp.serverType = 'general';
    }
  }

  /**
   * Batch analyze multiple repositories
   */
  async analyzeRepositories(repositories) {
    console.log(`🔬 Analyzing ${repositories.length} repositories...`);
    
    const results = [];
    for (let i = 0; i < repositories.length; i++) {
      const repo = repositories[i];
      try {
        const analysis = await this.analyzeRepository(repo.repository, repo.contents);
        results.push(analysis);
        
        if ((i + 1) % 50 === 0) {
          console.log(`   ✅ Analyzed ${i + 1}/${repositories.length} repositories`);
        }
        
      } catch (error) {
        console.warn(`⚠️  Failed to analyze ${repo.repository.full_name}:`, error.message);
        results.push({
          repository: { fullName: repo.repository.full_name },
          error: error.message,
          analyzedAt: new Date().toISOString()
        });
      }
    }
    
    console.log(`✅ Analysis complete! Processed ${results.length} repositories`);
    return results;
  }

  /**
   * Generate analysis summary
   */
  generateSummary(analyses) {
    const summary = {
      total: analyses.length,
      successful: analyses.filter(a => !a.error).length,
      failed: analyses.filter(a => a.error).length,
      languages: {},
      mcpConfidenceBands: {
        high: 0,    // 70-100
        medium: 0,  // 40-69
        low: 0,     // 1-39
        none: 0     // 0
      },
      capabilities: {},
      serverTypes: {},
      averageConfidence: 0
    };

    const validAnalyses = analyses.filter(a => !a.error);
    
    validAnalyses.forEach(analysis => {
      // Language distribution
      const lang = analysis.analysis.language || 'unknown';
      summary.languages[lang] = (summary.languages[lang] || 0) + 1;
      
      // Confidence bands
      const confidence = analysis.mcp.confidence;
      if (confidence >= 70) summary.mcpConfidenceBands.high++;
      else if (confidence >= 40) summary.mcpConfidenceBands.medium++;
      else if (confidence > 0) summary.mcpConfidenceBands.low++;
      else summary.mcpConfidenceBands.none++;
      
      // Capabilities
      analysis.mcp.capabilities.forEach(cap => {
        summary.capabilities[cap] = (summary.capabilities[cap] || 0) + 1;
      });
      
      // Server types
      if (analysis.mcp.serverType) {
        summary.serverTypes[analysis.mcp.serverType] = 
          (summary.serverTypes[analysis.mcp.serverType] || 0) + 1;
      }
    });

    // Calculate average confidence
    const totalConfidence = validAnalyses.reduce((sum, a) => sum + a.mcp.confidence, 0);
    summary.averageConfidence = validAnalyses.length > 0 ? 
      Math.round(totalConfidence / validAnalyses.length) : 0;

    return summary;
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new RepositoryAnalyzer({ debug: true });
  
  // Example analysis
  console.log('🔬 MCP Repository Analyzer v3.0');
  console.log('=================================\n');
  
  // This would normally be called with real repository data
  console.log('Repository analyzer initialized and ready for use.');
  console.log('Use this class in conjunction with GitHubScanner to analyze discovered repositories.');
}

export default RepositoryAnalyzer;