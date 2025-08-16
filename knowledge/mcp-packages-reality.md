# MCP Packages - Real World Reference

## VERIFIED WORKING MCP PACKAGES (as of 2025-08-16)

### File & Code Management
```bash
# Filesystem - OFFICIAL
@modelcontextprotocol/server-filesystem

# Git - COMMUNITY
@cyanheads/git-mcp-server

# GitHub - COMMUNITY
github-mcp-custom
```

### Web & Browser
```bash
# Firecrawl - COMMUNITY
firecrawl-mcp

# Playwright - OFFICIAL
@playwright/mcp@latest

# Puppeteer - COMMUNITY
puppeteer-mcp-server
```

### Design & Development
```bash
# Figma - COMMUNITY
figma-developer-mcp
# Alternative: figma-mcp

# Supabase - OFFICIAL
@supabase/mcp-server-supabase@latest
```

### Infrastructure
```bash
# Railway - OFFICIAL (but may not exist)
@modelcontextprotocol/server-railway

# Context7/Upstash - OFFICIAL
@upstash/context7-mcp@latest
```

## PACKAGES THAT DON'T EXIST (Common Mistakes)
```bash
# These are often mentioned but DON'T exist:
@modelcontextprotocol/server-npm  # DOESN'T EXIST
@modelcontextprotocol/server-github  # Use github-mcp-custom instead
@modelcontextprotocol/server-docker  # DOESN'T EXIST
```

## CONFIG FILE LOCATIONS

### Current (Claude Desktop 2024+)
```
macOS: ~/Library/Application Support/Claude/config.json
Windows: %APPDATA%\Claude\config.json
Linux: ~/.config/Claude/config.json
```

### Legacy (Older documentation)
```
macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
```

## CONFIG STRUCTURE (Current)
```json
{
  "mcp": {
    "servers": {
      "service-name": {
        "command": "npx",
        "args": ["-y", "package-name"],
        "env": {
          "API_KEY": "value"
        }
      }
    }
  }
}
```

## VALIDATION BEFORE INSTALLATION

Always verify package exists:
```bash
# Check if package exists on npm
npm view [package-name] > /dev/null 2>&1 && echo "EXISTS" || echo "NOT FOUND"

# Search for MCP packages
npm search mcp --json | jq '.[] | .name' | grep -i mcp
```

## COMMON ERRORS & FIXES

### Error: E404 Package Not Found
**Cause**: Package doesn't exist on npm
**Fix**: Search for alternative package names or community versions

### Error: Config not loading
**Cause**: Using wrong config file name/location
**Fix**: Use `config.json` not `claude_desktop_config.json`

### Error: MCP not showing after restart
**Cause**: Invalid JSON in config file
**Fix**: Validate JSON syntax before saving

## TESTING MCP INSTALLATION

```bash
# 1. Validate JSON syntax
python3 -m json.tool ~/Library/Application\ Support/Claude/config.json

# 2. Check if service will run
npx -y [package-name] --version

# 3. After restart, test in Claude
"Show available MCP services"
```