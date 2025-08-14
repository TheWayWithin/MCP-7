# CLAUDE.md - Project Context & Requirements 🤖

## PROJECT: MCP-7 Intelligent Service Orchestration Agent

### OVERVIEW
Building an intelligent agent that analyzes project plans and automatically recommends optimal MCP services to improve project quality and reduce delivery time by 30-50%.

### CURRENT STATUS
- **Phase**: Foundation & Setup (Phase 1)
- **Week**: 1 of 6
- **Progress**: See `progress.md` for real-time status
- **Plan**: See `project-plan.md` for detailed milestones

### CRITICAL REQUIREMENTS ⚠️

#### MANDATORY UPDATE PROTOCOL
**YOU MUST UPDATE THE FOLLOWING AFTER EACH MILESTONE OR PHASE COMPLETION:**

1. **`project-plan.md`** - Mark completed items with [x]
2. **`progress.md`** - Add detailed status, insights, and learnings

**Update Triggers**:
- ✅ Completing any milestone (e.g., Milestone 1.1, 1.2, etc.)
- ✅ Completing any phase (e.g., Phase 1, Phase 2, etc.)
- ✅ Encountering blockers or risks
- ✅ Making key decisions or architecture changes
- ✅ Weekly progress reviews

**Update Format**:
```markdown
### [DATE] - [Milestone/Phase Name]
**Completed**:
- ✅ [Specific task completed]
- ✅ [Another task completed]

**Insights**:
- [What was learned]
- [Technical decisions made]

**Next Actions**:
- [Immediate next steps]
```

### PROJECT STRUCTURE

```
mcp-7/
├── project-plan.md      # Master plan with checkpoints (UPDATE REQUIRED)
├── progress.md          # Real-time progress tracking (UPDATE REQUIRED)
├── CLAUDE.md           # This file - project context
├── agents/             # Agent prompts and interfaces
│   ├── mcp-7.md       # Primary agent prompt
│   ├── coordinator-interface.md
│   └── standalone.md
├── knowledge/          # Service mappings and catalogs
│   ├── mcp-mappings.yaml
│   ├── service-catalog.json
│   └── impact-data.yaml
├── scripts/            # Automation scripts
│   ├── install.sh
│   ├── validate.sh
│   └── deploy.sh
├── tests/              # Test suites and validation
├── docs/               # User documentation
└── examples/           # Use case examples
```

### KEY INTEGRATIONS
- **Agent-11**: Coordinator interface for multi-agent workflows
- **Empire-11**: Enterprise coordinator integration
- **MCP-11 Library**: Service catalog and installation hooks
- **Claude Code**: Development environment compatibility

### SUCCESS CRITERIA
1. **Accuracy**: >85% correct service recommendations
2. **Performance**: <2 second response times
3. **Time Savings**: 30-50% reduction in MCP setup time
4. **Quality**: Zero critical bugs in production
5. **Adoption**: >50% usage in coordinator workflows

### TECHNICAL CONSTRAINTS
- Must integrate with existing Agent-11/Empire-11 systems
- Must support batch processing for multiple projects
- Must maintain context across sessions
- Must provide confidence scores for recommendations
- Must support both standalone and integrated modes

### CURRENT FOCUS AREAS

#### Phase 1: Foundation (Current)
- [ ] Repository structure setup
- [ ] Development environment configuration
- [ ] Technical architecture design
- [ ] CI/CD pipeline setup

#### Immediate Priorities
1. Complete repository structure per PRD
2. Set up testing framework
3. Define data flow architecture
4. Create integration interfaces

### TEAM ASSIGNMENTS
- **@architect**: System design, architecture
- **@developer**: Implementation, integrations
- **@tester**: Quality assurance
- **@documenter**: Documentation
- **@operator**: DevOps, deployment
- **@strategist**: Requirements, planning

### REMINDERS FOR CLAUDE

1. **Always check `progress.md`** before starting work
2. **Update tracking documents** after completing milestones
3. **Follow existing code patterns** in the repository
4. **Test all changes** before marking complete
5. **Document key decisions** in progress.md
6. **Verify integrations** with MCP-11, Agent-11, Empire-11
7. **Maintain backward compatibility** with existing systems

### COMMANDS & WORKFLOWS

#### Check Project Status
```bash
cat progress.md  # View current progress
cat project-plan.md  # View planned milestones
```

#### Update Progress (MANDATORY)
```bash
# After completing a milestone:
# 1. Update project-plan.md with [x] for completed items
# 2. Add detailed entry to progress.md with date, status, insights
```

#### Run Tests
```bash
./scripts/validate.sh  # Run validation suite
npm test  # Run unit tests (when available)
```

### ESCALATION PROTOCOL
If blocked on any task:
1. Document blocker in `progress.md`
2. Update risk register in `project-plan.md`
3. Request assistance from appropriate specialist
4. Continue with parallel tasks if possible

### QUALITY GATES
Before marking any milestone complete:
- [ ] All checklist items completed
- [ ] Tests passing (when applicable)
- [ ] Documentation updated
- [ ] Progress tracking updated
- [ ] No critical issues outstanding

---
*This document provides essential context for Claude when working on the MCP-7 project*
*Last Updated: 2025-08-14*