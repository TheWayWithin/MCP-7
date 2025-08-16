#!/bin/bash

# MCP-7 Installation Script
# Installs the MCP-7 agent into your project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
GITHUB_REPO="https://raw.githubusercontent.com/TheWayWithin/MCP-7/main"
AGENT_DIR=".claude/agents"
KNOWLEDGE_DIR=".claude/knowledge"

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     MCP-7 Agent Installation           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Warning: Not in a git repository. Creating one...${NC}"
    git init
fi

# Create necessary directories
echo -e "${GREEN}→${NC} Creating agent directories..."
mkdir -p "$AGENT_DIR"
mkdir -p "$KNOWLEDGE_DIR"

# Download MCP-7 orchestrator agent
echo -e "${GREEN}→${NC} Downloading MCP-7 orchestrator agent..."
curl -sSL -o "$AGENT_DIR/mcp-7-orchestrator.md" "$GITHUB_REPO/agents/mcp-7-orchestrator.md" || {
    echo -e "${RED}Failed to download MCP-7 orchestrator agent${NC}"
    exit 1
}

# Download knowledge base
echo -e "${GREEN}→${NC} Downloading MCP knowledge catalog..."
curl -sSL -o "$KNOWLEDGE_DIR/mcp-catalog.md" "$GITHUB_REPO/knowledge/mcp-catalog.md" || {
    echo -e "${YELLOW}Warning: Could not download knowledge catalog${NC}"
}

# Download connection guide
echo -e "${GREEN}→${NC} Downloading MCP connection guide..."
curl -sSL -o "$KNOWLEDGE_DIR/mcp-connection-guide.md" "$GITHUB_REPO/knowledge/mcp-connection-guide.md" || {
    echo -e "${YELLOW}Warning: Could not download connection guide${NC}"
}

# Download orchestration scripts
echo -e "${GREEN}→${NC} Downloading orchestration scripts..."
mkdir -p "scripts"
curl -sSL -o "scripts/mcp-orchestrate.sh" "$GITHUB_REPO/scripts/mcp-orchestrate.sh" || {
    echo -e "${YELLOW}Warning: Could not download orchestration script${NC}"
}
curl -sSL -o "scripts/validate-mcp.sh" "$GITHUB_REPO/scripts/validate-mcp.sh" || {
    echo -e "${YELLOW}Warning: Could not download validation script${NC}"
}
chmod +x scripts/*.sh 2>/dev/null || true

# Create a project marker file
echo -e "${GREEN}→${NC} Creating project configuration..."
cat > ".claude/mcp-7.config" << EOF
{
  "version": "2.0.0",
  "installed": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "agent": "mcp-7-orchestrator",
  "purpose": "MCP Service Orchestration and Connection Management",
  "capabilities": ["analyze", "recommend", "install", "configure", "validate"]
}
EOF

# Check for existing CLAUDE.md
if [ ! -f ".claude/CLAUDE.md" ]; then
    echo -e "${GREEN}→${NC} Creating CLAUDE.md context file..."
    cat > ".claude/CLAUDE.md" << 'EOF'
# Project Context

## MCP-7 Agent Installed
This project has MCP-7 installed for intelligent MCP service recommendations.

To use MCP-7 Orchestrator:
1. Ask Claude to "use the MCP-7 orchestrator to analyze and connect MCP services"
2. Provide your project requirements or goals
3. Get MCP recommendations AND installation guidance
4. Follow the orchestration steps to connect services

## Available Commands
- Analyze project for MCP recommendations
- Orchestrate MCP service installation
- Validate MCP connections
- Generate configuration files
- Guide through session restart process

## Quick Start Scripts
- `./scripts/mcp-orchestrate.sh` - Interactive MCP installation
- `./scripts/validate-mcp.sh` - Validate MCP configuration
EOF
else
    echo -e "${YELLOW}→${NC} CLAUDE.md already exists, skipping..."
fi

# Verify installation
if [ -f "$AGENT_DIR/mcp-7-orchestrator.md" ]; then
    echo ""
    echo -e "${GREEN}✅ MCP-7 Orchestrator successfully installed!${NC}"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Open this project in Claude"
    echo "2. Say: 'Use the MCP-7 orchestrator to analyze and connect MCP services'"
    echo "3. Get MCP recommendations that reduce delivery time by 30-50%"
    echo ""
    echo -e "${GREEN}Files installed:${NC}"
    echo "  • $AGENT_DIR/mcp-7-orchestrator.md"
    [ -f "$KNOWLEDGE_DIR/mcp-catalog.md" ] && echo "  • $KNOWLEDGE_DIR/mcp-catalog.md"
    [ -f "$KNOWLEDGE_DIR/mcp-connection-guide.md" ] && echo "  • $KNOWLEDGE_DIR/mcp-connection-guide.md"
    [ -f "scripts/mcp-orchestrate.sh" ] && echo "  • scripts/mcp-orchestrate.sh"
    [ -f "scripts/validate-mcp.sh" ] && echo "  • scripts/validate-mcp.sh"
    echo "  • .claude/mcp-7.config"
    [ -f ".claude/CLAUDE.md" ] && echo "  • .claude/CLAUDE.md"
else
    echo -e "${RED}Installation failed. Please try manual installation.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Ready to accelerate your project!    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"