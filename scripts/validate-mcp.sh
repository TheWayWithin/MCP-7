#!/bin/bash

# MCP Service Validation Script
# Validates MCP configuration and connections

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*)    OS="macos";;
        Linux*)     OS="linux";;
        MINGW*|MSYS*|CYGWIN*) OS="windows";;
        *)          OS="unknown";;
    esac
}

# Get config file path based on OS
get_config_path() {
    # Check for new config.json first, fall back to old name
    case "$OS" in
        macos)
            if [ -f "$HOME/Library/Application Support/Claude/config.json" ]; then
                echo "$HOME/Library/Application Support/Claude/config.json"
            else
                echo "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
            fi
            ;;
        linux)
            if [ -f "$HOME/.config/Claude/config.json" ]; then
                echo "$HOME/.config/Claude/config.json"
            else
                echo "$HOME/.config/Claude/claude_desktop_config.json"
            fi
            ;;
        windows)
            if [ -f "$APPDATA/Claude/config.json" ]; then
                echo "$APPDATA/Claude/config.json"
            else
                echo "$APPDATA/Claude/claude_desktop_config.json"
            fi
            ;;
        *)
            echo ""
            ;;
    esac
}

# Check if config file exists
check_config_exists() {
    local config_path="$1"
    if [ -f "$config_path" ]; then
        echo -e "${GREEN}✓${NC} Config file found at: $config_path"
        return 0
    else
        echo -e "${RED}✗${NC} Config file not found at: $config_path"
        echo -e "${YELLOW}→${NC} Creating default config..."
        mkdir -p "$(dirname "$config_path")"
        echo '{"mcpServers":{}}' > "$config_path"
        return 1
    fi
}

# Validate JSON syntax
validate_json() {
    local config_path="$1"
    if python -m json.tool "$config_path" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Valid JSON syntax"
        return 0
    else
        echo -e "${RED}✗${NC} Invalid JSON syntax in config file"
        echo -e "${YELLOW}→${NC} Error details:"
        python -m json.tool "$config_path" 2>&1 | grep -v "^Expecting" | head -5
        return 1
    fi
}

# Check installed MCP services
check_mcp_services() {
    local config_path="$1"
    echo -e "\n${BLUE}Configured MCP Services:${NC}"
    
    if [ -f "$config_path" ]; then
        # Parse JSON and list services (handle both old and new formats)
        python3 -c "
import json
import sys

try:
    with open('$config_path', 'r') as f:
        config = json.load(f)
        # Check for new format (mcp.servers) or old format (mcpServers)
        services = config.get('mcp', {}).get('servers', {})
        if not services:
            services = config.get('mcpServers', {})
        
        if not services:
            print('  No MCP services configured')
        else:
            for name, details in services.items():
                cmd = details.get('command', 'unknown')
                print(f'  • {name}: {cmd}')
except Exception as e:
    print(f'  Error reading config: {e}')
"
    fi
}

# Check npm packages
check_npm_packages() {
    echo -e "\n${BLUE}Checking MCP npm packages:${NC}"
    
    local packages=(
        "@modelcontextprotocol/server-github"
        "@modelcontextprotocol/server-filesystem"
        "@anthropic/mcp-tools"
    )
    
    for package in "${packages[@]}"; do
        if npm list -g "$package" --depth=0 > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $package installed"
        else
            echo -e "  ${YELLOW}○${NC} $package not installed"
        fi
    done
}

# Check environment variables
check_env_vars() {
    local config_path="$1"
    echo -e "\n${BLUE}Checking required environment variables:${NC}"
    
    python3 -c "
import json
import os

try:
    with open('$config_path', 'r') as f:
        config = json.load(f)
        services = config.get('mcpServers', {})
        
        for name, details in services.items():
            env_vars = details.get('env', {})
            for var_name, var_value in env_vars.items():
                if 'TOKEN' in var_name or 'KEY' in var_name:
                    if var_value and var_value != 'REPLACE_WITH_YOUR_TOKEN':
                        print(f'  ✓ {name}: {var_name} is configured')
                    else:
                        print(f'  ✗ {name}: {var_name} needs configuration')
except Exception as e:
    print(f'  Error checking env vars: {e}')
"
}

# Test MCP connections
test_connections() {
    echo -e "\n${BLUE}Testing MCP connections:${NC}"
    echo -e "${YELLOW}Note:${NC} Connection tests require Claude Desktop to be running"
    
    # Check if Claude is running
    if pgrep -x "Claude" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Claude Desktop is running"
    else
        echo -e "  ${YELLOW}!${NC} Claude Desktop is not running - start it to test connections"
    fi
}

# Generate connection report
generate_report() {
    local config_path="$1"
    echo -e "\n${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${BLUE}       MCP Validation Report${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    
    local issues=0
    
    # Check config exists
    if ! check_config_exists "$config_path"; then
        ((issues++))
    fi
    
    # Validate JSON
    if [ -f "$config_path" ]; then
        if ! validate_json "$config_path"; then
            ((issues++))
        fi
    fi
    
    # Show configured services
    check_mcp_services "$config_path"
    
    # Check npm packages
    check_npm_packages
    
    # Check environment variables
    check_env_vars "$config_path"
    
    # Test connections
    test_connections
    
    # Summary
    echo -e "\n${BLUE}Summary:${NC}"
    if [ $issues -eq 0 ]; then
        echo -e "${GREEN}✓ MCP configuration is valid${NC}"
        echo -e "\n${GREEN}Next steps:${NC}"
        echo "1. Restart Claude Desktop to load MCP services"
        echo "2. Open a new conversation"
        echo "3. Type: 'Show available MCP commands'"
    else
        echo -e "${YELLOW}⚠ Found $issues issue(s) that need attention${NC}"
        echo -e "\n${YELLOW}To fix:${NC}"
        echo "1. Review the issues above"
        echo "2. Update claude_desktop_config.json as needed"
        echo "3. Run this validation script again"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}MCP Service Validation Tool${NC}"
    echo -e "${BLUE}═══════════════════════════${NC}\n"
    
    # Detect OS
    detect_os
    echo -e "Detected OS: ${GREEN}$OS${NC}"
    
    # Get config path
    CONFIG_PATH=$(get_config_path)
    if [ -z "$CONFIG_PATH" ]; then
        echo -e "${RED}Error: Unknown operating system${NC}"
        exit 1
    fi
    
    # Generate report
    generate_report "$CONFIG_PATH"
}

# Run main function
main