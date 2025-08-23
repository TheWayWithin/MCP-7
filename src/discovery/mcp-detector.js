/**
 * MCP Detection Classifier for MCP Discovery
 * Advanced heuristics to identify true MCP repositories and filter false positives
 */

export class MCPDetector {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.strictMode = options.strictMode || false; // When true, require higher confidence thresholds
    
    // Core MCP indicators with confidence weights
    this.mcpIndicators = {
      // Strong positive indicators (high confidence)
      strongPositive: [
        { pattern: /mcp-server/i, weight: 40, description: 'Contains "mcp-server"' },
        { pattern: /model.context.protocol/i, weight: 35, description: 'References Model Context Protocol' },
        { pattern: /"@modelcontextprotocol\//i, weight: 45, description: 'Official MCP package dependency' },
        { pattern: /claude_desktop_config/i, weight: 30, description: 'Claude Desktop configuration' },
        { pattern: /anthropic.*mcp/i, weight: 25, description: 'Anthropic MCP reference' }
      ],
      
      // Positive indicators (medium confidence)
      positive: [
        { pattern: /claude.*mcp/i, weight: 20, description: 'Claude MCP reference' },
        { pattern: /mcp.*tool/i, weight: 18, description: 'MCP tool reference' },
        { pattern: /context.*protocol.*server/i, weight: 15, description: 'Context protocol server' },
        { pattern: /mcp.*client/i, weight: 12, description: 'MCP client reference' },
        { pattern: /server.*mcp/i, weight: 15, description: 'Server MCP reference' }
      ],
      
      // Weak positive indicators (low confidence)
      weakPositive: [
        { pattern: /mcp/i, weight: 5, description: 'Contains "mcp"' },
        { pattern: /claude/i, weight: 3, description: 'References Claude' },
        { pattern: /anthropic/i, weight: 4, description: 'References Anthropic' },
        { pattern: /context.*protocol/i, weight: 8, description: 'Context protocol mention' }
      ]
    };

    // Negative indicators (reduce confidence)
    this.negativeIndicators = [
      { pattern: /bitcoin/i, weight: -10, description: 'Cryptocurrency project' },
      { pattern: /mining/i, weight: -8, description: 'Mining related' },
      { pattern: /game/i, weight: -5, description: 'Game project' },
      { pattern: /website/i, weight: -3, description: 'Website project' },
      { pattern: /blog/i, weight: -5, description: 'Blog project' },
      { pattern: /tutorial/i, weight: -8, description: 'Tutorial project' },
      { pattern: /exercise/i, weight: -10, description: 'Exercise/learning project' },
      { pattern: /homework/i, weight: -15, description: 'Homework project' },
      { pattern: /test.*repo/i, weight: -20, description: 'Test repository' },
      { pattern: /^hello.world/i, weight: -15, description: 'Hello world project' },
      { pattern: /portfolio/i, weight: -8, description: 'Portfolio project' }
    ];

    // File structure indicators
    this.fileIndicators = {
      positive: [
        { file: 'package.json', patterns: [/@modelcontextprotocol/i, /mcp.*server/i], weight: 25 },
        { file: 'pyproject.toml', patterns: [/mcp/i, /claude/i], weight: 20 },
        { file: 'Cargo.toml', patterns: [/mcp/i, /claude/i], weight: 20 },
        { file: 'server.js', patterns: [/mcp/i, /context.*protocol/i], weight: 15 },
        { file: 'main.py', patterns: [/mcp/i, /server/i], weight: 12 }
      ],
      negative: [
        { file: 'package.json', patterns: [/react.*app/i, /vue.*app/i, /next.*app/i], weight: -10 },
        { file: 'index.html', patterns: [/.*/], weight: -15 }, // Static websites
        { file: 'requirements.txt', patterns: [/django/i, /flask/i], weight: -5 } // Web frameworks
      ]
    };

    // Repository characteristics that indicate MCP servers
    this.repoCharacteristics = {
      positive: [
        { check: 'hasServerExecutable', weight: 20, description: 'Has server executable' },
        { check: 'hasConfigExample', weight: 15, description: 'Has config examples' },
        { check: 'hasInstallInstructions', weight: 10, description: 'Has install instructions' },
        { check: 'recentActivity', weight: 5, description: 'Recently active' },
        { check: 'hasTests', weight: 8, description: 'Has test suite' }
      ],
      negative: [
        { check: 'isArchived', weight: -25, description: 'Repository is archived' },
        { check: 'noActivity', weight: -15, description: 'No recent activity (>2 years)' },
        { check: 'isFork', weight: -5, description: 'Is a fork' },
        { check: 'verySmall', weight: -10, description: 'Very small repository (<1KB)' },
        { check: 'noDescription', weight: -5, description: 'No description' }
      ]
    };

    // Edge case patterns to handle special situations
    this.edgePatterns = {
      // Monorepos - look for MCP servers within larger projects
      monorepo: [
        /packages.*mcp/i,
        /services.*mcp/i,
        /apps.*mcp/i,
        /tools.*mcp/i
      ],
      
      // Examples - often contain MCP in name but aren't servers
      examples: [
        /example.*mcp/i,
        /mcp.*example/i,
        /sample.*mcp/i,
        /demo.*mcp/i
      ],
      
      // Documentation repos
      documentation: [
        /docs.*mcp/i,
        /mcp.*docs/i,
        /documentation/i
      ]
    };

    // Confidence thresholds
    this.thresholds = {
      high: this.strictMode ? 80 : 70,    // Definitely an MCP server
      medium: this.strictMode ? 60 : 50,  // Likely an MCP server
      low: this.strictMode ? 40 : 30,     // Possibly an MCP server
      minimum: this.strictMode ? 20 : 10  // Minimum to consider
    };
  }

  /**
   * Main detection method - analyze if repository is an MCP server
   */
  detectMCP(repositoryAnalysis) {
    const detection = {
      isMCP: false,
      confidence: 0,
      confidenceLevel: 'none',
      indicators: {
        positive: [],
        negative: [],
        characteristics: []
      },
      classification: 'unknown',
      reasons: [],
      edgeCases: []
    };

    try {
      // Start with base confidence from repository analysis
      let confidence = repositoryAnalysis.mcp?.confidence || 0;
      
      // Apply pattern-based detection
      confidence += this.analyzePatterns(repositoryAnalysis, detection);
      
      // Apply file-based detection
      confidence += this.analyzeFiles(repositoryAnalysis, detection);
      
      // Apply repository characteristics
      confidence += this.analyzeCharacteristics(repositoryAnalysis, detection);
      
      // Handle edge cases
      this.handleEdgeCases(repositoryAnalysis, detection);
      
      // Apply final adjustments
      confidence = this.applyFinalAdjustments(repositoryAnalysis, confidence, detection);
      
      // Determine final classification
      detection.confidence = Math.max(0, Math.min(100, confidence));
      detection.confidenceLevel = this.getConfidenceLevel(detection.confidence);
      detection.isMCP = detection.confidence >= this.thresholds.minimum;
      detection.classification = this.classifyRepository(detection);
      
      if (this.debug) {
        console.log(`🔍 Detection for ${repositoryAnalysis.repository.fullName}:`, {
          confidence: detection.confidence,
          level: detection.confidenceLevel,
          isMCP: detection.isMCP,
          classification: detection.classification
        });
      }

      return detection;

    } catch (error) {
      console.warn(`⚠️  Detection failed for ${repositoryAnalysis.repository?.fullName}:`, error.message);
      detection.error = error.message;
      return detection;
    }
  }

  /**
   * Analyze text patterns in repository content
   */
  analyzePatterns(analysis, detection) {
    let confidenceBoost = 0;
    
    // Combine all text content for analysis
    const textContent = [
      analysis.repository.description,
      analysis.repository.name,
      analysis.mcp?.packageInfo?.description,
      ...(analysis.mcp?.indicators || [])
    ].filter(Boolean).join(' ').toLowerCase();

    // Apply strong positive indicators
    this.mcpIndicators.strongPositive.forEach(indicator => {
      if (indicator.pattern.test(textContent)) {
        confidenceBoost += indicator.weight;
        detection.indicators.positive.push({
          type: 'strong_positive',
          description: indicator.description,
          weight: indicator.weight
        });
      }
    });

    // Apply positive indicators
    this.mcpIndicators.positive.forEach(indicator => {
      if (indicator.pattern.test(textContent)) {
        confidenceBoost += indicator.weight;
        detection.indicators.positive.push({
          type: 'positive',
          description: indicator.description,
          weight: indicator.weight
        });
      }
    });

    // Apply weak positive indicators (but limit their impact)
    let weakPositiveCount = 0;
    this.mcpIndicators.weakPositive.forEach(indicator => {
      if (indicator.pattern.test(textContent)) {
        weakPositiveCount++;
        detection.indicators.positive.push({
          type: 'weak_positive',
          description: indicator.description,
          weight: indicator.weight
        });
      }
    });
    
    // Limit weak positive impact to prevent false positives
    confidenceBoost += Math.min(weakPositiveCount * 3, 15);

    // Apply negative indicators
    this.negativeIndicators.forEach(indicator => {
      if (indicator.pattern.test(textContent)) {
        confidenceBoost += indicator.weight; // Weight is already negative
        detection.indicators.negative.push({
          type: 'negative',
          description: indicator.description,
          weight: indicator.weight
        });
      }
    });

    return confidenceBoost;
  }

  /**
   * Analyze specific files for MCP indicators
   */
  analyzeFiles(analysis, detection) {
    let confidenceBoost = 0;
    
    // Analyze positive file indicators
    this.fileIndicators.positive.forEach(fileIndicator => {
      const fileAnalysis = analysis.mcp?.packageInfo;
      if (!fileAnalysis) return;
      
      // Check if this file type was analyzed
      if (analysis.files?.analyzed?.includes(fileIndicator.file)) {
        fileIndicator.patterns.forEach(pattern => {
          const content = JSON.stringify(fileAnalysis).toLowerCase();
          if (pattern.test(content)) {
            confidenceBoost += fileIndicator.weight;
            detection.indicators.positive.push({
              type: 'file_positive',
              description: `${fileIndicator.file} contains MCP patterns`,
              weight: fileIndicator.weight
            });
          }
        });
      }
    });

    // Analyze negative file indicators
    this.fileIndicators.negative.forEach(fileIndicator => {
      if (analysis.files?.analyzed?.includes(fileIndicator.file)) {
        fileIndicator.patterns.forEach(pattern => {
          const content = JSON.stringify(analysis.mcp?.packageInfo || {}).toLowerCase();
          if (pattern.test(content)) {
            confidenceBoost += fileIndicator.weight; // Weight is already negative
            detection.indicators.negative.push({
              type: 'file_negative',
              description: `${fileIndicator.file} suggests non-MCP project`,
              weight: fileIndicator.weight
            });
          }
        });
      }
    });

    return confidenceBoost;
  }

  /**
   * Analyze repository characteristics
   */
  analyzeCharacteristics(analysis, detection) {
    let confidenceBoost = 0;
    
    // Check positive characteristics
    this.repoCharacteristics.positive.forEach(characteristic => {
      if (this.checkCharacteristic(analysis, characteristic.check)) {
        confidenceBoost += characteristic.weight;
        detection.indicators.characteristics.push({
          type: 'positive_characteristic',
          description: characteristic.description,
          weight: characteristic.weight
        });
      }
    });

    // Check negative characteristics
    this.repoCharacteristics.negative.forEach(characteristic => {
      if (this.checkCharacteristic(analysis, characteristic.check)) {
        confidenceBoost += characteristic.weight; // Weight is already negative
        detection.indicators.characteristics.push({
          type: 'negative_characteristic',
          description: characteristic.description,
          weight: characteristic.weight
        });
      }
    });

    return confidenceBoost;
  }

  /**
   * Check specific repository characteristics
   */
  checkCharacteristic(analysis, check) {
    const repo = analysis.repository;
    const metadata = analysis.metadata;
    
    switch (check) {
      case 'hasServerExecutable':
        return analysis.mcp?.packageInfo?.bin || 
               analysis.files?.mcpRelevant?.some(f => f.includes('server'));
      
      case 'hasConfigExample':
        return analysis.files?.mcpRelevant?.some(f => f.includes('config') || f.includes('claude'));
      
      case 'hasInstallInstructions':
        return analysis.analysis?.documentation?.installation;
      
      case 'recentActivity':
        const updatedAt = new Date(metadata?.updatedAt || 0);
        const monthsOld = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return monthsOld < 6;
      
      case 'hasTests':
        return analysis.files?.analyzed?.some(f => f.includes('test')) ||
               analysis.analysis?.documentation?.examples;
      
      case 'isArchived':
        return metadata?.archived || repo?.archived;
      
      case 'noActivity':
        const lastUpdate = new Date(metadata?.updatedAt || 0);
        const yearsOld = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        return yearsOld > 2;
      
      case 'isFork':
        return repo?.fork || metadata?.fork;
      
      case 'verySmall':
        return (metadata?.size || 0) < 1;
      
      case 'noDescription':
        return !repo?.description && !metadata?.description;
      
      default:
        return false;
    }
  }

  /**
   * Handle edge cases like monorepos, examples, etc.
   */
  handleEdgeCases(analysis, detection) {
    const fullName = analysis.repository.fullName?.toLowerCase() || '';
    const description = analysis.repository.description?.toLowerCase() || '';
    const combined = `${fullName} ${description}`;

    // Check for monorepo patterns
    if (this.edgePatterns.monorepo.some(pattern => pattern.test(combined))) {
      detection.edgeCases.push('monorepo');
      detection.reasons.push('Potential MCP server within monorepo');
      // Don't penalize monorepos as heavily
    }

    // Check for example patterns
    if (this.edgePatterns.examples.some(pattern => pattern.test(combined))) {
      detection.edgeCases.push('example');
      detection.reasons.push('Appears to be an example/demo project');
      // Reduce confidence for examples unless they have strong indicators
      if (detection.confidence < 50) {
        detection.confidence = Math.max(0, detection.confidence - 20);
      }
    }

    // Check for documentation patterns
    if (this.edgePatterns.documentation.some(pattern => pattern.test(combined))) {
      detection.edgeCases.push('documentation');
      detection.reasons.push('Appears to be documentation repository');
      // Heavily penalize documentation repos
      detection.confidence = Math.max(0, detection.confidence - 30);
    }
  }

  /**
   * Apply final adjustments based on overall analysis
   */
  applyFinalAdjustments(analysis, confidence, detection) {
    // Boost for multiple strong indicators
    const strongIndicators = detection.indicators.positive.filter(i => i.type === 'strong_positive');
    if (strongIndicators.length >= 2) {
      confidence += 15;
      detection.reasons.push('Multiple strong MCP indicators present');
    }

    // Boost for good documentation + MCP indicators
    if (analysis.analysis?.documentation?.hasReadme && 
        analysis.analysis?.documentation?.installation &&
        detection.indicators.positive.length > 0) {
      confidence += 10;
      detection.reasons.push('Well-documented with MCP indicators');
    }

    // Penalty for no clear MCP indicators despite matching search
    if (detection.indicators.positive.length === 0 && confidence > 0) {
      confidence = Math.max(0, confidence - 20);
      detection.reasons.push('No clear MCP indicators found');
    }

    // Boost for official packages
    if (analysis.mcp?.packageInfo?.name?.includes('@modelcontextprotocol/')) {
      confidence += 25;
      detection.reasons.push('Official MCP package');
    }

    return confidence;
  }

  /**
   * Get confidence level string
   */
  getConfidenceLevel(confidence) {
    if (confidence >= this.thresholds.high) return 'high';
    if (confidence >= this.thresholds.medium) return 'medium';
    if (confidence >= this.thresholds.low) return 'low';
    if (confidence >= this.thresholds.minimum) return 'minimal';
    return 'none';
  }

  /**
   * Classify repository based on detection results
   */
  classifyRepository(detection) {
    if (detection.confidence >= this.thresholds.high) {
      return 'definite_mcp_server';
    } else if (detection.confidence >= this.thresholds.medium) {
      return 'likely_mcp_server';
    } else if (detection.confidence >= this.thresholds.low) {
      return 'possible_mcp_server';
    } else if (detection.confidence >= this.thresholds.minimum) {
      return 'weak_mcp_candidate';
    } else {
      return 'not_mcp_server';
    }
  }

  /**
   * Batch detect MCP repositories
   */
  async detectMCPRepositories(analyses) {
    console.log(`🔍 Running MCP detection on ${analyses.length} repositories...`);
    
    const results = analyses.map((analysis, index) => {
      try {
        const detection = this.detectMCP(analysis);
        
        if ((index + 1) % 100 === 0) {
          console.log(`   ✅ Processed ${index + 1}/${analyses.length} detections`);
        }
        
        return {
          ...analysis,
          mcpDetection: detection
        };
        
      } catch (error) {
        console.warn(`⚠️  Detection failed for repository ${index + 1}:`, error.message);
        return {
          ...analysis,
          mcpDetection: {
            isMCP: false,
            confidence: 0,
            confidenceLevel: 'error',
            error: error.message
          }
        };
      }
    });

    console.log(`✅ MCP detection complete! Processed ${results.length} repositories`);
    return results;
  }

  /**
   * Generate detection summary
   */
  generateDetectionSummary(detectionResults) {
    const summary = {
      total: detectionResults.length,
      mcpRepositories: 0,
      confidenceLevels: {
        high: 0,
        medium: 0,
        low: 0,
        minimal: 0,
        none: 0
      },
      classifications: {},
      edgeCases: {},
      averageConfidence: 0
    };

    let totalConfidence = 0;
    
    detectionResults.forEach(result => {
      const detection = result.mcpDetection;
      
      if (detection.isMCP) {
        summary.mcpRepositories++;
      }
      
      summary.confidenceLevels[detection.confidenceLevel]++;
      
      if (detection.classification) {
        summary.classifications[detection.classification] = 
          (summary.classifications[detection.classification] || 0) + 1;
      }
      
      detection.edgeCases?.forEach(edgeCase => {
        summary.edgeCases[edgeCase] = (summary.edgeCases[edgeCase] || 0) + 1;
      });
      
      totalConfidence += detection.confidence;
    });

    summary.averageConfidence = detectionResults.length > 0 ? 
      Math.round(totalConfidence / detectionResults.length) : 0;
    
    summary.detectionRate = detectionResults.length > 0 ? 
      Math.round((summary.mcpRepositories / detectionResults.length) * 100) : 0;

    return summary;
  }

  /**
   * Filter results by confidence level
   */
  filterByConfidence(detectionResults, minConfidence = this.thresholds.minimum) {
    return detectionResults.filter(result => 
      result.mcpDetection.confidence >= minConfidence
    );
  }

  /**
   * Get high-confidence MCP servers
   */
  getHighConfidenceMCPs(detectionResults) {
    return this.filterByConfidence(detectionResults, this.thresholds.high)
      .sort((a, b) => b.mcpDetection.confidence - a.mcpDetection.confidence);
  }
}

// CLI interface for standalone usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const detector = new MCPDetector({ debug: true, strictMode: false });
  
  console.log('🔍 MCP Detection Classifier v3.0');
  console.log('=================================\n');
  
  console.log('Detection thresholds:');
  console.log(`  High confidence: ${detector.thresholds.high}%`);
  console.log(`  Medium confidence: ${detector.thresholds.medium}%`);
  console.log(`  Low confidence: ${detector.thresholds.low}%`);
  console.log(`  Minimum threshold: ${detector.thresholds.minimum}%`);
  
  console.log('\nMCP detector initialized and ready for use.');
  console.log('Use this class with RepositoryAnalyzer results to detect true MCP servers.');
}

export default MCPDetector;