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

# Download MCP-7 agent
echo -e "${GREEN}→${NC} Downloading MCP-7 agent..."
curl -sSL -o "$AGENT_DIR/mcp-7.md" "$GITHUB_REPO/.claude/agents/mcp-7.md" || {
    echo -e "${RED}Failed to download MCP-7 agent${NC}"
    exit 1
}

# Download knowledge base
echo -e "${GREEN}→${NC} Downloading MCP knowledge catalog..."
curl -sSL -o "$KNOWLEDGE_DIR/mcp-catalog.md" "$GITHUB_REPO/knowledge/mcp-catalog.md" || {
    echo -e "${YELLOW}Warning: Could not download knowledge catalog${NC}"
}

# Create a project marker file
echo -e "${GREEN}→${NC} Creating project configuration..."
cat > ".claude/mcp-7.config" << EOF
{
  "version": "1.0.0",
  "installed": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "agent": "mcp-7",
  "purpose": "MCP Service Orchestration"
}
EOF

# Check for existing CLAUDE.md
if [ ! -f ".claude/CLAUDE.md" ]; then
    echo -e "${GREEN}→${NC} Creating CLAUDE.md context file..."
    cat > ".claude/CLAUDE.md" << 'EOF'
# Project Context

## MCP-7 Agent Installed
This project has MCP-7 installed for intelligent MCP service recommendations.

To use MCP-7:
1. Ask Claude to "use the MCP-7 agent to analyze this project"
2. Provide your project requirements or goals
3. Get optimized MCP recommendations with 30-50% time savings

## Available Commands
- Analyze project for MCP recommendations
- Quick assessment of top 3 MCPs
- Interactive discovery mode for detailed analysis
EOF
else
    echo -e "${YELLOW}→${NC} CLAUDE.md already exists, skipping..."
fi

# Verify installation
if [ -f "$AGENT_DIR/mcp-7.md" ]; then
    echo ""
    echo -e "${GREEN}✅ MCP-7 Agent successfully installed!${NC}"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Open this project in Claude"
    echo "2. Say: 'Use the MCP-7 agent to analyze my project'"
    echo "3. Get MCP recommendations that reduce delivery time by 30-50%"
    echo ""
    echo -e "${GREEN}Files installed:${NC}"
    echo "  • $AGENT_DIR/mcp-7.md"
    [ -f "$KNOWLEDGE_DIR/mcp-catalog.md" ] && echo "  • $KNOWLEDGE_DIR/mcp-catalog.md"
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