/**
 * Test suite for MCP Detector
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { MCPDetector } from '../../src/discovery/mcp-detector.js';

// Mock repository analysis for testing
const createMockAnalysis = (overrides = {}) => ({
  repository: {
    fullName: 'test-owner/test-repo',
    name: 'test-repo',
    owner: 'test-owner',
    description: 'A test repository',
    url: 'https://github.com/test-owner/test-repo'
  },
  metadata: {
    stars: 10,
    forks: 2,
    watchers: 10,
    size: 100,
    language: 'JavaScript',
    topics: [],
    license: 'MIT',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-08-20T12:00:00Z',
    pushedAt: '2024-08-20T12:00:00Z',
    archived: false,
    fork: false
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
    language: 'javascript',
    framework: null,
    mcpImplementation: null,
    installationMethod: 'npm',
    dependencies: {},
    documentation: {
      hasReadme: false,
      hasDocs: false,
      examples: false,
      installation: false
    }
  },
  analyzedAt: '2024-08-23T12:00:00Z',
  ...overrides
});

test('MCPDetector - Constructor', () => {
  const detector = new MCPDetector();
  assert.ok(detector instanceof MCPDetector);
  assert.equal(typeof detector.detectMCP, 'function');
  assert.equal(typeof detector.detectMCPRepositories, 'function');
  assert.ok(detector.mcpIndicators);
  assert.ok(detector.thresholds);
});

test('MCPDetector - Configuration options', () => {
  const strictDetector = new MCPDetector({ strictMode: true });
  const normalDetector = new MCPDetector({ strictMode: false });
  
  assert.ok(strictDetector.thresholds.high > normalDetector.thresholds.high);
  assert.ok(strictDetector.thresholds.minimum > normalDetector.thresholds.minimum);
  assert.equal(strictDetector.strictMode, true);
  assert.equal(normalDetector.strictMode, false);
});

test('MCPDetector - Strong positive indicators', () => {
  const detector = new MCPDetector();
  
  // Test repository with strong MCP indicators
  const strongMCPAnalysis = createMockAnalysis({
    repository: {
      fullName: 'test/mcp-server-example',
      name: 'mcp-server-example',
      description: 'A model context protocol server for file operations'
    },
    mcp: {
      confidence: 50,
      indicators: ['MCP dependencies: @modelcontextprotocol/server'],
      packageInfo: {
        name: '@test/mcp-server',
        dependencies: { '@modelcontextprotocol/server': '^1.0.0' }
      }
    }
  });
  
  const detection = detector.detectMCP(strongMCPAnalysis);
  
  assert.ok(detection.confidence > 70, 'Should have high confidence for strong indicators');
  assert.equal(detection.isMCP, true);
  assert.equal(detection.confidenceLevel, 'high');
  assert.ok(detection.indicators.positive.length > 0);
});

test('MCPDetector - Negative indicators', () => {
  const detector = new MCPDetector();
  
  // Test repository that looks like MCP but has negative indicators
  const negativeAnalysis = createMockAnalysis({
    repository: {
      fullName: 'test/mcp-tutorial',
      name: 'mcp-tutorial',
      description: 'Tutorial for learning MCP - homework assignment'
    }
  });
  
  const detection = detector.detectMCP(negativeAnalysis);
  
  assert.ok(detection.indicators.negative.length > 0, 'Should detect negative indicators');
  assert.ok(detection.confidence < 50, 'Should have reduced confidence');
});

test('MCPDetector - Package analysis', () => {
  const detector = new MCPDetector();
  
  // Test with official MCP package
  const officialPackageAnalysis = createMockAnalysis({
    mcp: {
      packageInfo: {
        name: '@modelcontextprotocol/server-filesystem',
        version: '1.0.0',
        description: 'Official MCP filesystem server'
      }
    }
  });
  
  const detection = detector.detectMCP(officialPackageAnalysis);
  
  assert.ok(detection.confidence >= 70, 'Official packages should have high confidence');
  assert.ok(detection.reasons.includes('Official MCP package'));
});

test('MCPDetector - Edge case handling', () => {
  const detector = new MCPDetector();
  
  // Test example repository
  const exampleAnalysis = createMockAnalysis({
    repository: {
      fullName: 'test/mcp-example-demo',
      name: 'mcp-example-demo',
      description: 'Example MCP server for demonstration purposes'
    }
  });
  
  const detection = detector.detectMCP(exampleAnalysis);
  
  assert.ok(detection.edgeCases.includes('example'), 'Should detect example pattern');
  assert.ok(detection.reasons.includes('Appears to be an example/demo project'));
});

test('MCPDetector - Repository characteristics', () => {
  const detector = new MCPDetector();
  
  // Test archived repository
  const archivedAnalysis = createMockAnalysis({
    metadata: {
      ...createMockAnalysis().metadata,
      archived: true
    }
  });
  
  const detection = detector.detectMCP(archivedAnalysis);
  
  const archivedCharacteristic = detection.indicators.characteristics.find(
    c => c.description === 'Repository is archived'
  );
  assert.ok(archivedCharacteristic, 'Should detect archived status');
  assert.ok(archivedCharacteristic.weight < 0, 'Archived should be negative indicator');
});

test('MCPDetector - Confidence levels', () => {
  const detector = new MCPDetector();
  
  const testCases = [
    { confidence: 85, expectedLevel: 'high' },
    { confidence: 60, expectedLevel: 'medium' },
    { confidence: 40, expectedLevel: 'low' },
    { confidence: 15, expectedLevel: 'minimal' },
    { confidence: 5, expectedLevel: 'none' }
  ];
  
  testCases.forEach(({ confidence, expectedLevel }) => {
    const level = detector.getConfidenceLevel(confidence);
    assert.equal(level, expectedLevel, `Confidence ${confidence} should be ${expectedLevel}`);
  });
});

test('MCPDetector - Classification', () => {
  const detector = new MCPDetector();
  
  const testCases = [
    { confidence: 85, expected: 'definite_mcp_server' },
    { confidence: 60, expected: 'likely_mcp_server' },
    { confidence: 40, expected: 'possible_mcp_server' },
    { confidence: 15, expected: 'weak_mcp_candidate' },
    { confidence: 5, expected: 'not_mcp_server' }
  ];
  
  testCases.forEach(({ confidence, expected }) => {
    const detection = { confidence };
    const classification = detector.classifyRepository(detection);
    assert.equal(classification, expected, `Confidence ${confidence} should classify as ${expected}`);
  });
});

test('MCPDetector - Batch processing', async () => {
  const detector = new MCPDetector();
  
  const analyses = [
    createMockAnalysis({ repository: { fullName: 'test/repo1' } }),
    createMockAnalysis({ repository: { fullName: 'test/repo2' } }),
    createMockAnalysis({ repository: { fullName: 'test/repo3' } })
  ];
  
  const results = await detector.detectMCPRepositories(analyses);
  
  assert.equal(results.length, 3);
  results.forEach((result, index) => {
    assert.ok(result.mcpDetection);
    assert.equal(typeof result.mcpDetection.confidence, 'number');
    assert.equal(typeof result.mcpDetection.isMCP, 'boolean');
    assert.equal(result.repository.fullName, `test/repo${index + 1}`);
  });
});

test('MCPDetector - Detection summary', () => {
  const detector = new MCPDetector();
  
  const mockDetectionResults = [
    {
      mcpDetection: {
        isMCP: true,
        confidence: 85,
        confidenceLevel: 'high',
        classification: 'definite_mcp_server',
        edgeCases: []
      }
    },
    {
      mcpDetection: {
        isMCP: true,
        confidence: 45,
        confidenceLevel: 'low',
        classification: 'possible_mcp_server',
        edgeCases: ['example']
      }
    },
    {
      mcpDetection: {
        isMCP: false,
        confidence: 10,
        confidenceLevel: 'none',
        classification: 'not_mcp_server',
        edgeCases: []
      }
    }
  ];
  
  const summary = detector.generateDetectionSummary(mockDetectionResults);
  
  assert.equal(summary.total, 3);
  assert.equal(summary.mcpRepositories, 2);
  assert.equal(summary.confidenceLevels.high, 1);
  assert.equal(summary.confidenceLevels.low, 1);
  assert.equal(summary.confidenceLevels.none, 1);
  assert.equal(summary.edgeCases.example, 1);
  assert.ok(summary.averageConfidence > 0);
  assert.equal(summary.detectionRate, 67); // 2/3 * 100 rounded
});

test('MCPDetector - Filter by confidence', () => {
  const detector = new MCPDetector();
  
  const mockResults = [
    { mcpDetection: { confidence: 80 } },
    { mcpDetection: { confidence: 45 } },
    { mcpDetection: { confidence: 20 } },
    { mcpDetection: { confidence: 5 } }
  ];
  
  const highConfidenceResults = detector.filterByConfidence(mockResults, 70);
  assert.equal(highConfidenceResults.length, 1);
  
  const mediumConfidenceResults = detector.filterByConfidence(mockResults, 40);
  assert.equal(mediumConfidenceResults.length, 2);
  
  const allResults = detector.filterByConfidence(mockResults, 0);
  assert.equal(allResults.length, 4);
});

test('MCPDetector - High confidence MCPs', () => {
  const detector = new MCPDetector();
  
  const mockResults = [
    { mcpDetection: { confidence: 95 } },
    { mcpDetection: { confidence: 75 } },
    { mcpDetection: { confidence: 45 } },
    { mcpDetection: { confidence: 85 } }
  ];
  
  const highConfMCPs = detector.getHighConfidenceMCPs(mockResults);
  
  assert.equal(highConfMCPs.length, 3); // 95, 85, 75
  assert.equal(highConfMCPs[0].mcpDetection.confidence, 95);
  assert.equal(highConfMCPs[1].mcpDetection.confidence, 85);
  assert.equal(highConfMCPs[2].mcpDetection.confidence, 75);
});

test('MCPDetector - Error handling', () => {
  const detector = new MCPDetector();
  
  // Test with malformed analysis
  const malformedAnalysis = {
    // Missing required fields
    repository: null
  };
  
  const detection = detector.detectMCP(malformedAnalysis);
  
  // Should not throw, should return safe detection result
  assert.equal(typeof detection.confidence, 'number');
  assert.equal(typeof detection.isMCP, 'boolean');
  assert.ok(detection.error || detection.confidence === 0);
});

test('MCPDetector - Pattern matching', () => {
  const detector = new MCPDetector();
  
  // Test various MCP-related patterns
  const testPatterns = [
    { text: 'mcp-server implementation', shouldMatch: true },
    { text: 'model context protocol server', shouldMatch: true },
    { text: '@modelcontextprotocol/server', shouldMatch: true },
    { text: 'claude desktop configuration', shouldMatch: true },
    { text: 'random web application', shouldMatch: false }
  ];
  
  testPatterns.forEach(({ text, shouldMatch }) => {
    const analysis = createMockAnalysis({
      repository: { description: text },
      mcp: { indicators: [text] }
    });
    
    const detection = detector.detectMCP(analysis);
    
    if (shouldMatch) {
      assert.ok(detection.confidence > 10, `"${text}" should increase confidence`);
    } else {
      assert.ok(detection.confidence < 20, `"${text}" should not significantly increase confidence`);
    }
  });
});